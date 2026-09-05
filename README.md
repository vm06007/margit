# margit

Vite 8 (Rolldown) + React frontend with a small Hono API server for GitHub OAuth.

## Setup

1. `npm install`
2. Create a GitHub OAuth App: https://github.com/settings/applications/new
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:8788/api/auth/github/callback`
3. `cp .env.example .env` and fill in `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
4. `npm run dev` — runs the Vite dev server (`:5173`) and the API server (`:8788`) together

## Layout

- `src/` — Vite/React frontend
- `server/` — Hono API server (GitHub OAuth login/callback, session, `/api/repos`)

Sessions are in-memory for now (cleared on API server restart) — fine for local dev, will need a real store before deploying.
