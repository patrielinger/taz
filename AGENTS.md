# AGENTS.md

## Project snapshot

This repo is a Node.js + Express app for a restaurant admin dashboard backed by MySQL, with static frontend pages and JSON fallback files kept in sync for quick reads and local debugging.

- Backend entrypoint: [server.js](server.js)
- Admin UI: [admin/](admin/)
- Public pages: [index.html](index.html), [menu.html](menu.html), [styles.css](styles.css), [script.js](script.js)
- Uploads: [uploads/](uploads/)
- JSON persistence: [data/](data/)
- Container setup: [docker-compose.yml](docker-compose.yml), [Dockerfile](Dockerfile)

## Working commands

Use Docker for the normal workflow because the app expects MySQL to be available at startup:

```bash
docker-compose up --build
docker-compose logs -f taz_app
```

For a local single-process run when Node and MySQL are already available:

```bash
npm install
npm run dev
```

## Architecture and conventions

- [server.js](server.js) bootstraps Express, session auth, file uploads, and the MySQL connection lifecycle.
- `initDatabase()` creates the `taz_admin` database, creates required tables, and adds missing legacy columns such as `password_hash`, `pedidos_ya`, and `stock` when older databases are detected.
- The app keeps data in both MySQL and JSON files under [data/](data/). When a change touches persisted fields, update both layers or the app will drift between storage backends.
- Auth is session-based using `express-session` and `bcryptjs`; admins and encargados are recognized by different role checks in `/api/login` and route guards.
- Browser requests to protected routes should send `credentials: 'include'` so the session cookie is sent.
- File uploads are stored under [uploads/](uploads/) and also recorded in MySQL via the `uploaded_files` table; do not create noisy writes in watched folders.
- The root pages are mostly static HTML/JS while admin flows are under [admin/](admin/). Keep UI logic close to the page it serves instead of mixing unrelated features together.

## Common pitfalls

- `nodemon` watches [data/](data/) and [uploads/](uploads/). Writing files there during development can trigger restart loops; keep writes minimal and respect the existing ignore config in [nodemon.json](nodemon.json).
- MySQL startup is intentionally retried in `initDatabase()`. The server waits for database readiness instead of failing immediately.
- Docker mounts the project directory into the container, while `node_modules` stays in the container. Rebuild with `docker-compose up --build` after package or dependency changes.
- The default admin login is created on first boot using the username `admin` and the password `tazadmin123` unless the database already has an admin row.
- The `Encargado` role uses the employee phone number as the login username, while the password is stored in `employees.password_hash`.

## Change guidance for agents

- Prefer small, isolated edits. Keep server logic in [server.js](server.js) and UI logic in the relevant admin or public page assets.
- If a change affects persisted fields, update both the SQL schema and the JSON sync code; otherwise one layer can silently diverge from the other.
- Do not remove the JSON persistence layer without checking whether the app intentionally relies on it for local reads or fallback data.
- If auth, login, or session behavior changes, validate the browser flow end-to-end instead of only checking the backend code.
- Keep `fetch` calls aligned with the app's session-cookie behavior: protected API calls should use `credentials: 'include'`.

## Validation checklist

Before marking a fix complete:

1. Confirm the app starts without nodemon restart loops.
2. Check startup logs with `docker-compose logs -f taz_app` if using Docker.
3. Hit the health endpoint and verify the impacted login or API route works with real data.
4. If auth or record handling changed, validate both MySQL state and the corresponding files in [data/](data/).
5. If file uploads or admin employee flows changed, verify the uploaded file path and database record stay in sync.

## Useful first files to inspect

- [server.js](server.js) for routes, session auth, DB bootstrap, and persisted-data sync logic.
- [admin/employee-dashboard.html](admin/employee-dashboard.html) and [admin/encargado.js](admin/encargado.js) for admin/encargado UI flows.
- [script.js](script.js) for browser-side API usage and public page behavior.
- [nodemon.json](nodemon.json) for watched folders and restart-pitfall awareness.

## Optional follow-up customizations

If the project grows, useful next add-ons would include:

- E2E tests for login and admin flows
- A migration script to keep JSON and MySQL in sync
- Linting and formatting automation for the Node app
