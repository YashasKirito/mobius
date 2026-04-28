# @mobius/web

Møbius streaming front-end — Vite + React 19 + TypeScript.

## Stack

| Concern | Library |
|---|---|
| Routing | `react-router` v7 (data router) |
| Server state | `@tanstack/react-query` v5 |
| Client state | `zustand` v5 |
| Auth | Firebase Auth (Google sign-in, `browserLocalPersistence`) |
| Icons | `lucide-react` |

## Setup

1. Install deps from the repo root: `npm install`
2. Copy the env template and fill it with your Firebase web-app config:
   ```sh
   cp apps/web/.env.local.example apps/web/.env.local
   ```
   Find the values in **Firebase Console → Project Settings → Your apps → Web app config**. Required:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
3. In Firebase Console, enable **Google** as a sign-in provider and add `localhost` (and your prod domain) to **Authorised domains**.
4. Run `npm run dev` (from the repo root or `--workspace @mobius/web`).

`apps/web/src/lib/env.ts` throws at module load if any required key is missing — there's no silent fallback.

## Routes

| Path | Component | Auth | Notes |
|---|---|---|---|
| `/login` | `LoginRoute` | public | Renders `<SplitLogin>` (≥ 720px) or `<MobileLogin>` (< 720px). Redirects to `from` (or `/`) if already signed in. |
| `/` | `HomeWithModal` → `HomeRoute` | protected | The streaming home (hero + carousels). |
| `/title/:id` | `HomeWithModal` → `HomeRoute` + `TitleRoute` | protected | Renders the home **and** the detail modal on top — the modal is an overlay. Direct visit / refresh still works (home is rendered underneath as a fallback). |
| `/watch/:id` | `WatchRoute` | protected | Full-viewport video player. |
| `*` | `<Navigate to="/" />` | — | Catch-all. |

The modal-overlay pattern works because both `/` and `/title/:id` route to `<HomeWithModal>`, which uses `useMatch("/title/:id")` to decide whether to mount `<TitleRoute>` on top. When a tile is clicked, `HomeRoute` calls `navigate('/title/:id', { state: { backgroundLocation: location } })` so the URL changes without unmounting the home.

## Auth flow

1. App boots → `<AuthBootstrap>` subscribes to `onAuthStateChanged` once. While the first callback hasn't fired (`status === "bootstrapping"`), it shows the breathing-pearl `<LoadingOverlay>` instead of the route tree — prevents already-signed-in users from flashing the login screen.
2. If signed-out, `<ProtectedLayout>` redirects to `/login`.
3. The Google CTA in `<SplitLogin>` / `<MobileLogin>` calls `useAuthStore().signInWithGoogle()`, which runs `signInWithPopup(auth, GoogleAuthProvider)`. Errors are mapped to friendly strings (popup blocked, popup closed, network error, unauthorised domain) and surface in the existing red error chip.
4. Click the avatar in the streaming `<TopNav>` to sign out — `signOut()` calls `firebase/auth.signOut`, then `queryClient.clear()` so the next user doesn't see this user's cached data.

## Data layer

`src/queries/catalog.ts` exposes `useCatalog()` and `useTitle(id)`. Today the `queryFn` returns `Promise.resolve(allMedia)` from `src/streaming/data.ts` — the abstraction is real, the network isn't. To wire a real backend, swap the `queryFn` body to `fetch('/api/catalog').then(...)` — components don't change. Vite's dev proxy (in `vite.config.ts`) already routes `/api` to the Express app on `:3001`.

## State management

- **Auth state** (`useAuthStore`, `src/stores/authStore.ts`) — singleton Firebase user mirror. Not in TanStack Query because `onAuthStateChanged` is a subscription, not a request.
- **Server state** (TanStack Query) — catalog, title detail. React Query Devtools is mounted in dev only (toggle bottom-left).
- **Local UI state** — kept in `useState`. Currently only `<HomeRoute>`'s hover-card anchor and `<VideoPlayer>`'s scrubber.

## Verification

```sh
npm run typecheck --workspace @mobius/web
npm run build --workspace @mobius/web
npm run dev --workspace @mobius/web
```

Manual smoke list:
- Visit `/` while signed out → bounces to `/login`.
- Sign in → real Google popup → land on `/`.
- Click a tile → URL becomes `/title/:id`, modal opens with home behind. Press back → modal closes, URL `/`.
- Refresh on `/title/nd` → home renders underneath, modal renders on top (no scroll preserved — fresh visit).
- Click hover-card play (or modal Play) → `/watch/:id` full-screen player. Back → returns.
- Click avatar in TopNav → confirm dialog → sign out → bounces to `/login`.
- Refresh while signed in → brief bootstrap loader → stays on the same route.
- Visit `/title/does-not-exist` → "Title not found" + back-to-home button.
