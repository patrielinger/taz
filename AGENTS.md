# AGENTS.md

## Project snapshot

Node.js 20 + Express 4 restaurant admin panel with a static public menu site. Single Express server — no separate frontend framework, build step, or codegen.

- Backend entrypoint: `server.js` (Express app + REST API + session auth + MySQL + JSON fallback sync + static file serving).
- Admin UI: `9f4a7b2c/` (`admin.css`, `admin.js`, `index.html`, `employee-dashboard.html`, `encargado.html`, `encargado.js`).
- Public pages: `index.html`, `menu.html`, `styles.css`, `script.js`.
- Uploads: `uploads/`; JSON fallback persistence: `data/` (`admins.json`, `employees.json`, `records.json`, `uploaded_files.json`).
- Infra: `docker-compose.yml` (app + `mysql:8.0`), `Dockerfile` (node:20-alpine), deploy notes in `DEPLOY_HOSTINGER.md`.

## Commands

- Normal workflow (Docker-first, needs Docker with MySQL): `docker-compose up --build`, logs: `docker-compose logs -f taz_app`.
- Local single-process run (Node + MySQL available): `npm install`, then `npm run dev` (nodemon) or `npm start`.
- `package.json` has only `start` and `dev` scripts — no tests, lint, typecheck, or format tooling exists. Validation is manual: start the app and check `curl http://localhost:3000/api/health`, expecting `{ "ok": true, "message": "TAZ admin API online" }`.
- After changing dependencies, rebuild with `docker-compose up --build` (node_modules stays inside the container, not mounted).

## Architecture and conventions

- All backend logic lives in `server.js` (Express, mysql2/promise, express-session + bcryptjs, multer, cors, dotenv). No routers/modules — routes and handlers are inline.
- MySQL (`taz_admin` DB, bootstrapped by `initDatabase()`) is the source of truth; `data/*.json` files are the sync fallback. Writes sync DB → JSON (atomic writes, JSON untouched if the DB query fails); at boot there is a one-time JSON → DB migration for legacy record states. Any change touching persisted fields must keep both layers in sync.
- Auth is session-based (`express-session` + `bcryptjs`). Default admin on first boot: username `admin`, password `tazadmin123` (bcrypt-seeded unless the DB already has an admin row). `Encargado` logs in with the employee phone number as username, password stored in `employees.password_hash`.
- Protected browser API calls should use `credentials: 'include'` so the session cookie is sent.
- Env via dotenv (`.env`, `.env.example`): `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET`, `SESSION_SECURE`. Docker compose maps the DB host to the `db` service name.
- CORS is an explicit allowlist (public hosts `tazjujuy.com`, `www.tazjujuy.com`, localhost variants; admin hosts `admin.tazjujuy.com`, `www.admin.tazjujuy.com`, `admin.localhost`).

## API surface (in `server.js`)

- `GET /api/health` — health check; expect `{ ok: true, message: "TAZ admin API online" }`.
- `POST /api/login`, `POST /api/logout`, `GET /api/session`.
- `GET /api/records`, `GET /api/records/:id`, `POST /api/records`, `PUT /api/records/:id`, `DELETE /api/records/:id`, `GET /api/records/json`, `GET /api/records/sync`, `GET /api/records/summary`, `GET /api/records/month`.
- `POST /api/upload`, `GET /api/files`, `GET /api/files/:id/download`.
- `GET /api/employees`, `POST /api/employees`, `PUT /api/employees/:id`, `DELETE /api/employees/:id`.

## Dev quirks and pitfalls

- `nodemon.json` ignores `data/*`, `uploads/*`, `node_modules/*`, `.git/*`; watches `server.js`, `*.js`, `admin/**/*.js`, `*.html`; ext `js,json,html`. Writing files under `data/` or `uploads/` during dev can trigger restart loops — keep writes minimal and respect the ignore config.
- MySQL startup is retried in `initDatabase()`; the server waits for DB readiness instead of failing immediately.
- `/data` JSON files are never served as static files (blocked by middleware).
- `/9f4a7b2c/*` paths on public hosts redirect to the admin host; on admin hosts they are served from the admin directory.
- Keep edits small and isolated: backend logic in `server.js`, page-specific behavior next to the relevant admin/public asset; avoid scattering feature logic across unrelated files.

## Mobile UI conventions

- Small-screen work goes in the shared stylesheet (`styles.css`) rather than inline styles in `menu.html` unless truly needed.
- Keep menu filters horizontally scrollable, let item rows wrap instead of fixed widths, avoid fixed-width thumbnails/rigid rows, and keep price/button groups unwrapped; verify the viewport at 360–390px before shipping changes.

## Validation checklist

Before marking a fix complete:

1. Confirm the app starts without nodemon restart loops.
2. Check startup logs with `docker-compose logs -f taz_app` if using Docker.
3. Hit the health endpoint and verify the impacted login or API route works with real data.
4. If auth or record handling changed, validate both MySQL state and the corresponding files in `data/`.
5. If file uploads or admin employee flows changed, verify the uploaded file path and database record stay in sync.

## Useful first files to inspect

- `server.js` for routes, session auth, DB bootstrap, and persisted-data sync logic.
- `9f4a7b2c/employee-dashboard.html` and `9f4a7b2c/encargado.js` for admin/encargado UI flows.
- `script.js` for browser-side API usage and public page behavior.
- `nodemon.json` for watched folders and restart-pitfall awareness.
- `DEPLOY_HOSTINGER.md` for the production deploy flow (Hostinger VPS, Docker Compose).
