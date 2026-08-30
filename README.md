# Vinyl Collection MVP

Личный веб-сервис для коллекции винила с импортом из Discogs, хранением обложек и законно полученных MP3, фильтрами, плейлистами и современным музыкальным интерфейсом.

## Стек

- Backend: NestJS + Prisma + PostgreSQL
- Frontend: Next.js App Router + TypeScript
- Storage: локальный диск для MP3, обложек, галереи и аватаров
- Local dev: Docker Compose
- Future deploy: VPS + Docker Compose + Nginx

## Структура

```text
apps/
  backend/      # NestJS API + Prisma + Discogs + S3
  frontend/     # Next.js UI + mini-player + waveform
  mobile/       # Expo React Native APK MVP
infra/
  nginx/
docker-compose.yml
.env.example
README.md
```

## Быстрый старт

1. Скопируйте `.env.example` в `.env` и заполните переменные.
2. Запустите:

```bash
docker compose up --build
```

3. Frontend: `http://localhost:3000`
4. Backend API: `http://localhost:3001/api`

`API_URL_INTERNAL` используется frontend-контейнером для SSR-запросов к backend внутри Docker-сети.

Для локальной установки зависимостей вне Docker:

```bash
npm install --prefix apps/backend
npm install --prefix apps/frontend
npm install --prefix apps/mobile
```

Мобильный MVP:

```bash
npm run mobile
```

## MVP-возможности

- импорт коллекции Discogs с upsert без дублей;
- хранение релизов, треков, обложек, аудиофайлов и плейлистов;
- загрузка MP3, обложек и аватаров на локальный диск сервера;
- фильтры по артисту, релизу, треку, жанру, стилю, BPM, тональности, аудио;
- мини-плеер и waveform на странице релиза;
- подготовка к деплою на VPS.

## Что уже реализовано

- `POST /api/discogs/sync` для синхронизации коллекции Discogs;
- `GET /api/releases` и `GET /api/releases/:id` для каталога и страницы релиза;
- `POST /api/audio/upload` и `DELETE /api/audio/:id` для ручной загрузки MP3;
- `GET /api/playlists`, `GET /api/playlists/:id`, `POST /api/playlists`;
- Prisma schema для `User`, `Release`, `Track`, `CollectionItem`, `Image`, `AudioFile`, `Playlist`, `PlaylistItem`, `TrackStoreLink`;
- сохранение аудио и изображений в `data/storage` с безопасной генерацией ключей;
- русскоязычный тёмный интерфейс с grid-каталогом, страницей релиза, мини-плеером и waveform через `wavesurfer.js`.

## Переменные окружения

См. `.env.example`.

## Локальное файловое хранилище

По умолчанию `STORAGE_DRIVER=local`. Docker подключает каталог
`./data/storage` с компьютера к `/data/storage` внутри backend-контейнера.
MP3, обложки, галерея и аватары переживают пересборку и удаление контейнеров.
Каталог исключён из Git.

Для публикации задайте внешний адрес backend, например:

```env
BACKEND_PUBLIC_URL=https://mityadima.ru
```

Чтобы временно вернуть S3 для всех файлов, установите `STORAGE_DRIVER=s3` и
заполните переменные Selectel.

Для однократного переноса файлов из прежнего S3 в локальное хранилище:

```bash
docker compose -f docker-compose.prod.yml exec backend npm run storage:migrate-local
```

Мигратор берёт ключи из PostgreSQL, пропускает существующие локальные файлы и
может безопасно запускаться повторно.

## Продакшн позже

- поставить Docker и Docker Compose на VPS Selectel;
- прокинуть `.env`;
- собрать `apps/backend/Dockerfile` и `apps/frontend/Dockerfile`;
- поднять `frontend`, `backend`, `postgres`;
- добавить Nginx как reverse proxy для `frontend` и `backend` через `infra/nginx/nginx.conf.example`;
- при необходимости можно вернуть Selectel S3 через `STORAGE_DRIVER=s3`.

## Важно

Проект не включает пиратское скачивание аудио, обход платных сервисов или нелегальные источники музыки. Поддерживается только ручная загрузка законно полученных MP3.
