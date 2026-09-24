# AGENTS.md

## Project snapshot

This repo is a Node.js + Express app for a restaurant admin dashboard with a MySQL database and static frontend pages.

- Backend entrypoint: [server.js](server.js)
- Frontend/admin UI: [admin/](admin/)
- Public pages: [index.html](index.html), [menu.html](menu.html), [styles.css](styles.css), [script.js](script.js)
- Uploads: [uploads/](uploads/)
- JSON persistence: [data/](data/)

## Working commands

Use Docker for the normal flow because the app depends on MySQL:

```bash
docker-compose up --build
docker-compose logs -f taz_app
```

For a local single-process run when Node is available:

```bash
npm install
npm run dev
```

## Architecture and conventions

- [server.js](server.js) initializes MySQL, creates the `taz_admin` database and required tables, and bootstraps default admin credentials.
- The app persists employee, admin, and record metadata in both MySQL and JSON files under [data/](data/). Keep both layers synchronized when schema or payload structure changes.
- Auth is session-based with `express-session` and `bcryptjs`; admin and employee flows are role-aware.
- Browser requests to authenticated routes should include `credentials: 'include'` when using cookies.
- Keep the JSON write path and upload directories in sync with the existing `nodemon` ignore config. Do not add noisy file writes to watched folders unless necessary.

## Common pitfalls

- `nodemon` watches [data/](data/) and [uploads/](uploads/). File writes in those directories can trigger restart loops; keep writes minimal and respect the existing ignore configuration.
- MySQL startup is retried in `initDatabase()`. The app is designed to wait for database readiness instead of failing immediately.
- Docker mounts the project directory into the container, while `node_modules` stays in the container. Rebuild with `docker-compose up --build` after dependency changes.

## Change guidance for agents

- Prefer small, isolated edits. Keep server logic in [server.js](server.js) and UI logic in the relevant admin/front-end files.
- If a change affects persisted fields, update both the MySQL schema and the JSON sync path; otherwise the app can drift between storage layers.
- Do not remove the JSON persistence layer without checking whether the app intentionally relies on it.
- If auth or session flow changes, validate the browser login flow end-to-end rather than only the backend route.

## Validation checklist

Before marking a fix complete:

1. Confirm the app starts without nodemon restart loops.
2. Check startup logs using `docker-compose logs -f taz_app` if using Docker.
3. Verify the affected API route or page works with real data.
4. If auth or record handling changed, validate both MySQL state and the corresponding files in [data/](data/).

## Optional follow-up customizations

If the project grows, good next add-ons would include:

- E2E tests for login and admin flows
- A migration script to keep JSON and MySQL in sync
- Linting/formatting automation for the Node app
