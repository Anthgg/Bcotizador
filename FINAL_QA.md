# GREDA_CLEAN_REBUILD_LOCAL

STATUS: BLOCKED

BACKEND_PATH: C:\Users\anthg\bcotizador
BACKEND_REPO: https://github.com/Anthgg/Bcotizador.git
BACKEND_BASE_COMMIT: 43560d5
BACKEND_PUBLISHED_COMMIT: 540ff6c

FRONTEND_PATH: C:\Users\anthg\cotizador
FRONTEND_REPO: https://github.com/Anthgg/cotizador.git
FRONTEND_BASE_COMMIT: 8b2b37a
FRONTEND_PUBLISHED_COMMIT: e0490bc

LOCAL_URL: http://127.0.0.1:8081
ONLY_HOST_PORT: 8081
OLD_GREDA_DOCKER_REMOVED: YES (no legacy GREDA containers, images, volumes, or networks remain)
OLD_GREDA_CODE_REMOVED: NO (legacy roots preserved as later instructed; 39 linked worktrees had already been removed)

MASTER_UPLOAD: PASS (local import confirmed and repeat import was idempotent)
MASTER_PRODUCTS: 265
MASTER_CONTACTS: 15
MASTER_RECIPES: 92 recipe groups
MASTER_STOCK_ROWS: 9 source rows; 2 exact matches and 7 unresolved rows
PRODUCTS_WITHOUT_STOCK_VISIBLE_AS_ZERO: PASS
PRODUCT_INVENTORY_LINK: PASS
PRODUCT_RECIPE_LINK: PASS
RECIPE_COSTING: PASS
WORKERS: PASS
TECHNIQUES: PASS
WORKER_TECHNIQUES: PASS
LEGACY_TECHNIQUE_FACTORS: PASS (not applied)
ADDITIONALS_CONVERTED_TO_WORK: PASS
AUTOMATIC_LABOR_CALCULATION: PASS
LABOR_OVERRIDE: PASS
KILNS_CM3: PASS
KILN_FACTOR_APPLIED: NO
SHARED_FIRING: PASS
EXCLUSIVE_FIRING: PASS
LOW_FIRING: PASS
HIGH_FIRING: PASS
MATERIALS: PASS
GLAZE_15_PERCENT_DEFAULT: PASS
PRODUCTION_FACTOR: PASS
QUOTER_COMPLETE: PASS
EXCEL_PARITY: PASS (fixtures A, B, and C)
QUOTATIONS: PASS
IMMUTABLE_CONFIRMED_SNAPSHOT: PASS
PDF_GENERATION: PASS (the API returned a valid PDF in the existing verification)
PDF_DOWNLOAD_LINK: PASS (visible after confirmation; this IAB session did not expose a completed download event)
PDF_QUOTE_DETAIL_PREVIEW: FAIL_IN_CURRENT_IAB (still blank after a fresh frontend reload; an earlier review appeared to render it)
PDF_SETTINGS_SAMPLE_PREVIEW: FAIL (the iframe is assigned a valid PDF blob, but its rendered area remains blank)
AUDIT_BEFORE_AFTER: PASS
RBAC: PASS
BACKEND_TESTS: 73/73 passed (current local rebuild)
FRONTEND_TESTS: 26/26 passed (current local rebuild)
PLAYWRIGHT: 23/23 passed (fresh Docker images including firing consolidation)
LINT: PASS (backend: no findings; frontend: 0 errors and 2 non-blocking warnings)
DEPENDENCY_AUDIT: PASS (0 vulnerabilities in backend, frontend, and Docker production dependencies; sharp 0.35.5)

MANUAL_BUTTON_BY_BUTTON: FAIL (the exhaustive literal manual sweep is still pending; automated E2E coverage is recorded separately)
VIEWPORT_375: PASS
VIEWPORT_768: PASS
VIEWPORT_1024: PASS
VIEWPORT_1280: PASS
VIEWPORT_1440: PASS
CONSOLE_ERRORS: 0 in the earlier E2E/responsive sweep; one stale-tab dynamic-import error was observed after rebuild and the route loaded after reload
PAGE_ERRORS: 0
NETWORK_5XX: 0
UNEXPECTED_4XX: 0
CORS_ERRORS: 0
REACT_DOCTOR: 0 errors; 35 warnings, including 3 security-category findings
LIGHTHOUSE_DESKTOP: performance 98; accessibility 100; best practices 100; SEO 63; agentic 50
LIGHTHOUSE_MOBILE: performance 74; accessibility 100; best practices 100; SEO 66; agentic 50
SUPABASE_TOUCHED: NO
CLOUD_RUN_TOUCHED: NO
READY_FOR_USER_LOCAL_REVIEW: YES
BLOCKERS: exhaustive manual button-by-button review remains pending; authenticated dashboard visual review is not verified in the current browser; PDF iframe display is inconsistent/blank in the current browser; quotation scenario matrix is only partially covered; this IAB session did not verify a downloaded file
NEXT_ACTION: FINISH_MANUAL_REVIEW_AND_PDF_VALIDATION
FINAL: BLOCKED

## Local evidence

- GREDA is healthy at 127.0.0.1:8081. Carpintería remains healthy at 127.0.0.1:8080; Inventario was untouched. Only GREDA frontend port 8081 is published on the host.
- Latest integrated verification (2026-10-01): backend 73/73 tests, frontend 26/26, and all 23 Playwright tests passed after rebuilding both Docker images. `/api/health` returned 200; Prisma reported all 6 migrations applied and the schema up to date; both GREDA `:8081` and Carpintería `:8080` returned 200.
- The current in-app browser tab displayed `/login`; its authenticated dashboard was not visually inspected in this session. The authenticated Playwright suite did pass.
- The dedicated local test account has ADMIN role. No credential is recorded here.
- The workbook contains 265 products, 15 contacts, 16 hierarchical categories, 92 recipe groups, and 9 stock rows. The import warning set includes 7 unmatched stock rows and SOURCE_CONFLICT at Recetas row 420; ambiguous source data was not guessed.
- The latest authenticated Playwright suite passed 23/23 in 2.1 minutes, including the established user flows and assistant tests; the detailed current browser-only PDF/manual-review limits remain below.
- One already-open tab showed “SIN CONEXIÓN” because it requested the old `ProductsPage-DfXxtGN-.js` chunk, which no longer exists in the rebuilt image. Nginx returned the 782-byte SPA document for that asset, and the dynamic import failed. Reloading the tab loaded the current `ProductsPage-CaSOOwH7.js`; Productos then showed 278 rows and search/pagination worked. `/api/health` returned `status: ok` and `database: ok`. The stale-tab error did not recur on the reloaded page.
- The existing API/PDF check returned valid PDF bytes, and the detail shows a download link. A direct download attempt from this IAB session produced neither a reported download event nor a file at the expected local path, so the app download itself remains unverified in this browser. After a fresh reload, both the quote-detail and Configuración > Documentos PDF iframes remained blank. The settings endpoint returned a valid 11,912-byte, one-page A4 PDF and its iframe received a `blob:` URL. An earlier review appeared to render the quote-detail iframe, so embedded display remains inconsistent across captures; an experimental toolbar-fragment change did not fix the settings preview and was reverted.
- A focused source review found no confirmed PDF response defect: the preview controller sets `Content-Type: application/pdf`, `Content-Disposition: inline`, and `Cache-Control: no-store`; the frontend creates a Blob URL for the iframe; and the PDF frame has an explicit viewport-based height. The integrated browser still renders it blank, so the remaining PDF blocker is viewer-level and unverified; no speculative source change was made.
- The importer reported 153 review rows (146 warnings and 7 unmatched stock rows); 167 ImportError records remain in the local database for unresolved or invalid source rows.
- React Doctor reported 35 warnings and no errors. Its security-category findings include sessionStorage token storage and unsandboxed document preview iframes; Lighthouse results are recorded above.
- Local QA data created during the authenticated E2E and workbook import remains in the local database. No production or cloud data was touched.
- Manual review visited Inicio, Cotizador, Cotizaciones, Productos, Inventario, Recetas, Clientes, Trabajadores, Técnicas, Hornos, Importar maestro, Configuración, and Usuarios. It checked key forms, blank-field validation, filters, action menus, and the seven-step draft quote without saving changes. It did not complete every create/edit/save/cancel/back/refresh/search/filter/pagination/delete/activate/deactivate action in the pasted checklist.
- In the resumed local quote draft, the Cliente step rejected Continue without a customer and showed “Selecciona un cliente para continuar.” Quick-create customer fields and product dimensions/quantity/paste-weight controls were inspected; the quick-create form was closed without creating a record. Pasta and glaze selectors displayed catalog options and were closed without changing the draft.
- Cotizaciones search for CTZ-2026-000006 returned exactly one row; clearing restored all 11 current records. The Confirmadas filter retained the 11 confirmed records, Borradores returned the empty state, and Limpiar filtros restored the list. The action menu exposed Abrir and Cancelar cotización; no cancellation was performed.
- Inicio shows 0 drafts, 11 confirmed quotations, 278 active products, 274 inventory products, and 265 with zero stock. In Inventario the zero-stock filter returned 265 at 0 units; the positive-stock filter returned 9. Those were 7 local E2E pigment products at 2,000 g each and 2 imported opening balances (1,000 g and 800 g); the Óxido de estaño history showed the workbook opening-balance movement. Pagination advanced to 2/11 and returned to 1/11. The inventory action menu exposed history, entry, exit, and adjustment; no movement was changed.
- The automated quotation E2E covers one complete custom-piece flow with materials, glaze, worker/technique, firing, pricing, confirmation, and PDF. The full matrix in the specification remains unverified, including existing products, no glaze, multiple techniques, mold/illustration, first/second/both firings, large kiln and exclusive firing, overrides, and customer types.
- The exhaustive manual button-by-button pass and the full quotation scenario matrix have not been completed, and embedded PDF display remains unresolved, so this report remains BLOCKED.
- QA quote CTZ-2026-000006 was emitted locally to verify confirmation; its status is Confirmada and a PDF download link appeared. No external delivery occurred.
