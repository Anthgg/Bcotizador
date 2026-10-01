# GREDA local QA status

Date: 2026-10-01 (America/Lima)

This report records the local rebuild in C:\Users\anthg\bcotizador (API) and C:\Users\anthg\cotizador (web). It covers local verification only; no deployment was performed.

## Runtime and preservation

- GREDA is running on http://127.0.0.1:8081. Its only host-published port is 8081; backend and PostgreSQL remain on the Compose network.
- Carpintería remains on http://127.0.0.1:8080 and returned HTTP 200. Inventario was not changed.
- The dedicated local E2E account was promoted to ADMIN as authorized. Credentials are stored only in the ignored local E2E environment file and are not included in the repository or this report.
- No Supabase, Cloud Run, or other application deployment was performed.
- Legacy GREDA source roots C:\Users\anthg\BGreda and C:\Users\anthg\FGreda remain preserved per the later instruction. The 39 linked worktrees had already been removed earlier. No legacy GREDA containers, images, volumes, or networks remain.
- Local workbook import and E2E-generated QA records remain in the local database.

## Workbook import

The local workbook Carga de maestros - Taller.xlsx was parsed and imported; repeating the import was idempotent.

- 265 products, 15 contacts, 16 hierarchical categories, 92 recipe groups, and 9 stock rows.
- Two stock rows matched exactly; seven remain unresolved and were not guessed.
- The preview recorded 153 review rows: 146 warnings and 7 unmatched stock rows. The database retains 167 ImportError rows covering invalid or unresolved source records.
- Recetas row 420 is marked SOURCE_CONFLICT. Its ambiguous block was excluded and its ingredients did not leak into the previous recipe.
- The separate quotation workbook Cotizador_V2_GREDA_Funcional_sin_factor_horno.xlsx is not a master import workbook.

## Verification

- Backend: 39/39 tests passed. Lint, typecheck, build, Prisma validate/generate, and npm audit passed; no npm audit vulnerabilities were reported.
- Frontend: 20/20 tests passed. Lint, typecheck, build, and npm audit passed; no npm audit vulnerabilities were reported.
- Playwright: 10/10 authenticated tests passed. Coverage includes protected routes and admin navigation; recipe and user create/edit/toggle flows; 13 main routes at 375, 768, 1024, 1280, and 1440 px; full quotation and PDF flow; settings data, ubigeo, logo and document persistence; audit history; catalog and inventory flows; error states; worker, technique, and kiln workflows.
- Across the responsive sweep: 0 console errors, 0 page errors, 0 network 5xx, 0 unexpected 4xx, and 0 CORS errors.
- The saved quotation PDF begins with a valid %PDF- header. The embedded preview rendered gray in prior browser review; the downloaded PDF was valid.
- React Doctor: 0 errors and 35 warnings, including 3 security-category findings. Those findings include sessionStorage token storage and unsandboxed document preview iframes.
- Lighthouse desktop: performance 98, accessibility 100, best practices 100, SEO 63, agentic 50. Mobile: performance 74, accessibility 100, best practices 100, SEO 66, agentic 50.
- Docker Compose build and local API/database health checks passed. Carpintería :8080 remained healthy after GREDA started.

## Remaining review

The literal manual button-by-button sweep has not been completed. The automated tests cover the main user flows, but they do not certify every visible button. The local build is ready for user review at http://127.0.0.1:8081. The report keeps this manual gate explicit.

## Published source

- Backend implementation commit: 3dd8556
- Frontend implementation commit: 8b2b37a
- Backend remote: https://github.com/Anthgg/Bcotizador.git
- Frontend remote: https://github.com/Anthgg/cotizador.git
