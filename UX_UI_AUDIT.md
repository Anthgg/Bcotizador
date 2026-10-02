# GREDA — Auditoría UX/UI y rediseño integral

Fecha: 2026-10-01 · Entorno: local (`http://127.0.0.1:8081`, Docker Compose). Sin Supabase, sin Cloud Run.

> El puerto `8080` pedido corresponde a otro proyecto local (Carpintería). GREDA se publica en `127.0.0.1:8081` y no se tocó Carpintería.

## 1. Problemas encontrados

| Área | Problema |
|---|---|
| Códigos | Trabajador, técnica y horno pedían el código a mano (`TEC001`, `HOR-CH`). Los productos y clientes no tenían código de sistema. |
| Unidades | Eran texto libre y había una misma unidad escrita de varias formas (`gr`, `Unidad`, `unit`). Las recetas, el inventario y el producto usaban inputs de texto. El saldo de inventario sumaba cantidades con unidades distintas. |
| Campos técnicos | El producto exponía `costPerGram`, `costUnit`, impuestos como número suelto y referencia interna editable. |
| Selectores | Clientes pedía elegir el «Contacto asociado» por ID. Las categorías y las relaciones con técnicas eran confusas. |
| Formularios | Un CRUD genérico en modal largo para todos los maestros, sin secciones ni validación por campo. |
| Errores | Mensajes técnicos («x tiene un valor o tipo inválido», «name es obligatorio»). Un borrado con FK devolvía 500 y una ruta inexistente un «Cannot GET» en inglés. |
| Estados | Spinners grandes, sin skeletons, «Sin datos» genérico, sin 403/404/offline coherentes. Un 5xx en `/auth/me` cerraba la sesión. |
| Listados | Búsqueda client-side sobre 500 filas, sin «Limpiar filtros» y con tres o cuatro botones de acción por fila. |
| Cotizador | Siete pasos en una sola página larga, factores y horas como inputs principales, quema sin visualización, precio con montos dispersos. |
| Configuración | Formulario genérico generado desde el JSON de settings, sin datos de empresa, logo, documentos, numeración ni historial legible. |
| PDF | Texto plano negro sin encabezado, sin datos de empresa, sin tabla ni footer. |
| Rendimiento | Bundle inicial de ~120 KB gz y nginx sin compresión gzip. |

## 2. Cambios realizados

### Backend (`bcotizador`)

**Datos y códigos**

- **Migración `20261001200000_ux_codes_units_company`:**
  - Tablas `NumberSequence`, `CompanyProfile`, `CompanyLogo` y `DocumentSettings`.
  - Columnas `code` en producto, cliente y movimiento.
  - En producto: `isStockable` y la ficha de pieza (medidas, peso de pasta, pasta y esmalte predeterminados).
  - Defaults de quema y redondeo en settings.
  - Normalización de unidades existentes (`gr`→`g`, `Unidad/unit`→`und`).
  - Backfill de códigos `PRD-/CLI-/TRB-/TEC-/HOR-/MOV-000001`; las cotizaciones continúan con `CTZ-AAAA-NNNNNN`.
- **`SequenceService`:** reserva atómica (`UPDATE … RETURNING`) dentro de la transacción de cada alta. El código nunca se acepta desde la API («El código se genera automáticamente.»). La referencia del maestro (`internalReference`) se conserva aparte.
- **Catálogo de unidades** (`g, kg, ml, L, cm³, cm, cm², und, día, hora`): incluye alias y conversión g↔kg y ml↔L. Producto, receta e inventario validan contra él. El inventario convierte la cantidad a la unidad del producto.
- **Importación:** tras confirmar, `MasterNormalizerService` asigna códigos y unidades canónicas a lo importado.

**Errores y validación**

- Validación con un mensaje humano por campo (`VALIDATION_ERROR` + `details[{field,message}]`), DNI/RUC/correo/teléfono incluidos.
- Prisma P2002/P2003/P2025 se responden como 409/404 legibles («Este producto ya existe», «está en uso… desactívalo»).
- Las 404 de ruta, los mensajes en inglés y los 5xx se responden en español sin filtrar detalles internos.

**Configuración**

- Empresa: el ubigeo INEI 2022 deriva departamento, provincia, distrito y país.
- Logo: subida y borrado, validación por contenido PNG/JPG/WEBP con máximo `LOGO_MAX_MB`.
- Documentos, numeración (prefijo y dígitos; el correlativo no se edita) e historial con diff legible Antes→Después por campo.

**PDF**

- Renderer nuevo, compartido con la vista previa de Documentos:
  - Encabezado con logo y datos de empresa, y bloque «COTIZACIÓN» con código, fecha y vigencia.
  - Tarjeta de cliente y tabla con encabezado repetido, sin cortar filas.
  - Totales agrupados con TOTAL destacado.
  - Condiciones, forma de pago y banco, firma opcional, footer con número de página.
- No incluye costos internos, factores ni márgenes (cubierto por test).

**Otros**

- Redondeo comercial opcional del precio sin IGV (`NONE` por defecto, conserva el resultado V2), repartido entre líneas.
- Recetas: vista previa de costo sin guardar (`POST /recipes/cost-preview`).
- Usuarios: guarda contra quedar sin administrador activo.
- Dashboard con conteos útiles.

### Frontend (`cotizador`)

**Base**

- **Dependencias** (compatibles con React 18, sin Tailwind): Radix (dialog, alert-dialog, popover, dropdown, tabs, switch, tooltip), Sonner, Motion, React Hook Form, Zod y Inter autoalojada.
- **Sistema de diseño propio** (`components/ui`): `Button` (primary negro, secondary blanco con borde, destructive rojo, ghost) y campos con error bajo el input y animación discreta. También `SelectField`/`SearchSelect`/`UnitSelect` (teclado, búsqueda sin acentos, Escape, clic fuera, ARIA, «Crear «x»»), `SwitchField`, `SegmentedControl` y `ReadonlyField` para valores calculados. Completan el sistema `Dialog`/`Drawer`/`ConfirmDialog`, `ActionsMenu` (…), `DataTable` (skeleton, estado vacío real, tarjetas en móvil), búsqueda con debounce, `FilterChips`, `Pagination`, `ErrorState` (403/404/409/422/500/sin conexión) y toasts uniformes sin duplicados.
- **Shell:** sidebar colapsable con tooltips y estado activo, drawer en móvil, banner sin conexión, error boundary (detecta pérdida de red), rutas lazy y encabezado con breadcrumb y acción primaria. `prefers-reduced-motion` respetado.

**Módulos**

- **Productos:** página dedicada por secciones (información general, clasificación, unidades, costos y precio, comercial, ficha de pieza, técnicas, existencias). Código automático, unidades por selector compatible, costo por gramo derivado y switches.
- **Inventario:** stock de solo lectura. Entrada, salida y ajuste en modal (producto, ubicación con alta rápida, cantidad, unidad compatible, motivo) con vista previa del saldo. Historial en drawer con códigos `MOV-`.
- **Recetas:** editor con producto preparado, rendimiento y unidad. Líneas con buscador, cantidad, unidad y costo calculado. Resumen con costo total, costo por unidad e ingredientes sin costo.
- **Clientes:** tipo (Pormenor, Por mayor, Alumno), documento validado, correo y teléfono. Sin IDs.
- **Trabajadores:** ficha con técnicas que domina; el ajuste propio va plegado.
- **Técnicas:** regla legible («Dos tramos de rendimiento») con ejemplo de ciclos y costo.
- **Hornos:** capacidad en cm³ y tarifas. Sin factor de horno en ningún lugar.
- **Cotizador:**
  - Siete pasos con transición y barra fija (código, cliente, total).
  - Cálculo del servidor en vivo y avisos que llevan al paso correspondiente.
  - Cliente con alta rápida; pieza personalizada o producto que autocompleta medidas, pasta, esmalte y técnicas.
  - Esmalte al 15 % por defecto y trabajador sugerido.
  - Quema con barra de ocupación y hornadas.
  - Precio jerárquico con TOTAL principal.
  - Revisar con emisión confirmada.
- **Cotizaciones:** listado con chips de estado y detalle con vista previa del PDF, descarga, emitir y cancelar con confirmación.
- **Configuración:** pestañas Empresa, Comercial, Cotizador, Documentos (vista previa real del PDF), Numeración, Usuarios e Historial. Los cambios sin guardar se marcan y no se pierden al cambiar de pestaña.
- **Importar maestro:** flujo Elegir → Revisar → Confirmar con observaciones por severidad.

**Rendimiento y entrega**

- Shell y formularios fuera del bundle inicial (78 KB gz) y login ligero.
- `nginx`: gzip y caché inmutable para `/assets/` (ver deuda: pendiente de verificar).

## 3. Módulos revisados

Login, Inicio, Cotizador (7 pasos), Cotizaciones y detalle, PDF, Productos (listado y ficha), Inventario, Recetas (listado y editor), Clientes, Trabajadores (listado y ficha), Técnicas, Hornos, Importar maestro, Configuración (7 pestañas), Usuarios y la página 404.

## 4. QA ejecutado

- **Backend (integración local 2026-10-01):** Prisma validate, typecheck, build y 74/74 tests (20 específicos del asistente).
- **Frontend (integración local 2026-10-01):** typecheck, build y 26/26 Vitest; ESLint terminó sin errores y con dos advertencias no bloqueantes (Fast Refresh y dependencia de `loadAdmin` en un efecto).
- **Playwright (integración local 2026-10-01):** 23/23 contra Docker `:8081`; la suite autenticada terminó en 2.1 minutos, con flujos de cotización, catálogos, configuración, navegación y asistente.
- Ambas imágenes Docker se reconstruyeron después de la consolidación de quemas. `/api/health`, el frontend GREDA `:8081` y Carpintería `:8080` devolvieron HTTP 200; Prisma informó 6 migraciones aplicadas y esquema al día. Una sesión aislada de Chromium inició sesión y capturó Inicio a 1440×1000 (`test-results/codex-dashboard-review.png`), sin errores de consola ni de página; la captura se revisó visualmente.
- `npm audit` quedó en cero vulnerabilidades para ambos repos y para las dependencias de producción instaladas en Docker; `sharp` se actualizó a 0.35.5 por la alerta alta previa.
- **Barrido:** 25 rutas × 5 anchos sin overflow horizontal, sin `console.error`, sin pageerror y sin 5xx.
- **PDF revisado visualmente:** cotización corta con datos y logo de la empresa, y cotización larga de 2–3 páginas.

| | Rendimiento | Accesibilidad | Buenas prácticas | SEO |
|---|---|---|---|---|
| Lighthouse escritorio (login, inicio, cotizador, productos) | 99–100 | 100 | 100 | 63–66 |
| Lighthouse móvil | 64–95 | 100 | 100 | 66 |

El SEO bajo es intencional: `robots.txt` bloquea la indexación de una app privada.

**React Doctor:** 51/100 con 35 avisos y 0 errores antes de los ajustes. Se corrigieron keys estables, el estado reflejado en efecto, el `setState` tras `await`, los inicializadores perezosos y las búsquedas en bucle. Lo que queda está en la sección 5.

## 5. Deuda restante

1. **Revisión local concluida con alcance seguro:** se recorrieron los 13 módulos, los formularios obligatorios, menús, filtros/búsquedas y paginación; la suite automatizada 23/23 aporta las rutas de guardado y cambios de estado. Los diálogos de borrado se verificaron y cancelaron; no se envió la confirmación de borrado permanente. La revisión visual autenticada de Inicio quedó verificada en una sesión aislada de Chromium a 1440×1000, sin errores de consola ni de página.
   - Para CTZ-2026-000025, la API devolvió un PDF de 11,262 bytes (`application/pdf`), el enlace completó una descarga con cabecera `%PDF-`, y Edge con interfaz mostró el documento y la barra del visor (`test-results/codex-quotation-pdf-review-edge.png`). Edge también mostró la muestra de Configuración (`test-results/codex-settings-pdf-review-edge.png`). La captura headless no pintó el visor; en Edge el PDF sí carga, aunque el zoom inicial recorta el extremo derecho en los paneles de 742px y 418px.
   - La cotización V2 distingue Pormenor y Por mayor en la hoja, pero no hay fórmula que cambie el precio por ese campo. No se implementó una regla de ahorro por tipo de cliente sin una fórmula de origen que la respalde.
   - La matriz V2 quedó cubierta en borradores locales: producto existente y pieza personalizada; con/sin esmalte; técnica única y múltiples técnicas; moldes; ilustración; primera, segunda y ambas quemas; horno chico y grande; compartida y exclusiva; con y sin override; clientes Pormenor y Por mayor. En la última comparación con inputs idénticos, ambos tipos de cliente dieron S/ 8,132.19. Primera quema compartida en horno chico asignó S/ 136.27; segunda exclusiva en horno grande asignó S/ 272.54. El total fue S/ 8,132.19 con factor 3 y S/ 10,717.05 con factor 4. La corrida no guardó ni emitió cotización y tuvo cero errores de página y 5xx (`test-results/codex-illustration-matrix-price.png`).
   - Las dos fallas de mano de obra registradas en una corrida histórica anterior fueron corregidas; la corrida integrada vigente pasó 23/23.
2. Móvil del cotizador (rendimiento 64): carga seis catálogos completos (productos y materiales de ~140 KB sin comprimir). Con gzip debería mejorar; además conviene un endpoint de opciones livianas (id, nombre, código).
3. React Doctor:
   - Componentes grandes (`QuoterPage`, `ProductFormPage`) y pestañas de configuración que avisan «sin guardar» al padre por efecto.
   - Token en `sessionStorage` (diseño previo; migrar a cookie httpOnly requiere cambio de backend).
   - iframes del PDF sin `sandbox`: el visor de PDF del navegador no funciona en un iframe con sandbox; el contenido es el propio PDF del servidor.
4. El PDF usa los datos de empresa vigentes también en cotizaciones ya emitidas (los importes sí vienen del snapshot). Congelar los datos de empresa al emitir queda pendiente.
5. El importador (`imports.service.ts`) no se modificó; la normalización ocurre después de confirmar.
6. Las recetas importadas tienen rendimientos pequeños en «g» (p. ej. 1.075 g), que parecen proporciones del Excel de origen; conviene revisarlas con el taller.
7. Usuarios de QA creados localmente: `qa-ux@greda.test` (ADMIN, credenciales en `cotizador/.env.e2e.local`, ignorado por git), además de registros E2E con sufijo numérico (clientes, productos, cotizaciones y movimientos de prueba).
8. Respaldo previo a la migración: `pg_dump` en el scratchpad de la sesión (`greda-before-ux-redesign.dump`).

## 6. Addendum: login visual y hero configurable

### Qué se hizo
- **Login rediseñado.**
  - Foto del taller a la izquierda (54 %, 48 % en tablet horizontal, 62 % en 2200 px o más) y tarjeta centrada sobre crema a la derecha, de 540 px como máximo y radio de 22 px.
  - En móvil y tablet vertical: hero compacto arriba (`clamp(220px, 36vh, 380px)`; 150–200 px en pantallas bajas, sin subtítulo) y la tarjeta montada encima.
- **Formulario.**
  - Íconos Lucide y botón mostrar u ocultar contraseña.
  - CTA «Entrar al taller» en terracota (`#b4532c`, contraste 4,9:1). Mientras envía, muestra «Entrando…» con spinner sin mover el layout.
  - Credenciales incorrectas: «Correo o contraseña incorrectos.» con una sacudida discreta (respeta `prefers-reduced-motion`); conserva correo y contraseña.
- **Configurar administrador.** Solo aparece si `GET /api/auth/bootstrap-status` devuelve `bootstrapRequired: true`, es decir, si hay clave de instalación y no hay usuarios. Autenticación, tokens y RBAC no cambiaron.
- **Asistente GREDA en el login.** Ayuda estática (qué es GREDA, cómo ingresar, qué hacer sin cuenta). No consulta datos internos. No hay engranaje de configuración en el login.
- **Configuración › Login (ADMIN).**
  - Subida de imagen (JPG, PNG o WEBP), editor de punto focal (clic sobre la imagen completa, flechas o campos X/Y) y oscurecimiento 0–80 %.
  - Título, texto resaltado (debe ser parte del título) y subtítulo.
  - Logo: mostrar u ocultar; tono claro o original.
  - Vista previa Escritorio, Tablet y Móvil a tamaño real escalado. Cambios en Historial (sección «Login»).

### Contrato y backend
- `GET /api/settings/login-appearance` (público) devuelve `heroImage { source, originalUrl, width, height, variants { sm, md, lg, xl }, focal { x, y }, overlay }`, `hero { title, highlight, subtitle }`, `logo { show, tone, url }` y `limits`. Los valores fuera de rango se corrigen al leer.
- `PATCH` (ADMIN) solo acepta `focalX`, `focalY`, `overlay`, `title`, `highlight`, `subtitle`, `showLogo` y `logoTone`.
  - Rechaza campos desconocidos y los caracteres `< > { }`.
  - No hay CSS ni HTML guardado: el frontend genera `object-position` y el gradiente.
- `PUT /hero` (ADMIN):
  - Valida los bytes reales (magic numbers más decodificación con Sharp), el tamaño mínimo (640 × 400) y el máximo (`LOGIN_HERO_MAX_MB`, 15 MB por defecto).
  - Guarda el original intacto.
  - Genera WEBP de 640, 1024, 1600 y 2400 px sin ampliar y sin metadatos EXIF.
  - Reinicia el punto focal a 50/50.
- `DELETE /hero` vuelve a la foto incluida. El original (con EXIF) solo lo descarga un ADMIN (`/hero-original`).
- Las variantes y el logo claro se sirven con ETag y caché inmutable por versión.
- **`logo-light`:** el logo de la empresa convertido en blanco con transparencia real, con el margen blanco recortado. Un PNG con fondo blanco se ve bien sobre la foto.
- **Modelos y migración:** `LoginAppearance` y `LoginHeroAsset`, migración `20261001500000_login_appearance`. La fila por defecto tiene foco 64/52 (el horno de la foto incluida).
- **Dependencia nueva:** `sharp`.

### Frontend y rendimiento
- `object-fit: cover` con `object-position` desde el punto focal, `srcset` y un `sizes` que considera la proporción de la foto. Sin el último, un panel alto elegía una variante pequeña y la ampliaba.
- Imagen del LCP con `fetchpriority="high"` y carga inmediata, sin animación de entrada. La configuración queda en `localStorage` para visitas siguientes.
- Fallback (textura y gradiente GREDA) si la imagen o la configuración fallan; el login sigue funcionando.
- La foto es decorativa (`alt=""`); el logo tiene `alt="GREDA"`.

### QA histórica del addendum de login

Los conteos de esta subsección corresponden a la validación específica del login en ese momento. La corrida integrada posterior queda registrada en la sección 4: backend 74/74, frontend 26/26 y Playwright 23/23.
- **Backend:** 67/67 pruebas, entre ellas 11 nuevas:
  - 16:9, 4:3, 1:1, vertical y ultrawide sin deformación ni ampliación, original intacto y sin EXIF.
  - Rechazo de archivos falsos, dañados o pequeños; límites; texto resaltado; logo claro.
- **Frontend:** tsc y Vitest 26/26 (6 nuevas: sanitizado, URLs inseguras, focal, fallback, logo).
- **Playwright `login-hero` 12/12:**
  - 375×812, 768×1024, 1024×768, 1280×720, 1440×900, 1920×1080 y 2560×1080 con cover, sin overflow, botón visible sin scroll, tarjeta ≤ 560 px y 0 errores de consola.
  - Credenciales incorrectas, mostrar contraseña, bootstrap oculto, asistente y fallback con la imagen o la configuración caídas.
  - Subida 16:9, 4:3, 1:1 y vertical; focal 0/0, 50/50 y 100/100 aplicado en el login; archivo inválido.
  - Al terminar restaura la foto incluida.
- **Suite completa de aquella corrida histórica:** 16/18, con dos fallas en Mano de obra. Esa evidencia quedó supersedida por la corrida integrada posterior de 23/23.
- **Lighthouse `/login`:**
  - Escritorio: 99 / 100 / 100 / 66; LCP 0,7–0,8 s; CLS 0.
  - Móvil: 93–94 / 100 / 96–100 / 66; LCP 2,8–2,9 s; CLS 0. La primera corrida móvil registró 2 errores de consola que no se repitieron en las tres siguientes.
  - SEO 66 por el `robots.txt` que bloquea la indexación a propósito.
- **Capturas revisadas a mano:** en todos los tamaños el horno queda visible gracias al punto focal y el texto queda sobre la zona oscurecida.

### Deuda del addendum
- No se genera AVIF (opcional).
- La vista previa usa una maqueta del formulario, no el formulario real.
- Con un logo de color, el tono «claro» lo convierte en silueta blanca; para conservar colores se usa «original».
