# AGENTS.md

## Project overview

This repository is a Node.js + Express app for the TAZ restaurant admin dashboard, with a MySQL database and static frontend pages under `admin/`.

- Main backend entrypoint: `server.js`
- Frontend/admin pages: `admin/`
- Uploaded files: `uploads/`
- JSON persistence: `data/`
- Static site root: `index.html`, `menu.html`, `styles.css`, `script.js`

## Local workflow

Use Docker for the normal development flow because the app depends on MySQL and the environment is defined in `docker-compose.yml`.

Commands:

```bash
docker-compose up --build
docker-compose logs -f taz_app
```

For a single-process local run when Node is available:

```bash
npm install
npm run dev
```

## Architecture notes

- `server.js` initializes MySQL and creates the `taz_admin` database plus required tables.
- The app stores persisted admin/employee/record metadata in `data/*.json` and writes uploaded files in `uploads/`.
- The admin UI calls API endpoints under `/api/*` with `credentials: 'include'` to keep session cookies working.
- The server uses `express-session` and `bcryptjs`; employee/admin authentication is role-aware.

## Project conventions

- Keep database and JSON state synchronized when changing employee or record data.
- If you add a new persisted field, update both the MySQL schema and the corresponding JSON sync path.
- Prefer editing server behavior in `server.js` and UI behavior in the files under `admin/`.
- For frontend API calls, include `credentials: 'include'` when the request relies on auth cookies.

## Common pitfalls

### Nodemon restart loops

The app writes to `data/*.json` and `uploads/` during normal operation. Those directories are watched by `nodemon`, so file writes can trigger repeated restarts.

This project already includes a `nodemon.json` that ignores those folders, and the server writes JSON only when the content actually changes. Keep that behavior unless you have a strong reason to change it.

### MySQL readiness

The app retries database initialization in `initDatabase()`. If MySQL is still booting, the app waits and retries instead of crashing immediately.

### Docker volume behavior

The container mounts the project directory into `/app`, while `node_modules` stays in the container. Rebuilding with `docker-compose up --build` is the safest way to refreshh dependencies and the app.

## Validation checklist

Before considering a fix complete:

1. Confirm the app starts without nodemon restart loops.
2. Check `docker-compose logs -f taz_app` for startup errors.
3. Verify the relevant API route works with real data.
4. If changing employee auth or record persistence, validate both MySQL and the JSON files in `data/`.

## Keep in mind

- Do not remove or bypass the JSON persistence layer without checking whether the app intentionally relies on it.
- Do not rely on direct `node server.js` execution inside Docker when the project is meant to run with `npm run dev` under nodemon.
- If a change touches auth/session behavior, test the browser flow end-to-end, not only the backend route.

## Instrucciones para agentes AI

Breve guía para que agentes automatizados trabajen productivamente en este repositorio:

- **Propósito:** realizar cambios de código pequeños y dirigidos (bugfixes, ajustes de UI, endpoints), crear PRs aisladas y proponer mejoras de arquitectura cuando sea necesario.
- **Archivos clave:** servidor en [server.js](server.js), front static en [index.html](index.html), [menu.html](menu.html), estilos en [styles.css](styles.css), lógica cliente en [script.js](script.js), datos persistentes en [data/](data/).
- **Comandos habituales:**

```bash
npm install
npm run dev   # levanta nodemon localmente
docker-compose up --build   # flujo recomendado con MySQL
```

- **Convenciones importantes:**
	- Mantener sincronía entre la persistencia MySQL y los JSON en `data/` si se cambia la estructura de datos.
	- Evitar tocar `uploads/` o `data/` en pruebas automatizadas sin limpiar o ignorar en nodemon.
	- Los cambios visuales de front deben respetar variables CSS y estilos ya definidos en `styles.css`.

- **Pruebas y validación:**
	- Antes de marcar una tarea como lista: arrancar la app (local o Docker), verificar que no hay loops de nodemon y que la ruta/funcionalidad afecta funciona manualmente.
	- Si se modifica auth/session: probar login-flujo completo en la UI de `admin/`.

- **Restricciones para agentes:**
	- No eliminar la capa de persistencia JSON sin validar dependencias.
	- No incluir secretos en el código ni en commits.
	- Cuando propongas cambios grandes, abre un issue primero describiendo el plan y riesgos.

- **Sugerencia de mejoras de personalización:** crear tareas separadas para: pruebas E2E, scripts de migración para sincronizar JSON↔MySQL, y linters/formatters automáticos.

---

Archivo actualizado por este cambio:

- [AGENTS.md](AGENTS.md) — Añade instrucciones concisas para agentes AI (comandos, convenciones, restricciones y checklist de validación).
