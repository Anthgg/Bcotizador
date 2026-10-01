# GREDA backend

API local para GREDA: NestJS 11, TypeScript, Prisma 7 y PostgreSQL 16. El backend es la autoridad de permisos y de todos los cálculos monetarios. El prefijo REST es `/api`; las respuestas JSON usan camelCase y los valores Prisma `Decimal` se serializan como cadenas.

## Puesta en marcha local

Requiere Node.js 22.12 o superior para desarrollo y Docker. Copia `.env.example` a `.env` y reemplaza los tres placeholders por secretos locales aleatorios. `.env` está ignorado por Git y excluido del contexto Docker.

```powershell
Copy-Item .env.example .env
# Edita .env y reemplaza POSTGRES_PASSWORD, JWT_SECRET y BOOTSTRAP_SECRET.
docker compose up --build -d
```

El Compose de este repositorio publica únicamente el frontend en `http://127.0.0.1:8081`; Nginx enruta `/api/*` al backend privado en el puerto 3000. PostgreSQL escucha solo dentro de la red Compose en 5432. El contenedor backend ejecuta `prisma migrate deploy` antes de iniciar Nest. La migración inicial está en `prisma/migrations/20261001000000_init/`.

Para ejecutar la API fuera de Docker, configura `DATABASE_URL` con una base PostgreSQL local, después corre:

```powershell
npm ci
$env:DATABASE_URL = 'postgresql://greda:CAMBIA_ESTA_CLAVE@localhost:5432/greda?schema=public'
npx prisma generate
npm run prisma:migrate
npm run start:dev
```

`GET /api/health` responde el estado de vida del proceso. Swagger está habilitado solamente cuando `NODE_ENV=development`, en `/api/docs`.

### Variables

- `POSTGRES_PASSWORD`: contraseña local que Compose usa para PostgreSQL.
- `DATABASE_URL`: conexión del backend/Prisma. Compose la construye con `POSTGRES_PASSWORD` y el hostname privado `db`.
- `JWT_SECRET`: secreto aleatorio largo para tokens JWT.
- `JWT_EXPIRES_IN`: duración del token; valor predeterminado `8h`.
- `BOOTSTRAP_SECRET`: secreto local de una sola inicialización. No se envía al navegador como valor predeterminado; el administrador inicial lo escribe durante el setup.
- `CORS_ORIGINS`: orígenes permitidos en desarrollo directo. Con el proxy same-origin de Compose no se requiere una exposición CORS adicional.
- `TRUST_PROXY`: habilita el tratamiento de cabeceras de proxy.
- `MAX_UPLOAD_MB`: límite de carga XLSX; predeterminado `20`.

## Inicialización, usuarios y permisos

No se importan datos de `bdxls` durante el arranque. Al crear el primer administrador, `POST /api/auth/bootstrap` valida `x-bootstrap-secret` y crea, de forma transaccional, los settings predeterminados, las 10 técnicas V2 y los dos hornos V2. El `upsert` conserva cualquier configuración existente y genera eventos de auditoría para los defaults nuevos. No crea productos, contactos, clientes ni trabajadores. Los defaults quedan editables desde catálogo/configuración.

```json
{
  "email": "admin@local.test",
  "displayName": "Administrador",
  "password": "una-clave-local-larga"
}
```

Luego autentica con `POST /api/auth/login` (`{ "email": "...", "password": "..." }`) y envía `Authorization: Bearer <accessToken>`. `GET /api/auth/me` devuelve el usuario activo. Los roles son `ADMIN`, `OPERARIO` y `TESTER`; las rutas de usuarios, settings e importaciones requieren ADMIN, y las mutaciones de catálogo/operación requieren ADMIN u OPERARIO. Las rutas protegidas verifican el rol en el backend.

El bootstrap es de una sola vez: después de crear el primer usuario devuelve conflicto si se intenta repetir. Usuarios: `GET/POST /api/users`, `PATCH/DELETE /api/users/:id` (ADMIN). Nunca se devuelve `passwordHash`.

## Contrato de API

Éxito: `{ "data": ... }`. Errores: `{ "error": { "code": "...", "message": "...", "details": ... } }`. Listados de catálogo devuelven `{ "data": [...], "pagination": { "total", "page", "pageSize" } }`. Las búsquedas aceptan `q`, `page`, `pageSize` y, cuando aplica, `isActive`, `categoryId` o `productType`.

### Inicio y catálogo

- `GET /api/dashboard` → `{data:{counts:{products,customers,drafts,pendingImports,importErrors},recentQuotations:[...]}}`.
- CRUD (GET listado/detalle, POST, PATCH y DELETE): `/api/products`, `/api/product-categories`, `/api/pos-categories`, `/api/contacts`, `/api/customers`, `/api/recipes`, `/api/workers`, `/api/techniques`, `/api/kilns`.
- Un producto acepta `internalReference`, `name`, `productType` (`RAW_MATERIAL | PREPARED_MATERIAL | FINISHED_PRODUCT | SERVICE`), `categoryId`, `posCategoryId`, `salesTax`, `purchaseTax`, `canSell`, `canBuy`, `posAvailable`, `salePrice`, `unitCost`, `costPerGram`, `costUnit`, `unit`, `purchaseUnit` e `isActive`.
- Clientes usan `displayName`, `customerType`, `contactId?`, `isActive`. `customerType` admite `STUDENT` (Alumno), `PORMENOR` (Pormenor) y `WHOLESALE` (Por mayor), y puede ampliarse; no se aplica una regla de precios implícita.
- Trabajadores usan `code?`, `name`, `workerType` (`INTERNAL | EXTERNAL`), `dailyRate?`, `hoursPerDay?` y `isActive`.
- Técnicas usan `code?`, `name`, `rule` (`UN_FACTOR | DOS_FACTORES | SIMPLE`), `factor1?`, `factor2?`, `cycleRate?` e `isActive`.
- Hornos usan `code?`, `name`, `class?`, `capacityCm3`, `lowRate`, `highRate` e `isActive`. No existe un factor multiplicador de horno.
- Defaults técnicos V2: A mano (15; S/110/ciclo), torno fácil (50/100; S/220), torno difícil (25/100; S/220), colada (100; S/220), armado de asa (50; S/110), fabricación de molde (SIMPLE; S/250), tres técnicas de vidriado (50; S/110) e ilustración (50; S/110). Hornos: chico (17,000 cm³, S/90 baja, S/180 alta), grande (200,000 cm³, S/1,000 baja, S/2,000 alta). Se crean al bootstrap y pueden editarse.

### Técnicas por trabajador y producto

- `GET /api/workers/:workerId/techniques` devuelve relaciones con `technique`.
- `POST` o `PUT /api/workers/:workerId/techniques/:techniqueId` hace upsert con `{factor1Override?,factor2Override?,rateOverride?,isActive?}`. `rateOverride` es tarifa por ciclo. `DELETE` en la misma ruta quita la relación.
- `GET /api/products/:productId/techniques` devuelve relaciones ordenadas por `order`, con `technique` y `defaultWorker`.
- `POST` o `PUT /api/products/:productId/techniques/:techniqueId` hace upsert con `{defaultWorkerId?,order?,isRequired?}`. `DELETE` en la misma ruta quita la relación.

### Inventario

- `GET /api/inventory` lista productos activos con su saldo calculado, incluido saldo `0` cuando no hay movimientos.
- `GET /api/inventory/:productId/movements` muestra el historial.
- `POST /api/inventory/movements` acepta `{productId,locationId?,type,quantity,unit,reason?}`. Tipos: `OPENING_BALANCE`, `ENTRY`, `EXIT`, `ADJUSTMENT`. Las salidas no pueden dejar saldo negativo; los ajustes usan cantidad firmada. Cada cambio crea un movimiento y un audit event. Cotizar no descuenta inventario.

### Recetas y materiales

- Receta: `{outputProductId,yieldQuantity,yieldUnit,items:[{ingredientProductId,quantity,unit}]}`.
- `GET /api/recipes/:id/cost` calcula costo total, costo unitario por unidad de rendimiento, detalle por ingrediente y `costStatus` (`READY` o `COST_INCOMPLETE`). Para preparados, los materiales consultan el costo calculado por receta, incluyendo conversión explícita g↔kg. Una unidad incompatible, costo faltante o ciclo entre recetas se informa incompleto; no se sustituye por cero.
- Importar filas continuadas solo abre una receta cuando la columna de rendimiento tiene cantidad. El literal `268` en otras columnas de una continuación no inicia una receta.

### Configuración y cálculo

- `GET /api/settings` devuelve los valores guardados o los defaults. `PATCH /api/settings` acepta un objeto parcial: `glazeDefaultPct`, `separationXcm/Ycm/Zcm`, `productionFactorDefault`, `productionFactorMin`, `igvRate`, `rentPerDay`, `utilitiesPerDay`, `administrativeCost`, `hoursPerCycle`, `validityDays` y `dayAdjustments`.
- `POST /api/quotation-calculations` acepta `{items:[...] ,productionFactor?,productionDays?}`. Cada línea puede incluir `productId?`, `name?`, `quantity`, dimensiones cm, `clayWeightG`, `clayProductId`, `glazeProductId?`, `glazePercent?`, `laborTasks:[{techniqueId,workerId,quantity,factor1?,factor2?,appliedHours?}]` y `firings:[{stage:'LOW'|'HIGH',enabled,kilnId,firingType:'SHARED'|'EXCLUSIVE'}]`.
- El backend devuelve `READY` o `COST_INCOMPLETE`, warnings con rutas de campos y un breakdown de materiales, trabajos, hornos y totales. Toda labor requiere trabajador y técnica vinculados; los overrides son opcionales.

Reglas V2 aplicadas: esmalte por defecto 15% del peso de pasta; volumen operativo `(largo+separaciónX) × (ancho+separaciónY) × (alto+separaciónZ) × cantidad`; ciclos `ceil(q/factor1)` para `UN_FACTOR`, suma de ambos ceil para `DOS_FACTORES`, y `q` para `SIMPLE`; horas = ciclos × horas configuradas. La tarifa por ciclo usa override trabajador-técnica, luego tarifa de técnica, y como último recurso deriva de tarifa diaria × horas por ciclo / horas por jornada. El compartido usa tarifa × ocupación real distribuida entre hornadas necesarias; exclusivo usa tarifa × `ceil(volumen/capacidad)`. Ningún cálculo multiplica por factor de horno.

Costo técnico = materiales + mano de obra + quema. Días de producción = ciclos de trabajo + ajustes configurados + días adicionales. Otros costos = días × (alquiler diario + servicios diarios) + administrativo. Subtotal = costo técnico × factor de producción + otros costos. IGV = subtotal × tasa IGV; total = subtotal + IGV; precio unitario = total / cantidad total. El cálculo también entrega los precios de referencia sin IGV: costo técnico × factor mínimo/default + otros costos. Defaults: factor producción 3, mínimo 2, IGV 18%, alquiler S/110/día, servicios S/10/día, administrativo S/200.

### Cotizaciones

- `GET/POST /api/quotations`; `GET/PATCH /api/quotations/:id` (PATCH solo DRAFT).
- `POST /api/quotations/:id/confirm` confirma solo si el cálculo está completo. La secuencia `CTZ-AAAA-NNNNNN` se asigna transaccionalmente al crear. Totales, líneas, materiales, labor y hornos aplicados se guardan como snapshot.
- `POST /api/quotations/:id/cancel` cancela; `GET /api/quotations/:id/pdf` genera PDF para cliente.
- El PDF usa datos de cliente/productos, cantidades, precios y subtotal/IGV/total/validez. No expone costos internos, salarios, factores ni rendimiento.

### Importación XLSX y auditoría

- `POST /api/imports/master/preview` recibe multipart `file` `.xlsx`. Devuelve `batchId`, `sha256`, `status`, `alreadyUploaded`, `detectedSheets`, `counts`, `errors`, `warnings`, `ambiguities`. `counts` contiene `products`, `contacts`, `categories`, `posCategories`, `recipes` y `stockRows`; los problemas incluyen `sheet`, `rowNumber?`, `severity`, `code` y `message`.
- `GET /api/imports/master`, `GET /api/imports/master/:id` y `POST /api/imports/master/:id/confirm` son ADMIN. El SHA-256 evita lotes duplicados y una confirmación repetida no duplica productos ni saldos iniciales. Stock sin producto queda como `UNRESOLVED_STOCK_PRODUCT` en preview/confirmación, sin inventar identidad.
- Cada mutación registra actor, acción, entidad y `beforeJson`/`afterJson` cuando corresponda en `AuditEvent`. Eventos de inventario, relaciones y estados de cotización también se registran.

## Comprobaciones locales

```powershell
npm run prisma:validate
npm run typecheck
npm run lint
npm test
npm run build
```

Las pruebas focales cubren reglas de mano de obra, redondeo half-up, costo compartido/exclusivo sin factor, el caso de libro V2 con las dos quemas compartidas, fixtures deterministas adicionales, costo derivado de recetas, costo incompleto y agrupamiento de continuación del XLSX. Los Excel bajo `bdxls/` son fuentes de referencia locales: se excluyen del control de versiones y del contexto Docker, y no se cargan automáticamente.
