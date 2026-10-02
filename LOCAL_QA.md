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

- Current integrated verification on 2026-10-01: backend 73/73 tests, frontend 26/26, and full Playwright 23/23 after rebuilding both Docker images. The E2E run completed in 2.1 minutes.
- Backend and frontend lint, typecheck, and build passed for the current source. ESLint reported no backend findings and two non-blocking frontend warnings (Fast Refresh export shape and `loadAdmin` effect dependency). The Docker backend started with all 6 migrations applied; Prisma reported the database schema up to date.
- `npm audit` reported 0 vulnerabilities in both repositories after updating `sharp` to 0.35.5; Docker's production install also reported 0 vulnerabilities.
- GREDA frontend `http://127.0.0.1:8081`, GREDA `/api/health`, and Carpintería `http://127.0.0.1:8080` returned HTTP 200. The GREDA host binding remains limited to 8081.
- The authenticated Playwright suite passed, including the established protected-route, quotation, catalog, settings, and assistant flows. The current in-app browser tab displayed `/login`, so this session did not independently verify the signed-in dashboard visually.
- Across the responsive sweep: 0 console errors, 0 page errors, 0 network 5xx, 0 unexpected 4xx, and 0 CORS errors.
- One already-open tab showed “SIN CONEXIÓN” because it requested the old `ProductsPage-DfXxtGN-.js` chunk, which no longer exists in the rebuilt image. Nginx returned the 782-byte SPA document for that asset, and the dynamic import failed. Reloading the tab loaded the current `ProductsPage-CaSOOwH7.js`; Productos then showed 278 rows and search/pagination worked. `/api/health` returned `status: ok` and `database: ok`. The stale-tab error did not recur on the reloaded page.
- The existing API/PDF check returned valid PDF bytes and the detail shows a download link. A direct download attempt from this IAB session produced neither a reported download event nor a file at the expected local path, so download remains unverified in this browser. After a fresh reload, both the quote-detail PDF iframe and Configuración > Documentos sample iframe remained blank although PDF generation was valid. The settings endpoint returned a valid 11,912-byte, one-page A4 PDF and its iframe received a `blob:` URL. An earlier review appeared to render the quote-detail iframe, so the embedded display result is inconsistent across captures; the experimental toolbar-fragment change was reverted.
- React Doctor: 0 errors and 35 warnings, including 3 security-category findings. Those findings include sessionStorage token storage and unsandboxed document preview iframes.
- Lighthouse desktop: performance 98, accessibility 100, best practices 100, SEO 63, agentic 50. Mobile: performance 74, accessibility 100, best practices 100, SEO 66, agentic 50.
- Docker Compose build and local API/database health checks passed. Carpintería :8080 remained healthy after GREDA started.

## Remaining review

The manual review visited Inicio, Cotizador, Cotizaciones, Productos, Inventario, Recetas, Clientes, Trabajadores, Técnicas, Hornos, Importar maestro, Configuración, and Usuarios. It checked key forms, blank-field validation, filters, action menus, and the seven-step draft quote without saving changes. In the resumed quote draft, Continue without a customer displayed “Selecciona un cliente para continuar.” Quick-create customer fields and product dimensions/quantity/paste-weight controls were inspected; the form was closed without creating a record. Pasta and glaze selectors displayed catalog options and were closed without changing the draft. On Cotizaciones, search by CTZ-2026-000006 returned one row and clearing restored all 11 current records; Confirmadas retained the 11 confirmed records and Borradores returned the empty state. The action menu exposed Abrir and Cancelar cotización; no cancellation was performed. It did not complete every create/edit/save/cancel/back/refresh/search/filter/pagination/delete/activate/deactivate action from the pasted checklist. Automated tests cover the main flows but do not certify every visible button.

The automated quotation E2E covers one complete custom-piece flow with materials, glaze, worker/technique, firing, pricing, confirmation, and PDF. The specification's full scenario matrix remains unverified: existing product, no glaze, multiple techniques, mold/illustration, first/second/both firings, large kiln/exclusive firing, overrides, and customer types.

The current dashboard shows 0 drafts, 11 confirmed quotations, 278 active products, 274 inventory products, and 265 without stock. Inventario's zero-stock filter showed 265 at 0 units; the positive-stock filter showed 9 (7 local E2E test pigments at 2,000 g each and 2 imported opening balances at 1,000 g and 800 g). Óxido de estaño history showed the imported opening-balance movement. Pagination passed forward/backward between 1/11 and 2/11, and its action menu exposed history, entry, exit, and adjustment. No inventory movement was changed.

PDF behavior remains unresolved in the current browser: after a fresh page reload, both the Configuración > Documentos sample preview and the quote-detail capture were blank despite valid PDF generation and a visible download link. The preview controller sends `application/pdf` inline with `no-store`, the frontend assigns a Blob URL to the iframe, and its CSS height is explicit. The IAB automation did not produce a verifiable download event/file, while an earlier quote-detail review appeared to render. This leaves viewer-level rendering/download confirmation unresolved; no source defect has been established.

QA quote CTZ-2026-000006 was emitted locally to verify confirmation; its status is Confirmada and a PDF download link appeared. No external delivery occurred.

The local build is ready for review at http://127.0.0.1:8081. The report keeps the manual sweep, quotation matrix, authenticated visual review, and embedded PDF display as separate remaining gates.

## Published source

- Backend implementation commit: 3dd8556
- Frontend implementation commit: 8b2b37a
- Backend remote: https://github.com/Anthgg/Bcotizador.git
- Frontend remote: https://github.com/Anthgg/cotizador.git
