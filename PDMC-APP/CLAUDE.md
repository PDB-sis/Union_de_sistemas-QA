@AGENTS.md

# PDMC — Panel de Mejora Continua

Plataforma empresarial para coordinar tiendas, bodegas, rectificación, facturación, auditoría y mejora continua: transferencias, recepción, inconsistencias, negativos, devoluciones y desempeño de facturadores. Meta: operación nacional organizada por regiones, donde cada trabajador gestiona lo de su cargo.

## Fuentes de datos
- PostgreSQL (Prisma, migraciones versionadas en `backend/prisma/migrations`) es la fuente oficial.
- SQL Server corporativo: implementado **solo en el backend** y en **solo lectura** (`backend/src/sync/`, consultas en `backend/sqlserver/consultas/`, guía en `docs/sincronizacion-sqlserver.md`). Lee de los agentes de cada bodega y guarda el origen por sitio. Se ejecuta automáticamente (`npm run sync:sqlserver`) y con los botones "Actualizar desde SQL Server". Nunca conexiones, claves ni consultas sensibles en el navegador.
- Las cargas CSV de transferencias, devoluciones, facturadores e inventario fueron retiradas; no reintroducirlas.
- Google Sheets fue retirado (`202610020001_retirar_google_sheets`); no reintroducirlo.

## Arquitectura
Monolito modular, un solo despliegue de Next.js (no son dos servidores).
- `app/`: páginas, layouts y adaptadores de API.
- `frontend/`: componentes, hooks y estilos (`frontend/styles/globals.css`, shadcn/Tailwind 4, Lucide, Recharts, temas claro y oscuro con next-themes).
- `backend/src/`: servicios, autenticación, permisos, datos y reglas de negocio. `backend/http/`: controladores por módulo.
- `shared/`: tipos, contratos y catálogos compartidos.
- `backend/prisma/`: esquema, migraciones y seed. `backend/scripts/`: usuarios, sincronización con SQL Server y comprobaciones de la base. `backend/sqlserver/`: consultas de solo lectura.
- `scripts/`: arranque del servidor, red y verificaciones del proyecto. `tests/{backend,shared,frontend}/`: `*.test.mjs` (unitarias), `*.integration.mjs` y `*.browser.mjs`.
- La reorganización de carpetas es reproducible con `../personalizacion-pdmc/reorganizar-carpetas.mjs` (idempotente). `AGENTS.md` lo regenera Next.js en la raíz.

## Reglas de dominio clave
- Claves estables: tienda y facturador por **código corporativo**, producto por **código de barra (texto)**. Los nombres son editables y nunca son claves.
- Aislamiento por región, bodega y tienda, validado en el servidor.
- Roles (`RolUsuario`): ADMINISTRADOR, MEJORA_CONTINUA, TIENDA, JEFE_BODEGA, RECTIFICACION, RECEPCION, AUDITORIA, FACTURACION. No existe Supervisor.
- Transferencias y devoluciones: Abierta, Aprobada, Exportada. El plazo de 5 días hábiles para reportar empieza en Exportada.
- Inconsistencias: Pendiente de conteo → Investigación → Corrección pendiente → Verificación → Solucionado. Registrar una corrección no la verifica; no se cierra un caso con unidades pendientes.
- Negativos: Pendientes de conteo → Con conteo → Aprobados para ajuste → Listos para cerrar. Máximo dos fotografías por semana. Que un caso desaparezca no lo soluciona.
- % de error del facturador = unidades de errores atribuibles confirmados / unidades transferidas en el mes × 100. Atribuibles: "Error por facturador (Físico Faltante)" y "No se facturó la mercancía (No está en transf)".
- El restablecimiento protegido (solo administrador nacional) nunca se ejecuta sin una solicitud expresa.
- Pedidos, etiquetado y proyectos son elementos históricos: verificar su estado antes de tratarlos como módulos activos.

## Sistema visual
- Marca: `frontend/components/brand/pdmc-mark.tsx` (`PdmcMark`, `PdmcLogo`), que replica a `public/favicon.svg`. Tipografías alojadas en el proyecto: Manrope (texto) y JetBrains Mono (códigos), mediante `@fontsource-variable`.
- Paleta de la empresa: crema `#EDECDA` (fondos), azul real `#436BDC` (marca y acciones; para texto se usa `--primary` `#3A5FCF` por contraste), azul cielo `#87BAD7` (acentos e información) y rojo carmín `#BC2337` (alertas y errores).
- Colores: todos salen de `frontend/styles/globals.css`. Usa las escalas semánticas `success`, `warning`, `danger` (rojo de la empresa), `info` (azul cielo) y `brand` (azul real), por ejemplo `bg-warning-50 dark:bg-warning-950/40`, y los tokens `brand-night`, `brand-deep`, `brand-ocean`, `brand-glow`, `brand-mist` y `brand-crimson`. No uses hexadecimales sueltos ni `emerald`, `amber`, `rose`, `sky`, `blue`, `cyan`, `slate` o `teal`.
- Tarjetas: usa la clase `pdmc-surface`. El desenfoque (`backdrop-filter`) se reserva para los elementos flotantes: el encabezado flotante de vidrio (`.workspace-chrome`), el dock y los paneles flotantes.
- Gráficas: usa `var(--chart-1..5)` en orden fijo (paleta validada para daltonismo en claro y oscuro con el validador de dataviz) y `var(--success)` / `var(--warning)` para estados. El texto de las leyendas va en el color de texto normal, no en el de la serie.
- Imágenes compartibles: `frontend/lib/share-image.ts`.

## Forma de trabajo
- Inspeccionar antes de proponer. Separar lo implementado, lo pendiente y lo propuesto. No inventar tablas, campos ni conexiones.
- Alcance acotado a lo pedido. Conservar datos y cambios previos. Usar migraciones y respaldos para cambios destructivos.
- Textos en UTF-8 y en español, incluidos exportaciones e imágenes generadas (`npm run check:texts`).
- Verificar con `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration` y `npm run build`. Compilar no significa estar listo para uso nacional: también hay que verificar permisos, aislamiento regional, integridad y recuperación.
- No publicar secretos, respaldos (`backups/`) ni datos empresariales.

## Próximas etapas
Integración con SQL Server, validación de la operación regional, despliegue y recuperación, y PWA instalable.
