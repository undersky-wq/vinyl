#!/usr/bin/env bash
set -Eeuo pipefail
cd /root/vinyl
schema_commit="${1:?Schema-only commit is required}"
target="${2:?Target commit is required}"
test -z "$(git status --porcelain --untracked-files=normal)" || { echo 'STOP: working tree is not clean'; exit 1; }
git fetch origin "${VINYL_DEPLOY_BRANCH:-codex/playlist-drop-gaps}"
schema_commit="$(git rev-parse --verify "$schema_commit^{commit}")"
target="$(git rev-parse --verify "$target^{commit}")"
previous="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$schema_commit" "$target"
git merge-base --is-ancestor "$target" FETCH_HEAD
test "$(git diff --name-only "$previous" "$schema_commit" | sort)" = "$(printf '%s\n' apps/backend/prisma/schema.prisma apps/backend/scripts/migrate-release-labels.sql | sort)" || { echo 'STOP: unexpected schema checkpoint changes'; exit 1; }
original_schema="$(git rev-parse "$previous:apps/backend/prisma/schema.prisma")"
without_labels="$(git show "$schema_commit:apps/backend/prisma/schema.prisma" | sed '/^  labels            String\[\]         @default(\[\])$/d' | git hash-object --stdin)"
test "$original_schema" = "$without_labels" || { echo 'STOP: schema contains changes other than release labels'; exit 1; }
ready="$(docker exec -i vinyl-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1' <<'SQL'
SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Release' AND column_name='labels' AND udt_name='_text' AND is_nullable='NO');
SQL
)"
test "$ready" = t || { echo 'STOP: labels database column must be prepared and backed up separately'; exit 1; }
backup="/root/vinyl-backups/labels-ui-deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
printf '%s\n' "$previous" > "$backup/original-commit.txt"
docker exec vinyl-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl' | gzip > "$backup/database.sql.gz"
gzip -t "$backup/database.sql.gz"
echo "Database backup: $backup/database.sql.gz"
# This checkpoint records the already-applied, backward-compatible labels column.
# Application deployment still uses the normal image backup and rollback path.
git switch --detach "$schema_commit"
if ! bash scripts/deploy-vps.sh "$target"; then
  if [ "$(git rev-parse HEAD)" = "$schema_commit" ] && [ -z "$(git status --porcelain --untracked-files=normal)" ]; then
    git switch --detach "$previous"
  fi
  echo "LABELS_UI_DEPLOY_FAILED backup=$backup"
  exit 1
fi
echo "LABELS_UI_DEPLOY_COMPLETE backup=$backup"
