#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"
exec 9> /tmp/vinyl-deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then
  echo 'STOP: working tree is not clean. Save changes in Git before deploying.'
  exit 1
fi
branch="${VINYL_DEPLOY_BRANCH:-codex/playlist-drop-gaps}"
git fetch origin "$branch"
target="$(git rev-parse --verify "${1:-FETCH_HEAD}^{commit}")"
git merge-base --is-ancestor "$target" FETCH_HEAD || { echo 'STOP: commit is not in the fetched deployment branch'; exit 1; }
previous_commit="$(git rev-parse HEAD)"
if ! git diff --quiet "$previous_commit" "$target" -- apps/backend/prisma/schema.prisma; then
  echo 'STOP: database schema changed. Plan and back up the database migration separately.'
  exit 1
fi
backup="${VINYL_BACKUP_ROOT:-/root/vinyl-backups}/git-deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup"
printf '%s\n' "$previous_commit" > "$backup/previous-commit.txt"
printf '%s\n' "$target" > "$backup/target-commit.txt"
cp docker-compose.prod.yml "$backup/previous-compose.yml"
for service in backend frontend; do
  image="$(docker inspect -f '{{.Image}}' "vinyl-$service")"
  docker image tag "$image" "vinyl-$service:before-${backup##*/}"
done
switched=false
rollback() {
  status=$?
  trap - ERR
  set +e
  docker image tag "vinyl-backend:before-${backup##*/}" vinyl-backend-prod
  docker image tag "vinyl-frontend:before-${backup##*/}" vinyl-frontend-prod
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo 'WARNING: concurrent source edits detected; source checkout left untouched'
  else
    git switch --detach "$previous_commit"
  fi
  if [ "$switched" = true ]; then
    docker compose -f "$backup/previous-compose.yml" --project-directory "$PWD" -p vinyl up -d --no-deps --no-build --wait --wait-timeout 240 backend frontend
  fi
  echo "DEPLOY_FAILED: inspect rollback status. Backup: $backup"
  exit "$status"
}
trap rollback ERR
git switch --detach "$target"
export SOURCE_REVISION="$target"
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml build backend frontend
switched=true
docker compose -f docker-compose.prod.yml up -d --no-deps --no-build --wait --wait-timeout 240 backend frontend
curl -fsS --retry 3 --retry-delay 2 --max-time 30 http://127.0.0.1:3001/api/health
for route in / /about /privacy /consent '/mixes?layout=tracks' '/tracks?layout=tracks'; do
  curl -fsS --retry 2 --retry-delay 2 --max-time 45 "https://mityadima.ru$route" -o /dev/null
done
for service in backend frontend; do
  revision="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "vinyl-$service")"
  test "$revision" = "$target"
done
test -z "$(git status --porcelain --untracked-files=normal)"
trap - ERR
echo
echo "DEPLOY_COMPLETE commit=$target backup=$backup"
