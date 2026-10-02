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

- Current integrated verification on 2026-10-01: backend 74/74 tests (20 assistant-specific cases), frontend 26/26, and full Playwright 23/23 after rebuilding both Docker images. The E2E run completed in 2.1 minutes.
- Backend and frontend lint, typecheck, and build passed for the current source. ESLint reported no backend findings and two non-blocking frontend warnings (Fast Refresh export shape and `loadAdmin` effect dependency). The Docker backend started with all 6 migrations applied; Prisma reported the database schema up to date.
- `npm audit` reported 0 vulnerabilities in both repositories after updating `sharp` to 0.35.5; Docker's production install also reported 0 vulnerabilities.
- GREDA frontend `http://127.0.0.1:8081`, GREDA `/api/health`, and Carpintería `http://127.0.0.1:8080` returned HTTP 200. The GREDA host binding remains limited to 8081.
- The authenticated Playwright suite passed, including protected-route, quotation, catalog, settings, and assistant flows. An isolated Chromium login also captured and visually reviewed Inicio at 1440×1000 (`test-results/codex-dashboard-review.png`) with 0 console/page errors. The separate current IAB tab remains at `/login`.
- Across the responsive sweep: 0 console errors, 0 page errors, 0 network 5xx, 0 unexpected 4xx, and 0 CORS errors.
- One already-open tab showed “SIN CONEXIÓN” because it requested the old `ProductsPage-DfXxtGN-.js` chunk, which no longer exists in the rebuilt image. Nginx returned the 782-byte SPA document for that asset, and the dynamic import failed. Reloading the tab loaded the current `ProductsPage-CaSOOwH7.js`; Productos then showed 278 rows and search/pagination worked. `/api/health` returned `status: ok` and `database: ok`. The stale-tab error did not recur on the reloaded page.
- An authenticated review opened confirmed QA quotation CTZ-2026-000025. The PDF endpoint returned HTTP 200, `application/pdf`, 11,262 bytes; the `Descargar PDF` link completed a browser download as `CTZ-2026-000025.pdf`, with `%PDF-` at the start. The quote-detail iframe was blank in headless Chromium, but headed Edge rendered its PDF and toolbar with 0 console/page errors (`test-results/codex-quotation-pdf-review-edge.png`). Headed Edge also rendered the Configuración > Documentos sample PDF (`test-results/codex-settings-pdf-review-edge.png`).
- React Doctor: 0 errors and 35 warnings, including 3 security-category findings. Those findings include sessionStorage token storage and unsandboxed document preview iframes.
- Lighthouse desktop: performance 98, accessibility 100, best practices 100, SEO 63, agentic 50. Mobile: performance 74, accessibility 100, best practices 100, SEO 66, agentic 50.
- Docker Compose build and local API/database health checks passed. Carpintería :8080 remained healthy after GREDA started.

## Manual review completed

The manual sweep visited Inicio, Cotizador, Cotizaciones, Productos, Inventario, Recetas, Clientes, Trabajadores, Técnicas, Hornos, Importar maestro, Configuración, and Usuarios. It verified route access, search/clear, applicable filters and pagination, visible action menus, and create-form opening. Empty submits showed required-field feedback; Cancel/Volver returned to the prior view without creating records. Delete confirmation dialogs were opened and canceled across the listed modules; the permanent delete submission was not run because it cannot be undone. Existing Playwright flows cover successful create/edit/save and activate/deactivate paths. Final screen evidence: `test-results/codex-final-local-review.png`.

Inventory non-decrement was checked through the authenticated UI: quote CTZ-2026-000036 used 1,000 g Óxido de estaño (PRD-000254), calculated S/ 7,079.07, was saved as a draft, then canceled. Before and after save/cancel the balance remained 1,000 g; the movement drawer still showed only the opening balance. Evidence: `test-results/codex-final-local-review.png`. The quote remains only as a canceled local QA record; no external delivery occurred.

The automated quotation E2E covers one complete custom-piece flow with materials, glaze, worker/technique, firing, pricing, confirmation, and PDF. Combined with the local quotation drafts, the requested matrix is now covered: existing and custom pieces; glaze and no glaze; one and multiple techniques; molds and illustration; first, second, and both firings; small/large kilns; shared/exclusive firing; labor override and no override; Pormenor/Por mayor.

The latest unsaved UI matrix used Bowl Chico Textura Malla (20 pieces; 2 molds; 60 min/cycle; 10×8×6 cm; 450 g Arcilla Potter; TENMOKU 452; illustration override 2 h). First firing was shared on Horno chico; second was exclusive on Horno grande. Assigned firing costs were S/ 136.27 and S/ 272.54. Total was S/ 8,132.19 at factor 3 and S/ 10,717.05 at factor 4, returning to S/ 8,132.19 when reset. The same inputs returned S/ 8,132.19 for Por mayor and Pormenor. No quotation was saved or emitted in this run; the browser recorded zero quote writes, page errors, and 5xx responses. Screenshot: `test-results/codex-illustration-matrix-price.png`.

The latest Inicio screenshot shows 4 drafts, 21 confirmed quotations, 298 active products, and 276 products without stock. These totals include local E2E records and change across runs; the workbook import totals above are stable. The earlier inventory snapshot recorded 265 at zero stock and 9 with stock before later E2E records were created. Óxido de estaño history showed the imported opening-balance movement. Pagination passed forward/backward between 1/11 and 2/11, and its action menu exposed history, entry, exit, and adjustment. No inventory movement was changed.

PDF generation, direct download, and embedded rendering are verified in headed Edge. At the default viewer scale, right-side page content extends beyond the 742px quote-detail and 418px settings preview panels; the quotation viewer exposes zoom controls. The preview controller sends `application/pdf` inline with `no-store`, the frontend assigns a Blob URL to the iframe, and its CSS height is explicit. Headless Chromium did not paint the built-in PDF viewer, which was specific to that capture mode.

QA quote CTZ-2026-000006 was emitted locally to verify confirmation; its status is Confirmada and a PDF download link appeared. No external delivery occurred.

The local build is ready for review at http://127.0.0.1:8081. Authenticated Inicio/PDF reviews and the safe manual module sweep are complete; permanent delete submissions remain unverified.

## Published source

- Backend implementation commit: 540ff6c; backend follow-up/test commit: 2820813 (both published to `origin/main`; base 43560d5)
- Frontend implementation commit: e0490bc (published to `origin/main`; base 8b2b37a)
- Backend remote: https://github.com/Anthgg/Bcotizador.git
- Frontend remote: https://github.com/Anthgg/cotizador.git
