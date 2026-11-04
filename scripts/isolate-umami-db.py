#!/usr/bin/env python3
"""One-time, backed-up migration of the existing VPS Umami database login."""

import argparse
import datetime
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
from urllib.parse import urlparse


ROLE = "umami_app"
DATABASE = "umami"
OLD_URL = "postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@postgres:5432/umami"
NEW_URL = "${UMAMI_DATABASE_URL:?Run scripts/isolate-umami-db.py to configure a dedicated database user}"
HBA_RULES = """# BEGIN vinyl Umami isolation
local umami umami_app scram-sha-256
local all umami_app reject
local replication umami_app reject
host umami umami_app 0.0.0.0/0 scram-sha-256
host all umami_app 0.0.0.0/0 reject
host replication umami_app 0.0.0.0/0 reject
host umami umami_app ::/0 scram-sha-256
host all umami_app ::/0 reject
host replication umami_app ::/0 reject
# END vinyl Umami isolation
"""


def owner_commands():
    # Do not REASSIGN OWNED BY postgres: it also changes shared database owners.
    return """
SELECT format('ALTER DATABASE %I OWNER TO %I;', datname, pg_get_userbyid(datdba))
FROM pg_database WHERE datname = current_database();
SELECT format('ALTER SCHEMA %I OWNER TO %I;', nspname, pg_get_userbyid(nspowner))
FROM pg_namespace WHERE nspname = 'public';
SELECT format('ALTER %s %I.%I OWNER TO %I;',
  CASE c.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
  n.nspname, c.relname, pg_get_userbyid(c.relowner))
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','S','v','m','f')
AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass
  AND d.objid = c.oid AND d.deptype = 'e')
ORDER BY CASE WHEN c.relkind = 'S' THEN 1 ELSE 0 END;
SELECT format('ALTER %s %I.%I OWNER TO %I;',
  CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END,
  n.nspname, t.typname, pg_get_userbyid(t.typowner))
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype IN ('e','d')
AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_type'::regclass
  AND d.objid = t.oid AND d.deptype = 'e');
SELECT format('ALTER %s %I.%I(%s) OWNER TO %I;',
  CASE p.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,
  n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_userbyid(p.proowner))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass
  AND d.objid = p.oid AND d.deptype = 'e');
"""


def replace_owners(commands):
    import re
    lines = [line for line in commands.splitlines() if line.strip()]
    if not lines or not lines[0].startswith('ALTER DATABASE umami OWNER TO '):
        raise RuntimeError('Unexpected ownership snapshot; no changes applied.')
    return '\n'.join(re.sub(r' OWNER TO (?:"(?:[^"]|"")*"|[^;]+);$',
                            f' OWNER TO {ROLE};', line) for line in lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='/root/vinyl')
    args = parser.parse_args()
    if os.name != 'posix' or os.geteuid() != 0:
        raise RuntimeError('Run with python3 as root on the VPS, not on Windows.')
    os.umask(0o077)
    root = Path(args.root).resolve()
    compose = root / 'docker-compose.prod.yml'
    override = root / 'docker-compose.umami-local.yml'
    env = root / '.env'
    for file in (compose, override, env):
        if not file.is_file() or file.is_symlink():
            raise RuntimeError(f'Expected a regular file: {file}')
    password = secrets.token_hex(32)
    process_env = os.environ.copy()

    def run(command, data=None, check=True):
        result = subprocess.run(command, input=data, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, cwd=root, env=process_env)
        if check and result.returncode:
            message = result.stderr.decode(errors='replace').replace(password, '[REDACTED]')
            raise RuntimeError(f'Command failed ({command[0]}): {message[-2000:]}')
        return result

    def sql(query, database='postgres'):
        return run(['docker', 'exec', '-i', 'vinyl-postgres', 'psql', '-X', '-qAt',
                    '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database],
                   query.encode()).stdout.decode().strip()

    def role_sql(database, query='SELECT 1;', check=True):
        # Password is supplied over stdin, not exposed in process arguments.
        return run(['docker', 'exec', '-i', 'vinyl-postgres', 'sh', '-c',
                    'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -X -qAt '
                    '-v ON_ERROR_STOP=1 -h 127.0.0.1 -U umami_app -d "$1" -c "$2"',
                    'sh', database, query], (password + '\n').encode(), check)

    dc = ['docker', 'compose', '-f', str(compose), '-f', str(override)]
    current = json.loads(run(['docker', 'inspect', 'vinyl-umami']).stdout)[0]
    current_env = dict(item.split('=', 1) for item in current['Config']['Env'] if '=' in item)
    url = urlparse(current_env.get('DATABASE_URL', ''))
    if (url.username, url.hostname, url.path) != ('postgres', 'postgres', '/umami'):
        raise RuntimeError('Umami no longer uses the expected postgres login. Stop and inspect.')
    if not current['State']['Running']:
        raise RuntimeError('Umami must be running before this migration.')
    image = json.loads(run(['docker', 'image', 'inspect', current['Config']['Image']]).stdout)[0]
    if image['Id'] != current['Image']:
        raise RuntimeError('The Umami image tag changed. Stop: this migration must not upgrade the application.')
    # Also support a checkout that already requires the new variable but has
    # not yet generated it. Explicit values prevent shell overrides of .env.
    process_env['UMAMI_DATABASE_URL'] = current_env['DATABASE_URL']
    if sql("SELECT count(*) FROM pg_roles WHERE rolname='umami_app';") != '0':
        raise RuntimeError('Role umami_app already exists. Stop and inspect; do not rotate its password blindly.')
    if sql("SELECT count(*) FROM pg_namespace WHERE nspname !~ '^pg_' "
           "AND nspname NOT IN ('public','information_schema');", DATABASE) != '0':
        raise RuntimeError('Unexpected non-public schemas in Umami. Manual review is required.')
    before = compose.read_bytes()
    text = before.decode()
    if text.count(OLD_URL) != 1 and text.count(NEW_URL) != 1:
        raise RuntimeError('Unexpected compose database URL; no files changed.')
    rendered = json.loads(run(dc + ['config', '--format', 'json']).stdout)
    if rendered['services']['umami']['environment']['DATABASE_URL'] != current_env['DATABASE_URL']:
        raise RuntimeError('Compose differs from running Umami; stop and inspect.')
    pg_version = sql('SHOW server_version_num;')
    if not pg_version.startswith('16'):
        raise RuntimeError('This script was prepared for PostgreSQL 16.')
    hba = sql('SHOW hba_file;')
    if not hba.startswith('/') or '\n' in hba:
        raise RuntimeError('Unexpected PostgreSQL HBA path.')
    hba_before = run(['docker', 'exec', 'vinyl-postgres', 'cat', hba]).stdout
    if b'BEGIN vinyl Umami isolation' in hba_before:
        raise RuntimeError('Isolation rules already exist. Stop and inspect.')
    ownership = sql(owner_commands(), DATABASE)
    new_ownership = replace_owners(ownership)
    other_databases = sql("SELECT datname FROM pg_database WHERE datallowconn "
                          "AND datname <> 'umami' ORDER BY datname;").splitlines()
    backup = Path('/root/vinyl-backups') / ('umami-isolation-' +
              datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3))
    backup.mkdir(parents=True, mode=0o700)
    (backup / 'compose.yml').write_bytes(before)
    (backup / 'umami-local.yml').write_bytes(override.read_bytes())
    (backup / 'env').write_bytes(env.read_bytes())
    (backup / 'pg_hba.conf').write_bytes(hba_before)
    (backup / 'restore-owners.sql').write_text(ownership + '\n')
    (backup / 'container.json').write_bytes(json.dumps(current).encode())
    print(f'Private backup: {backup}', flush=True)

    def write_hba(content):
        run(['docker', 'exec', '-i', 'vinyl-postgres', 'sh', '-c', 'cat > "$1"',
             'sh', hba], content)

    changed = False
    try:
        # Stop only the analytics writer so the dump and ownership change agree.
        changed = True
        run(dc + ['stop', 'umami'])
        with (backup / 'umami.dump').open('wb') as dump:
            result = subprocess.run(['docker', 'exec', 'vinyl-postgres', 'pg_dump',
                                     '-U', 'postgres', '-Fc', DATABASE], stdout=dump,
                                    stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Umami backup failed. No database changes applied.')
        sql("BEGIN; SET LOCAL password_encryption='scram-sha-256'; "
            f"CREATE ROLE {ROLE} LOGIN PASSWORD '{password}' NOSUPERUSER NOCREATEDB "
            "NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n" + new_ownership + '\nCOMMIT;', DATABASE)
        write_hba(HBA_RULES.encode() + hba_before)
        if sql('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;') != '0':
            raise RuntimeError('HBA validation failed.')
        sql('SELECT pg_reload_conf();')
        time.sleep(1)
        role_sql(DATABASE, 'BEGIN; CREATE TABLE public.__umami_isolation_probe(id integer); '
                 'INSERT INTO public.__umami_isolation_probe VALUES (1); '
                 'SELECT count(*) FROM public.__umami_isolation_probe; ROLLBACK;')
        for database in other_databases:
            result = role_sql(database, check=False)
            if result.returncode == 0 or b'pg_hba.conf rejects connection' not in result.stderr:
                raise RuntimeError('Other-database isolation check failed.')
        permissions = sql("SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication "
                          "OR rolbypassrls OR EXISTS (SELECT 1 FROM pg_auth_members "
                          "WHERE member=pg_roles.oid) FROM pg_roles WHERE rolname='umami_app';")
        if permissions != 'f':
            raise RuntimeError('Unexpected elevated permissions.')
        connection = f'postgresql://{ROLE}:{password}@postgres:5432/{DATABASE}'
        env_lines = env.read_text().splitlines()
        env_lines = [line for line in env_lines if not line.startswith('UMAMI_DATABASE_URL=')]
        env.write_text('\n'.join(env_lines) + '\nUMAMI_DATABASE_URL=' + connection + '\n')
        os.chmod(env, 0o600)
        compose.write_text(text.replace(OLD_URL, NEW_URL))
        process_env['UMAMI_DATABASE_URL'] = connection
        configured = json.loads(run(dc + ['config', '--format', 'json']).stdout)
        if configured['services']['umami']['environment']['DATABASE_URL'] != connection:
            raise RuntimeError('An override replaced the isolated database URL.')
        # Never start dependencies: the old initialization job uses postgres.
        run(dc + ['up', '-d', '--no-deps', '--pull', 'never', 'umami'])
        for _ in range(60):
            result = run(['curl', '-sS', '-o', '/dev/null', '--max-time', '3',
                          '-w', '%{http_code}', 'http://127.0.0.1:3010/'], check=False)
            if result.returncode == 0 and result.stdout == b'200':
                break
            time.sleep(2)
        else:
            raise RuntimeError('Umami did not become ready; restoring previous configuration.')
        actual = json.loads(run(['docker', 'inspect', 'vinyl-umami']).stdout)[0]
        actual_env = dict(item.split('=', 1) for item in actual['Config']['Env'] if '=' in item)
        if actual_env.get('DATABASE_URL') != connection:
            raise RuntimeError('Running container does not use the isolated login.')
        # A role lock alone would not end sessions opened before HBA was reloaded.
        if sql("SELECT count(*) FROM pg_stat_activity WHERE usename='umami_app' "
               "AND datname IS DISTINCT FROM 'umami';") != '0':
            raise RuntimeError('Unexpected cross-database session.')
        print('UMAMI_ISOLATION_COMPLETE: dedicated login; other database connections rejected; HTTP 200.')
        print('The website containers and postgres password were not changed.')
    except BaseException:
        if changed:
            print('Migration failed. Restoring the previous connection and ownership.', file=sys.stderr)
            try:
                run(dc + ['stop', 'umami'], check=False)
                compose.write_bytes(before)
                env.write_bytes((backup / 'env').read_bytes())
                os.chmod(env, 0o600)
                process_env['UMAMI_DATABASE_URL'] = current_env['DATABASE_URL']
                write_hba(hba_before)
                sql('SELECT pg_reload_conf();')
                sql('BEGIN;\n' + ownership + '\nCOMMIT;', DATABASE)
                sql("SELECT format('ALTER ROLE %I NOLOGIN;', rolname) FROM pg_roles "
                    "WHERE rolname='umami_app';\n\\gexec")
                run(dc + ['up', '-d', '--no-deps', '--pull', 'never', 'umami'])
                print('Previous configuration restored; inspect Umami readiness.', file=sys.stderr)
            except BaseException:
                print(f'Automatic recovery incomplete. Keep the backup: {backup}', file=sys.stderr)
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
