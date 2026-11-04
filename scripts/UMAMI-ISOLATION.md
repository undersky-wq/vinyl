# Isolate the existing VPS Umami database user

Run `python3 /root/isolate-umami-db.py` on the VPS as root after copying
`scripts/isolate-umami-db.py` there. The default project root is `/root/vinyl`.
Do not run this production migration on Windows or against a different cluster.

The script expects the currently running Umami service to use the `postgres`
login and the `umami` database on `vinyl-postgres` (PostgreSQL 16). It verifies
the running configuration against both compose files before making changes.
It refuses existing `umami_app` roles, unexpected schemas, changed image tags,
or existing isolation rules rather than guessing how to repair them.

## Changes

- Stops/recreates only Umami. Does not stop PostgreSQL, frontend, or backend.
- Saves a private database dump, original ownership commands, PostgreSQL HBA,
  compose files, `.env`, and container settings under `/root/vinyl-backups`.
  Backups contain credentials: do not publish them or put them in Git.
- Creates `umami_app` with a random password and without elevated role flags
  or role memberships. Existing `postgres` credentials are not changed.
- Transfers ownership of the Umami database and its public application objects
  only. Extension objects are excluded. Never uses `REASSIGN OWNED BY postgres`,
  which could transfer other databases or shared objects.
- Adds first-match HBA rules permitting this login only in `umami`, rejecting
  all other databases and replication. Other users' HBA rules are preserved.
  This also addresses CONNECT rights inherited from PUBLIC.
- Saves the generated URL as `UMAMI_DATABASE_URL` in `.env` (mode 0600) and
  replaces the superuser URL in the primary compose file with a required variable.
  Preserves the existing loopback port override and does not pull an image.
- Verifies read/write/DDL access, rejects connections to other databases,
  verifies role flags and the running container URL, then waits for HTTP 200.

On ordinary command failures, the script restores files, HBA and original
ownership, disables the newly created login, and recreates the previous Umami
configuration. It never drops or restores-over the database. Power loss or a
killed process can interrupt automatic recovery: retain the printed backup path.
A failed run may leave a disabled role behind; review it before rerunning.

## After running

Expected final output starts with `UMAMI_ISOLATION_COMPLETE`. Check the statistics
dashboard, a new consented visit, `https://stats.mityadima.ru/script.js`, and the
website health endpoint. Analytics pauses briefly during the migration.

Keep the primary compose change in future deployments; never restore the old
superuser URL. Continue to use both compose files when recreating Umami:

```sh
docker compose -f docker-compose.prod.yml -f docker-compose.umami-local.yml up -d --no-deps umami
```

Do not commit `.env`, generated passwords, database dumps, or container settings.
The one-off `umami-db-init` job still uses an administrator to create a missing
database; it is not part of Umami runtime and is not started by this migration.

## Local verification

`python scripts/test-umami-isolation.py` runs core permission/ownership and
rollback tests in a new, labelled PostgreSQL 16 container with temporary data,
no published ports, and no mounts of production data. That container is removed
afterwards. This is not a substitute for running and verifying the VPS migration.
