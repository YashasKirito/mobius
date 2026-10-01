# Møbius

A personal streaming front-end: browse movies and series from TMDB in a Netflix-style UI, then play them through an embedded player or, when run locally, straight from torrents.

Møbius is a TypeScript monorepo with a React web app, an Express API, and a shared types package. It deploys to Vercel as a static site plus one serverless function.

## Features

- **Browse** — a home screen with a trailer hero and rows for trending, popular, top-rated and now-playing titles, all backed by TMDB.
- **Title details** — a modal overlay with synopsis, trailer and, for series, a season and episode list. The modal has its own URL, so links and refreshes work.
- **Search** — search movies and series by name.
- **Sign-in** — Google sign-in through Firebase Auth; every route except `/login` is protected.
- **Two playback modes**
  - **VidCore** (default) — plays the title in a [vidcore.net](https://vidcore.net) embed. Works everywhere, including the Vercel deployment.
  - **Torrent streaming** (optional, local only) — finds a release through Jackett, streams it through TorrServer, and plays it in the built-in video player.
- **Built-in player** (torrent mode) — keyboard shortcuts, resume from where you left off, a sources drawer to pick a different release, and subtitles from OpenSubtitles with adjustable size, colour, background and position.

## How it fits together

```
apps/web  (React + Vite)  ──  /api/*  ──▶  apps/api  (Express)  ──▶  TMDB
                                                │
                                                ├──▶  Jackett         (torrent search, optional)
                                                ├──▶  TorrServer      (torrent → HTTP stream, optional)
                                                └──▶  OpenSubtitles   (subtitles, optional)
```

The browser only ever talks to the Møbius API, with one exception: in torrent mode the `<video>` element streams directly from TorrServer, so video bytes never pass through Express and seeking uses plain HTTP range requests.

| Path | What it is |
|---|---|
| `apps/web` | React 19 app: routes, auth, streaming UI, video player |
| `apps/api` | Express app: TMDB proxy with caching, catalog endpoints, torrent streaming pipeline |
| `packages/shared` | TypeScript types shared by the web app and the API |
| `api/index.ts` | Vercel serverless entry that wraps the Express app |
| `docs/superpowers` | Design spec and implementation plan for torrent streaming |

## Tech stack

| Area | Tools |
|---|---|
| Web | React 19, Vite 6, React Router 7, TanStack Query 5, Zustand 5, Firebase Auth, lucide-react |
| API | Express 4, pino, lru-cache, fast-xml-parser, parse-torrent-title |
| Tooling | TypeScript 5, Turborepo, npm workspaces, Vitest |
| Hosting | Vercel |

## Getting started

### Prerequisites

- Node.js 20.6 or newer, and npm 10
- A [TMDB](https://www.themoviedb.org/settings/api) account, for the v4 "API Read Access Token"
- A [Firebase](https://console.firebase.google.com) project with a web app and Google enabled as a sign-in provider

### Setup

1. Install dependencies from the repo root:

   ```sh
   npm install
   ```

2. Create the API env file and add your TMDB token:

   ```sh
   cp apps/api/.env.example apps/api/.env
   ```

3. Create the web env file and add your Firebase web-app config:

   ```sh
   cp apps/web/.env.local.example apps/web/.env.local
   ```

4. In the Firebase console, add `localhost` to **Authentication → Settings → Authorised domains**.

5. Start everything:

   ```sh
   npm run dev
   ```

   The web app runs on http://localhost:5173 and the API on http://localhost:3001. Vite proxies `/api` to the API, so you only need to open the web app.

Both apps fail fast at startup with a clear message if a required env var is missing.

## Environment variables

### API — `apps/api/.env`

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `TMDB_READ_ACCESS_TOKEN` | yes | — | TMDB v4 read access token |
| `PORT` | no | `3001` | Port for the local API server |
| `NODE_ENV` | no | `development` | Standard Node environment |
| `JACKETT_API_KEY` | no | — | Enables torrent mode; copy it from the Jackett dashboard |
| `JACKETT_URL` | no | `http://127.0.0.1:9117` | Jackett base URL |
| `TORRSERVER_URL` | no | `http://127.0.0.1:8090` | TorrServer base URL, used by the API |
| `TORRSERVER_PUBLIC_URL` | no | same as `TORRSERVER_URL` | TorrServer URL handed to the browser; set it to the machine's LAN IP to watch from other devices |
| `OPENSUBTITLES_API_KEY` | no | — | Enables subtitles in torrent mode |
| `OPENSUBTITLES_USERNAME` | no | — | Optional login; raises the daily download quota |
| `OPENSUBTITLES_PASSWORD` | no | — | Optional login; raises the daily download quota |
| `OPENSUBTITLES_APP_NAME` | no | `mobius v0.1` | App name sent to OpenSubtitles |

### Web — `apps/web/.env.local`

| Variable | Required | Purpose |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | yes | Firebase web-app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | Firebase web-app config |
| `VITE_FIREBASE_PROJECT_ID` | yes | Firebase web-app config |
| `VITE_FIREBASE_APP_ID` | yes | Firebase web-app config |
| `VITE_FIREBASE_STORAGE_BUCKET` | no | Firebase web-app config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | no | Firebase web-app config |

## Torrent streaming mode

Torrent mode is optional and meant for a locally run server only. It is switched off unless `JACKETT_API_KEY` is set, which is the case on the Vercel deployment.

It relies on two self-hosted services rather than implementing any torrent logic itself:

- [Jackett](https://github.com/Jackett/Jackett) — searches across torrent indexers.
- [TorrServer](https://github.com/YouROK/TorrServer) — turns a magnet link or `.torrent` file into an HTTP video stream.

### Turning it on

1. Run Jackett and TorrServer on the same machine as the API. Their default ports (9117 and 8090) match the API defaults.
2. Add at least one indexer in the Jackett dashboard.
3. Set `JACKETT_API_KEY` in `apps/api/.env` and restart the API.
4. In the web app, open the settings menu in the top navigation and switch on **Torrent streaming**. The switch is disabled while either service is unreachable.

### What happens when you press play

1. The API looks up the title's IMDb id on TMDB.
2. It searches Jackett, by IMDb id first and by title as a fallback. For series it also looks for season packs.
3. It filters and ranks the results. Releases with no seeders, cam or telesync rips, and implausible file sizes are dropped; the ranking favours 1080p, healthy swarms, WEB-DL or BluRay sources, and H.264.
4. It loads the top pick into TorrServer and chooses the right video file, matching the season and episode inside a season pack.
5. The player streams that file directly from TorrServer.

The source you last used for a title is remembered, so replaying it skips the search. If a release won't play or nothing is found, you can pick another from the sources drawer or fall back to VidCore.

### Player keyboard shortcuts

| Key | Action |
|---|---|
| `Space` or `K` | Play or pause |
| `←` / `→` | Seek 5 seconds backward or forward |
| `↑` / `↓` | Volume up or down |
| `M` | Mute |
| `F` | Fullscreen |

## Scripts

Run these from the repo root.

| Command | What it does |
|---|---|
| `npm run dev` | Start the web app and the API in watch mode |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | Type-check all workspaces |
| `npm test --workspace @mobius/api` | Run the API unit tests |
| `npm run clean` | Remove build output and `node_modules` |

To run a script in one workspace, add `--workspace @mobius/web` or `--workspace @mobius/api`.

## API reference

All endpoints are under `/api` and return JSON unless noted.

### Catalog — shaped for the UI

| Method | Path | Returns |
|---|---|---|
| GET | `/api/catalog/home` | Hero and rows for the home screen |
| GET | `/api/catalog/title/:kind/:id` | Details for a movie or series (`kind` is `movie` or `tv`) |
| GET | `/api/catalog/title/tv/:id/season/:n` | Episodes of one season |
| GET | `/api/catalog/search?q=` | Search results |

### TMDB — cached pass-through lists

| Method | Path |
|---|---|
| GET | `/api/tmdb/trending?window=day\|week&media=all\|movie\|tv` |
| GET | `/api/tmdb/popular/movies`, `/api/tmdb/popular/tv` |
| GET | `/api/tmdb/top-rated/movies`, `/api/tmdb/top-rated/tv` |
| GET | `/api/tmdb/upcoming/movies`, `/api/tmdb/now-playing/movies`, `/api/tmdb/airing-today/tv` |
| GET | `/api/tmdb/movie/:id`, `/api/tmdb/tv/:id` |
| GET | `/api/tmdb/search` |
| GET | `/api/tmdb/genres/movies`, `/api/tmdb/genres/tv` |

### Stream — torrent mode

| Method | Path | Returns |
|---|---|---|
| GET | `/api/stream/status` | Whether Jackett and TorrServer are configured and reachable |
| GET | `/api/stream/sources?kind=&id=&s=&e=` | Up to 20 ranked sources for a title |
| POST | `/api/stream/play` | A stream URL for the best source, a chosen `sourceId`, or a supplied `source` |
| GET | `/api/stream/subtitles?kind=&id=&s=&e=&languages=` | Available subtitle tracks; empty when subtitles are not configured |
| GET | `/api/stream/subtitles/file/:fileId` | One subtitle file as WebVTT |

Stream endpoints respond with `503 stream_unconfigured` when torrent mode is off and `404 no_sources` when nothing playable is found.

### Other

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | Health check |

## Deployment

The repo is set up for Vercel through `vercel.json`:

- The web app is built with Vite and served as static files from `apps/web/dist`.
- `api/index.ts` wraps the Express app as a single serverless function, and every `/api/*` request is rewritten to it.
- All other paths are rewritten to `index.html` for client-side routing.

Set `TMDB_READ_ACCESS_TOKEN` and the `VITE_FIREBASE_*` variables in the Vercel project, and add the deployment domain to Firebase's authorised domains. Leave the Jackett, TorrServer and OpenSubtitles variables unset: torrent mode needs services on your own machine and stays disabled in the cloud.

## Notes

- This is a personal project. Torrent mode is intended for local, private use only; you are responsible for what you stream and for complying with the laws that apply to you.
- This product uses the TMDB API but is not endorsed or certified by TMDB.
