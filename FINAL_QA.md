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
QUOTATION_SCENARIO_MATRIX: PASS (existing/custom piece, glaze/no glaze, one/multiple techniques, molds, illustration, first/second/both firings, small/large kiln, shared/exclusive, override/no override, Pormenor/Por mayor)
IMMUTABLE_CONFIRMED_SNAPSHOT: PASS
PDF_GENERATION: PASS (authenticated API returned 200 application/pdf, 11,262 bytes, with a %PDF- header)
PDF_DOWNLOAD: PASS (isolated Chromium download event completed as CTZ-2026-000025.pdf; downloaded bytes begin %PDF-)
PDF_QUOTE_DETAIL_PREVIEW: PASS_HEADED_EDGE (PDF content and viewer toolbar rendered; the default zoom clips the right edge of the 742px frame; see test-results/codex-quotation-pdf-review-edge.png)
PDF_SETTINGS_SAMPLE_PREVIEW: PASS_HEADED_EDGE (sample PDF content rendered; default zoom exceeds the 418px preview width; see test-results/codex-settings-pdf-review-edge.png)
AUDIT_BEFORE_AFTER: PASS
RBAC: PASS
BACKEND_TESTS: 74/74 passed (current local rebuild; includes 20 assistant-specific tests)
FRONTEND_TESTS: 26/26 passed (current local rebuild)
PLAYWRIGHT: 23/23 passed (fresh Docker images including firing consolidation)
LINT: PASS (backend: no findings; frontend: 0 errors and 2 non-blocking warnings)
DEPENDENCY_AUDIT: PASS (0 vulnerabilities in backend, frontend, and Docker production dependencies; sharp 0.35.5)

GREDA_ASSISTANT: PASS
CONTEXTUAL_STEP_HELP: PASS (7 versioned Cotizador step guides; explicit route/module/step context test)
KNOWLEDGE_BASE: PASS (versioned and ADMIN-editable)
SUPERVISED_LEARNING: PASS (unresolved prompts remain suggestions until ADMIN approval)
OPERATIONAL_MEMORY: PASS (structured outcomes/events; no free-text-only memory)
QUOTATION_OUTCOMES: PASS (estimated and real amounts/times remain separate; customer data omitted)
FIRING_OUTCOMES: PASS (estimated/real cost and occupancy stored separately)
HISTORICAL_SIMILARITY: PASS (deterministic quotation and firing similarity)
COST_RECOMMENDATIONS: PASS (rules and historical outcomes; backend-owned calculation)
CONSEQUENCE_EXPLANATIONS: PASS (cost, time, quality/finish and approval constraints are returned)
WHAT_IF_SIMULATOR: PASS
SIMULATION_PERSISTS_CHANGES: NO
EXPLICIT_APPLY_ONLY: PASS (apply returns a draft input; it does not persist the quotation)
MOLD_TIME_RECOMMENDATIONS: PASS (CEIL(cantidad / moldes); hourly vs INTERNAL_INCLUDED cost distinction)
FIRING_HISTORY_RECOMMENDATIONS: PASS (deterministic similarity and minimum-case confidence)
RECOMMENDATION_CONFIDENCE: PASS (case count, similarity, consistency, and persisted outcomes)
RECOMMENDATION_FEEDBACK: PASS
RECOMMENDATION_OUTCOME_LEARNING: PASS (10 consistent measured outcomes raised confidence; persistence test added)
ASSISTANT_RBAC: PASS (OPERARIO cost-detail redaction and owner-only feedback)
GUIDED_TOUR: PASS (authenticated Playwright flow)
EXTERNAL_LLM_REQUIRED: NO
READY_FOR_FUTURE_LLM_PROVIDER: YES

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
BLOCKERS: exhaustive manual button-by-button review remains pending
NON_BLOCKING_VISUAL_NOTE: PDF previews render in headed Edge; default zoom clips the page horizontally inside the quote-detail and settings preview panels
NEXT_ACTION: FINISH_MANUAL_REVIEW
FINAL: BLOCKED

## Local evidence

- GREDA is healthy at 127.0.0.1:8081. Carpintería remains healthy at 127.0.0.1:8080; Inventario was untouched. Only GREDA frontend port 8081 is published on the host.
- Latest integrated verification (2026-10-01): backend 74/74 tests, frontend 26/26, and all 23 Playwright tests passed after rebuilding both Docker images. `/api/health` returned 200; Prisma reported all 6 migrations applied and the schema up to date; both GREDA `:8081` and Carpintería `:8080` returned 200.
- An isolated Chromium login to `:8081` captured and visually reviewed the actual authenticated Inicio page at 1440×1000 (`test-results/codex-dashboard-review.png`); it had 0 console and page errors. The current IAB tab remains at `/login`.
- The dedicated local test account has ADMIN role. No credential is recorded here.
- The workbook contains 265 products, 15 contacts, 16 hierarchical categories, 92 recipe groups, and 9 stock rows. The import warning set includes 7 unmatched stock rows and SOURCE_CONFLICT at Recetas row 420; ambiguous source data was not guessed.
- The latest authenticated Playwright suite passed 23/23 in 2.1 minutes, including the established user flows and assistant tests; the detailed current browser-only PDF/manual-review limits remain below.
- One already-open tab showed “SIN CONEXIÓN” because it requested the old `ProductsPage-DfXxtGN-.js` chunk, which no longer exists in the rebuilt image. Nginx returned the 782-byte SPA document for that asset, and the dynamic import failed. Reloading the tab loaded the current `ProductsPage-CaSOOwH7.js`; Productos then showed 278 rows and search/pagination worked. `/api/health` returned `status: ok` and `database: ok`. The stale-tab error did not recur on the reloaded page.
- An authenticated isolated Chromium review opened confirmed QA quotation CTZ-2026-000025. The PDF endpoint returned HTTP 200, `application/pdf`, 11,262 bytes; the `Descargar PDF` link emitted a completed download event for `CTZ-2026-000025.pdf`, whose bytes begin `%PDF-`. Headless Chromium showed a blank PDF frame, but headed Edge rendered the PDF and toolbar with no console or page errors (`test-results/codex-quotation-pdf-review-edge.png`). The headless screenshot behavior was environmental, not a GREDA PDF generation failure.
- Headed Edge also rendered the Configuración > Documentos sample PDF (`test-results/codex-settings-pdf-review-edge.png`). At the default viewer scale, some right-side content extends beyond the 742px quotation frame and 418px settings frame; the viewer toolbar is available on the quotation detail to adjust zoom. No source response defect was found.
- The combined quotation matrix covered the remaining cases in local, unsaved UI drafts. A current scenario used Bowl Chico Textura Malla, 20 pieces, 2 molds, 60 min/cycle, 10×8×6 cm, 450 g of Arcilla Potter, TENMOKU 452, and a 2-hour applied illustration override. First firing was shared on Horno chico; second was exclusive on Horno grande. Assigned firing costs were S/ 136.27 and S/ 272.54; total was S/ 8,132.19 at factor 3 and S/ 10,717.05 at factor 4, returning to S/ 8,132.19 when reset. The same inputs returned S/ 8,132.19 for Por mayor and Pormenor customers. The run produced no quote writes, page errors, or 5xx responses (`test-results/codex-illustration-matrix-price.png`). Earlier local drafts/E2E covered no glaze, multiple techniques, first/second-only toggles, and no manual labor override.
- The importer reported 153 review rows (146 warnings and 7 unmatched stock rows); 167 ImportError records remain in the local database for unresolved or invalid source rows.
- React Doctor reported 35 warnings and no errors. Its security-category findings include sessionStorage token storage and unsandboxed document preview iframes; Lighthouse results are recorded above.
- Local QA data created during the authenticated E2E and workbook import remains in the local database. No production or cloud data was touched.
- Manual review visited Inicio, Cotizador, Cotizaciones, Productos, Inventario, Recetas, Clientes, Trabajadores, Técnicas, Hornos, Importar maestro, Configuración, and Usuarios. It checked key forms, blank-field validation, filters, action menus, and the seven-step draft quote without saving changes. It did not complete every create/edit/save/cancel/back/refresh/search/filter/pagination/delete/activate/deactivate action in the pasted checklist.
- In the resumed local quote draft, the Cliente step rejected Continue without a customer and showed “Selecciona un cliente para continuar.” Quick-create customer fields and product dimensions/quantity/paste-weight controls were inspected; the quick-create form was closed without creating a record. Pasta and glaze selectors displayed catalog options and were closed without changing the draft.
- Cotizaciones search for CTZ-2026-000006 returned exactly one row; clearing restored all 11 current records. The Confirmadas filter retained the 11 confirmed records, Borradores returned the empty state, and Limpiar filtros restored the list. The action menu exposed Abrir and Cancelar cotización; no cancellation was performed.
- The latest Inicio screenshot shows 4 drafts, 21 confirmed quotations, 298 active products, and 276 products without stock. These counts include local E2E data and change across runs; the workbook import totals are recorded separately. The earlier inventory audit recorded 265 at zero stock and 9 positive-stock products before later E2E records were created.
- The automated quotation E2E covers one complete custom-piece flow with materials, glaze, worker/technique, firing, pricing, confirmation, and PDF. The combined local matrix now covers the specified existing/custom piece, glaze/no-glaze, technique, mold, firing-stage/mode/kiln, override, and customer-type cases. The matrix scenario itself stayed as a browser draft and did not create or confirm another quotation.
- The exhaustive manual button-by-button pass remains pending, so this report remains BLOCKED. Embedded PDF previews and downloads are verified in headed Edge; only default-scale clipping remains as a visual note.
- QA quotations CTZ-2026-000006 and CTZ-2026-000025 were emitted locally by authorized verification flows. The latter's PDF download was verified in isolated Chromium; no external delivery occurred.
