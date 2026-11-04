"""Integration test in a disposable PostgreSQL container without published ports."""

import importlib.util
import json
from pathlib import Path
import secrets
import subprocess
import sys
import time

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('isolate-umami-db.py'))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)
name = 'vinyl-umami-isolation-test-' + secrets.token_hex(5)
password = secrets.token_hex(32)


def run(args, data=None, check=True):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result


def sql(query, database='postgres'):
    return run(['docker', 'exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
                '-U', 'postgres', '-d', database], query.encode()).stdout.decode().strip()


def as_role(database, query='SELECT 1;'):
    return run(['docker', 'exec', '-i', name, 'sh', '-c',
                'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -X -qAt '
                '-v ON_ERROR_STOP=1 -h 127.0.0.1 -U umami_app -d "$1" -c "$2"',
                'sh', database, query], (password + '\n').encode(), False)


created = False
try:
    run(['docker', 'run', '-d', '--name', name, '--label', 'vinyl.umami-isolation-test=1',
         '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_PASSWORD=test-only-password',
         'postgres:16-alpine'])
    created = True
    for _ in range(60):
        if run(['docker', 'exec', name, 'pg_isready', '-U', 'postgres'], check=False).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('Temporary PostgreSQL did not start.')
    sql('CREATE DATABASE umami; CREATE DATABASE website_test;')
    sql("CREATE TYPE event_kind AS ENUM ('view','play'); "
        'CREATE TABLE event(id bigserial PRIMARY KEY, kind event_kind); '
        "INSERT INTO event(kind) VALUES ('view'); "
        'CREATE VIEW events_view AS SELECT * FROM event; '
        'CREATE FUNCTION event_count() RETURNS bigint LANGUAGE sql AS '
        "'SELECT count(*) FROM event'; CREATE EXTENSION pgcrypto;", 'umami')
    other_owners = sql("SELECT datname,pg_get_userbyid(datdba) FROM pg_database "
                       "WHERE datname <> 'umami' ORDER BY datname;")
    owners = sql(migration.owner_commands(), 'umami')
    new_owners = migration.replace_owners(owners)
    assert 'ALTER DATABASE website_test' not in new_owners
    assert 'REASSIGN OWNED' not in new_owners
    assert 'public.digest(' not in new_owners, 'Do not alter extension-owned functions'
    sql("BEGIN; SET LOCAL password_encryption='scram-sha-256'; "
        f"CREATE ROLE umami_app LOGIN PASSWORD '{password}' NOSUPERUSER NOCREATEDB "
        'NOCREATEROLE NOREPLICATION NOBYPASSRLS;\n' + new_owners + '\nCOMMIT;', 'umami')
    hba = sql('SHOW hba_file;')
    original_hba = run(['docker', 'exec', name, 'cat', hba]).stdout
    run(['docker', 'exec', '-i', name, 'sh', '-c', 'cat > "$1"', 'sh', hba],
        migration.HBA_RULES.encode() + original_hba)
    assert sql('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL;') == '0'
    sql('SELECT pg_reload_conf();')
    time.sleep(1)
    result = as_role('umami', "BEGIN; ALTER TABLE event ADD COLUMN note text; "
                     "INSERT INTO event(kind) VALUES ('play'); SELECT count(*) FROM event; "
                     'SELECT event_count(); ROLLBACK;')
    assert result.returncode == 0, result.stderr.decode()
    assert result.stdout.decode().strip() == '2\n2'
    assert sql('SELECT count(*) FROM event;', 'umami') == '1', 'Existing data preserved'
    for database in ('website_test', 'postgres', 'template1'):
        result = as_role(database)
        assert result.returncode != 0
        assert b'pg_hba.conf rejects connection' in result.stderr, result.stderr.decode()
    assert as_role('umami', 'SET ROLE postgres;').returncode != 0
    assert as_role('umami', 'CREATE DATABASE forbidden;').returncode != 0
    assert as_role('umami', "CREATE ROLE forbidden LOGIN;").returncode != 0
    assert as_role('umami', "SELECT pg_read_file('/etc/passwd');").returncode != 0
    assert other_owners == sql("SELECT datname,pg_get_userbyid(datdba) FROM pg_database "
                               "WHERE datname <> 'umami' ORDER BY datname;")
    sql('BEGIN;\n' + owners + '\nCOMMIT;', 'umami')
    assert owners == sql(migration.owner_commands(), 'umami'), 'Ownership rollback restores exact owners'
    run(['docker', 'exec', '-i', name, 'sh', '-c', 'cat > "$1"', 'sh', hba], original_hba)
    sql('SELECT pg_reload_conf(); ALTER ROLE umami_app NOLOGIN;')
    assert sql('SELECT count(*) FROM event;', 'umami') == '1'
    assert sql("SELECT rolcanlogin FROM pg_roles WHERE rolname='umami_app';") == 'f'
    print('PASS: PostgreSQL 16 ownership, migrations/DML, sequence/view/enum/function access, '
          'extension preservation, other database rejection, no privilege escalation, '
          'unmodified website owners/data and ownership rollback.')
finally:
    if created:
        info = json.loads(run(['docker', 'inspect', name]).stdout)[0]
        assert info['Config']['Labels'].get('vinyl.umami-isolation-test') == '1'
        assert not info['HostConfig'].get('PortBindings')
        run(['docker', 'rm', '-f', name])
