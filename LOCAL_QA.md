# GREDA local QA status

Date: 2026-10-01 (America/Lima)

This report covers the clean local rebuild in `C:\Users\anthg\bcotizador` (API) and `C:\Users\anthg\cotizador` (web). It records local evidence only; no deployment was performed.

## Verified

- `docker compose build backend frontend` completed from the current source, including the importer, calculator, and quotation UI corrections. PostgreSQL is healthy, and `GET http://127.0.0.1:8081/api/health` returned `status: ok` and `database: ok` after recreating only the GREDA backend and frontend containers.
- GREDA publishes only `127.0.0.1:8081`; its API and PostgreSQL remain on the private Compose network.
- Carpintería is still running on `127.0.0.1:8080`; an HTTP request to its root returned `200` after GREDA started.
- Backend: 23/23 tests pass, including authenticated bootstrap, exact V2 workbook days/prices and separate 16,200 cm³ geometric / 38,880 cm³ operational volumes, task-level rate and applied-hours overrides with source metadata, the master-data parser warning, and Excel category/type classification; typecheck, lint, build, Prisma validate/generate pass, and both full and production-only `npm audit` report zero vulnerabilities.
- Frontend: 6/6 tests pass, including the ADMIN/OPERARIO/TESTER permission matrix, customer-type selection, percentage-to-fraction glaze conversion, master-product dimensions, labor overrides and their displayed sources, and rendering server-returned volume and firing breakdowns; typecheck, lint and build pass, and `npm audit` reports zero vulnerabilities.
- RBAC review: backend global JWT/role guards are active; admin-only user, import and settings actions are role-protected. Frontend write affordances now match the backend's ADMIN/OPERARIO writes, with TESTER read-only controls.
- Playwright Chromium was installed from its official CDN. The unauthenticated protected-route redirect E2E passes (1/1). The authenticated navigation/responsive E2E is still pending initial admin setup.
- The ignored local master `bdxls/Carga de maestros - Taller.xlsx` was parsed read-only through the built backend service: 265 products, 15 contacts, 16 hierarchical categories, 92 recipe groups, and 9 stock rows. The preview resolves the full category paths and derives product types from source category paths and recipe outputs. It finds 2 exact stock matches and 7 unresolved rows; no fuzzy matches are imported. The parser identifies `SOURCE_CONFLICT` at `Recetas` row 420, excludes that recipe-like block through the next valid yield row, keeps its ingredients out of the preceding recipe, and retains all other valid groups. This warning is non-blocking and covered by a test.
- `bdxls/Cotizador_V2_GREDA_Funcional_sin_factor_horno.xlsx` is not a master-import workbook; its six expected master sheets are absent, so it was not used as import data.
- Workbook parity: daily costs use `productionDays × (rentPerDay + utilitiesPerDay) + administrativeCost`, with `productionDays = labor cycles + configured days + manual additional days` (including zero days); reference prices before IGV are `technicalCost × minimum/default production factor + otherCosts`. Customer types are classification metadata; the workbook formulas do not vary by customer type. Shared-firing occupancy remains operational volume divided by kiln capacity. The API returns geometric volume and operational volume with configured separations as separate fields; the existing `volumeCm3` stays an operational-volume alias for firing compatibility.
- `.env` and the source XLSX files are ignored by Git.

## Awaiting ADMIN access

The last read-only SQL snapshot found one active user with role `TESTER`; no `ADMIN` account is present. The “Configurar primer administrador” dialog had been observed earlier when the user count was zero, but the current bootstrap endpoint refuses to create another user once the table is non-empty. No credentials or password hashes were read. Do not remove or promote the existing user without an explicit recovery instruction. The already-open browser tab displays an ADMIN session label, but the Users page lists the sole database account as TESTER; the backend guard trusts the role claim in the signed JWT, so that session is not evidence of a current ADMIN database record and was not used for writes.

The updated backend and frontend images are built and running on `127.0.0.1:8081`. The new nullable labor-task rate override migration (`20261001100000_add_quotation_labor_rate_override`) was applied successfully to the local GREDA database. Carpintería remains on `127.0.0.1:8080` and returned HTTP 200 after GREDA's backend and frontend containers were recreated; its services were not restarted.

Until an ADMIN session is available, the following remain unverified:

1. Authenticated navigation through every module, including the required responsive widths.
2. Browser preview and confirmation of the master XLSX, including the visible `SOURCE_CONFLICT` row 420 warning and resulting product/recipe/stock counts.
3. The complete authenticated quotation wizard, save/confirm flow and generated PDF, plus button-by-button manual walkthrough.
4. The full authenticated Playwright E2E and final publication review.

No rows from the master workbook have been imported yet. The parsed preview was not persisted or confirmed.

## Legacy project preservation

- Docker inventory found no legacy GREDA containers, images, volumes, or networks; the remaining GREDA resources are the new local stack. Carpintería (`127.0.0.1:8080`) and Inventario resources were left untouched.
- The latest instruction is to preserve legacy projects. The main roots `C:\Users\anthg\BGreda` and `C:\Users\anthg\FGreda` remain present; 39 linked worktrees had already been removed before that instruction. No further legacy project cleanup will be performed. `C:\Users\anthg\bcotizador\bdxls` remains present.

## Local checks run

```text
Backend tests: 23 passed
Frontend tests: 6 passed
Playwright protected-route E2E: 1 passed
Prisma validate/generate: passed
Typecheck, lint, build: passed in both projects
npm audit: 0 vulnerabilities in both projects (backend runtime audit included)
Docker Compose build (backend and frontend): passed
Compose/API health: passed
Carpintería :8080: HTTP 200
```
