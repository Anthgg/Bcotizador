# GREDA_CLEAN_REBUILD_LOCAL

STATUS: BLOCKED

BACKEND_PATH: C:\Users\anthg\bcotizador
BACKEND_REPO: https://github.com/Anthgg/Bcotizador.git
BACKEND_COMMIT: 3dd8556

FRONTEND_PATH: C:\Users\anthg\cotizador
FRONTEND_REPO: https://github.com/Anthgg/cotizador.git
FRONTEND_COMMIT: 8b2b37a

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
PDF: PASS
AUDIT_BEFORE_AFTER: PASS
RBAC: PASS
BACKEND_TESTS: 39/39 passed
FRONTEND_TESTS: 20/20 passed
PLAYWRIGHT: 10/10 passed

MANUAL_BUTTON_BY_BUTTON: FAIL (the exhaustive literal manual sweep is still pending; automated E2E coverage is recorded separately)
VIEWPORT_375: PASS
VIEWPORT_768: PASS
VIEWPORT_1024: PASS
VIEWPORT_1280: PASS
VIEWPORT_1440: PASS
CONSOLE_ERRORS: 0
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
BLOCKERS: exhaustive manual button-by-button review remains pending; legacy code roots were preserved per the later instruction
NEXT_ACTION: USER_LOCAL_REVIEW
FINAL: BLOCKED

## Local evidence

- GREDA is healthy at 127.0.0.1:8081. Carpintería remains healthy at 127.0.0.1:8080; Inventario was untouched. Only GREDA frontend port 8081 is published on the host.
- The dedicated local test account has ADMIN role. No credential is recorded here.
- The workbook contains 265 products, 15 contacts, 16 hierarchical categories, 92 recipe groups, and 9 stock rows. The import warning set includes 7 unmatched stock rows and SOURCE_CONFLICT at Recetas row 420; ambiguous source data was not guessed.
- The 10 authenticated Playwright tests passed, including responsive coverage at all five widths, quotation save/confirm/PDF, settings persistence and audit history, users, recipes, catalog workflows, and error states.
- The downloaded quotation PDF has a valid PDF header. The embedded preview rendered gray during prior browser review; the downloaded PDF was valid.
- The importer reported 153 review rows (146 warnings and 7 unmatched stock rows); 167 ImportError records remain in the local database for unresolved or invalid source rows.
- React Doctor reported 35 warnings and no errors. Its security-category findings include sessionStorage token storage and unsandboxed document preview iframes; Lighthouse results are recorded above.
- Local QA data created during the authenticated E2E and workbook import remains in the local database. No production or cloud data was touched.
- The exhaustive manual button-by-button pass has not been completed, so this report remains BLOCKED for user local review.
