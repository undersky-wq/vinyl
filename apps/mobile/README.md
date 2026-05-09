# Vinyl Collection Mobile

Expo/React Native MVP for the Vinyl Collection mobile app.

## Why this lives inside the same repo

The mobile app uses the existing backend, PostgreSQL database, S3 covers/audio, playlists, favourites, and release data.

Current layout:

```text
apps/
  backend/   NestJS API
  frontend/  Next.js web app
  mobile/    Expo React Native app
```

## First local run

From the repository root:

```powershell
npm run install:mobile
npm run mobile
```

Then open it with Expo Go on Android/iOS, or run:

```powershell
npm run mobile:android
```

The MVP API URL is configured in `app.json`:

```json
"apiUrl": "https://mityadima.ru/api"
```

For testing against a local backend from a real phone, replace it with your computer LAN IP, for example:

```json
"apiUrl": "http://192.168.0.10:3001/api"
```

## MVP screens

- Home: release grid from `/api/releases?summary=true`.
- Library: playable track feed from `/api/releases/library-feed`.
- Playlists: playlist summaries.
- Favourites: placeholder until mobile auth is implemented.
- Profile: placeholder and auth notes.
- Mini player: UI shell for the future native audio player.

## Next implementation steps

1. Add mobile auth endpoints or token login.
2. Store auth token securely on the device.
3. Replace the temporary mini-player state with `expo-av` playback.
4. Add full-screen player overlay with waveform/seek.
5. Add release detail screen.
6. Add playlist detail screen and favourites.
7. Build APK with EAS Build.

## APK build later

Expo production build normally uses EAS:

```powershell
npm install -g eas-cli
cd apps/mobile
eas build -p android
```

We will configure this only after the MVP runs correctly on the phone through Expo Go.
