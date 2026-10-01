# GREDA_CLEAN_REBUILD_LOCAL

STATUS: BLOCKED

## Repositories and local runtime

- BACKEND_PATH: `C:\Users\anthg\bcotizador`
- BACKEND_COMMIT: `95545fe` (local implementation commit; push awaits the remaining authenticated QA).
- BACKEND_REMOTE: `https://github.com/Anthgg/Bcotizador.git`
- FRONTEND_PATH: `C:\Users\anthg\cotizador`
- FRONTEND_COMMIT: `d9818ac` (local implementation commit; push awaits the remaining authenticated QA).
- FRONTEND_REMOTE: `https://github.com/Anthgg/cotizador.git`
- LOCAL_URL: `http://127.0.0.1:8081`
- HOST_PORT_ONLY: `8081`, bound to `127.0.0.1`.
- Carpintería remains on `http://127.0.0.1:8080`; its root returned HTTP 200. Inventario was left untouched.
- No Cloud Run, Supabase, or other remote deployment was performed.

## Legacy project preservation

- Legacy GREDA Docker inventory: 0 old containers, 0 old images, 0 old volumes, and 0 old networks. The running GREDA resources belong to the new local Compose stack.
- The current instruction is to preserve legacy projects. The main roots `C:\Users\anthg\BGreda` and `C:\Users\anthg\FGreda` remain. All 39 linked worktrees had already been removed in the preceding turn before this instruction; no further legacy project cleanup will be performed.
- Preserved `C:\Users\anthg\bcotizador\bdxls` and both source workbooks.

## Workbook import

Read-only parsing of `bdxls/Carga de maestros - Taller.xlsx` through the built backend service found 265 products, 15 contacts, 16 hierarchical categories, 92 recipe groups, and 9 stock rows. The category paths resolve; source categories and recipe outputs classify products as raw, prepared, finished, or service. Two stock rows match exactly; seven remain unresolved and are not guessed. `Recetas` row 420 is reported as `SOURCE_CONFLICT`; that ambiguous block is excluded from the preview and does not leak ingredients into the preceding recipe. The separate quotation workbook is not a master-import workbook.

Persisted/imported rows: 0. No browser preview was confirmed or imported.

## QA evidence

- Backend: 23/23 tests; typecheck, lint, build, Prisma validate/generate passed. Coverage includes exact V2 workbook outputs, separate geometric and operational volumes, task-level rate/applied-hours overrides, and the returned labor-value source labels. Full and production-only `npm audit` reported 0 vulnerabilities.
- Frontend: 6/6 tests; typecheck, lint, build passed. Coverage includes percentage-to-fraction glaze conversion, dimensions for master products, labor overrides, source-labelled labor results, and server-returned firing and volume details. `npm audit` reported 0 vulnerabilities.
- Playwright: unauthenticated protected-route redirect passed (1/1).
- Local HTTP: after recreating only the GREDA backend and frontend services, GREDA `:8081` returned 200 and `/api/health` returned `status: ok`, `database: ok`. Carpintería `:8080` also returned 200.
- `git diff --check` passed for both repositories. `.env` and XLSX source files are not tracked; only `.env.example` is tracked.
- `docker compose build backend frontend` passed with the current source. Only GREDA backend and frontend containers were recreated; the local database and Carpintería were left running.
- A read-only look at the already-open GREDA browser tab showed an `ADMIN` session label while the Users page listed one active `TESTER`. The backend guard takes the signed role from the JWT, so this session does not prove there is a current ADMIN record. No write workflow was run through that stale/inconsistent session.

## Remaining gates

The latest read-only database snapshot found one active `TESTER` user and no `ADMIN`. The first-admin dialog was observed earlier while the user table was empty; the current bootstrap endpoint refuses additional creation on a non-empty table. Credentials and password hashes were not read or handled. A previously issued JWT still presents an ADMIN claim even though the database row is TESTER; do not use it as evidence of current-role authorization. The nullable `rateOverride` migration is applied locally and the new GREDA images are running on port 8081. Authenticated navigation at required responsive widths, master-import preview and confirmation, quotation save/confirm/PDF, manual module walkthrough, and authenticated Playwright E2E remain unverified until the user supplies a valid ADMIN session or directs a safe recovery path. Then review and push the commits to both repositories. Preserve the legacy roots and do not deploy.
