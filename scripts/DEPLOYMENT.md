# Production deployment

The deployment branch is `codex/playlist-drop-gaps`. Application source on the
VPS must be a clean checkout of a commit from this branch. Do not edit source
files on the VPS or apply partial patches.

After committing, testing and pushing changes, run on the VPS:

```bash
cd /root/vinyl
bash scripts/deploy-vps.sh
```

To deploy a particular commit from that branch:

```bash
bash scripts/deploy-vps.sh COMMIT
```

The script fetches Git, rejects uncommitted edits, checks for schema changes,
backs up the previous commit, Compose configuration and both container images,
then builds and starts only backend/frontend. It verifies public pages and the
revision label on both running containers. Other containers are not recreated.
On failure it restores the prior images and checkout and attempts to restart
the previous services. Check the returned status and logs after a failure.

Database migrations are intentionally separate: no `prisma db push` runs during
deployment or container startup. A changed Prisma schema stops deployment until
its migration is planned and backed up.

Server-specific `.env`, database/media volumes, Nginx configuration and database
roles are not stored in Git. Keep `UMAMI_DATABASE_URL` pointed at the dedicated
Umami role, never `postgres`. Umami's port is bound to localhost in the production
Compose file; an additional `docker-compose.umami-local.yml` is not required.

Before the first Git-based deployment, archive any old server-only working tree
and untracked source files. Preserve that archive outside the repository until
the unified release has been validated. Never discard a dirty production tree.
