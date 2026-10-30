# PDMC — Panel de Mejora Continua

Plataforma empresarial para coordinar tiendas, bodegas, rectificación, facturación, auditoría y mejora continua: transferencias, recepción, inconsistencias, negativos, devoluciones y desempeño de facturadores. Meta: operación nacional organizada por regiones, donde cada trabajador gestiona lo de su cargo.

## Fuentes de datos
- PostgreSQL (Prisma, migraciones versionadas en `backend/prisma/migrations`) es la fuente oficial.
- SQL Server corporativo: implementado **solo en el backend** y en **solo lectura** (`backend/src/sync/`, consultas en `backend/sqlserver/consultas/`, guía en `docs/sincronizacion-sqlserver.md`). Lee de los agentes de cada bodega y guarda el origen por sitio. Se ejecuta automáticamente (`npm run sync:sqlserver -w backend`) y con los botones "Actualizar desde SQL Server". Nunca conexiones, claves ni consultas sensibles en el navegador.
- Las cargas CSV de transferencias, devoluciones, facturadores e inventario fueron retiradas; no reintroducirlas.
- Google Sheets fue retirado (`202610020001_retirar_google_sheets`); no reintroducirlo.

## Arquitectura
Tres paquetes independientes (workspaces de npm), organizados como `CYSN_QA`. Detalle en `docs/ARQUITECTURA.md`.
- `backend/` (`pdmc-backend`): API HTTP con Hono (`src/server.ts`). `src/http/`: rutas por módulo (Request → Response). `src/`: servicios, autenticación, permisos y reglas de negocio. `prisma/`: esquema, migraciones y seed (cliente generado en `backend/generated`). `scripts/`: usuarios, sincronización con SQL Server y comprobaciones. `sqlserver/`: consultas de solo lectura. `tests/`: unitarias e integración. Configuración en `backend/.env.local` (ver `backend/.env.example`).
- `frontend/` (`pdmc-frontend`): interfaz Vite + React + React Router. `src/pages/`: páginas, que piden sus datos a `GET /api/panel`. `src/components/`, `src/hooks/`, `src/lib/`, `src/styles/globals.css` (shadcn/Tailwind 4, Lucide, Recharts, temas con next-themes). `public/`: favicon. Solo habla con el backend por HTTP (`/api`); no lee variables de entorno.
- `contratos/` (`@pdmc/contratos`): tipos de las respuestas HTTP, catálogos y reglas puras compartidas. Se importa como `@pdmc/contratos/<ruta>`. Sin servidor ni interfaz.
- Raíz: `scripts/` (arranque en red y Tailscale, verificación de arquitectura y textos), `tests/e2e/` (pruebas de navegador de punta a punta), `docker/`, `docs/`.
- Independencia vigilada por `npm run check:architecture`: el frontend no importa backend, base ni Node; contratos no depende de servidor ni interfaz; nadie importa otro paquete por ruta relativa. Si cambia una respuesta de la API, se actualiza su tipo en `contratos/` (el backend comprueba en compilación que cumple el contrato de negativos: `backend/src/negativos/contracts.check.ts`).
- Despliegue: `npm start` (raíz) levanta la API sirviendo también `frontend/dist` en el mismo puerto; o se publican por separado (frontend estático + `/api` reenviado al backend en el mismo dominio, porque la sesión es una cookie).
- La separación es reproducible con `../personalizacion-pdmc/separar-front-back.mjs`.

## Reglas de dominio clave
- Claves estables: tienda y facturador por **código corporativo**, producto por **código de barra (texto)**. Los nombres son editables y nunca son claves.
- Aislamiento por región, bodega y tienda, validado en el servidor.
- **No existen cuentas operativas de alcance nacional.** Cada rol trabaja sobre su región, bodega o tienda; quien cubra varias regiones recibe el rol una vez por región. Solo ADMINISTRADOR (gestión del sistema, no operación) va sin ubicación. Lo hace cumplir `asignacionValida` (`contratos/src/auth/permissions.ts`) y el CHECK `AsignacionAcceso_sin_alcance_nacional`. La cuenta de sistema del sincronizador no tiene asignaciones (`SystemAuthorization`).
- **Una consulta, un destino por sitio.** Cada bodega es una fuente distinta (su propio SQL Server, agente e inventario): la consulta es la misma para todas, pero cada carga se importa a su sitio (`origenId` / `dimIdTienda`) y nunca se mezcla con la de otra bodega o región. Transferencias y devoluciones ya van por bodega; el inventario aún lee un solo sitio (`PDMC_INVENTARIO_DIM_ID`) hasta la fase 2b-2 de `PLAN-agente-multisitio.md`.
- Roles (`RolUsuario`): ADMINISTRADOR, MEJORA_CONTINUA, TIENDA, JEFE_BODEGA, RECTIFICACION, RECEPCION, AUDITORIA, FACTURACION. No existe Supervisor.
- Transferencias y devoluciones: Abierta, Aprobada, Exportada. El plazo de 5 días hábiles para reportar empieza en Exportada.
- Inconsistencias: Pendiente de conteo → Investigación → Corrección pendiente → Verificación → Solucionado. Registrar una corrección no la verifica; no se cierra un caso con unidades pendientes.
- Negativos: Pendientes de conteo → Con conteo → Aprobados para ajuste → Listos para cerrar. Máximo dos fotografías por semana. Que un caso desaparezca no lo soluciona.
- % de error del facturador = unidades de errores atribuibles confirmados / unidades transferidas en el mes × 100. Atribuibles: "Error por facturador (Físico Faltante)" y "No se facturó la mercancía (No está en transf)".
- El restablecimiento protegido (solo el administrador) nunca se ejecuta sin una solicitud expresa.
- Pedidos, etiquetado y proyectos son elementos históricos: verificar su estado antes de tratarlos como módulos activos.

## Sistema visual
- Marca: `frontend/src/components/brand/pdmc-mark.tsx` (`PdmcMark`, `PdmcLogo`), que replica a `frontend/public/favicon.svg`. Tipografías alojadas en el proyecto: Manrope (texto) y JetBrains Mono (códigos), mediante `@fontsource-variable`.
- Paleta de la empresa: crema `#EDECDA` (fondos), azul real `#436BDC` (marca y acciones; para texto se usa `--primary` `#3A5FCF` por contraste), azul cielo `#87BAD7` (acentos e información) y rojo carmín `#BC2337` (alertas y errores).
- Colores: todos salen de `frontend/src/styles/globals.css`. Usa las escalas semánticas `success`, `warning`, `danger` (rojo de la empresa), `info` (azul cielo) y `brand` (azul real), por ejemplo `bg-warning-50 dark:bg-warning-950/40`, y los tokens `brand-night`, `brand-deep`, `brand-ocean`, `brand-glow`, `brand-mist` y `brand-crimson`. No uses hexadecimales sueltos ni `emerald`, `amber`, `rose`, `sky`, `blue`, `cyan`, `slate` o `teal`.
- Tarjetas: usa la clase `pdmc-surface`. El desenfoque (`backdrop-filter`) se reserva para los elementos flotantes: el encabezado flotante de vidrio (`.workspace-chrome`), el dock y los paneles flotantes.
- Gráficas: usa `var(--chart-1..5)` en orden fijo (paleta validada para daltonismo en claro y oscuro con el validador de dataviz) y `var(--success)` / `var(--warning)` para estados. El texto de las leyendas va en el color de texto normal, no en el de la serie.
- Imágenes compartibles: `frontend/src/lib/share-image.ts`.

## Forma de trabajo
- Inspeccionar antes de proponer. Separar lo implementado, lo pendiente y lo propuesto. No inventar tablas, campos ni conexiones.
- Alcance acotado a lo pedido. Conservar datos y cambios previos. Usar migraciones y respaldos para cambios destructivos.
- Textos en UTF-8 y en español, incluidos exportaciones e imágenes generadas (`npm run check:texts`).
- Verificar con `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build` y `npm run test:browser` (desde la raíz; cada paquete también tiene los suyos). Compilar no significa estar listo para uso nacional: también hay que verificar permisos, aislamiento regional, integridad y recuperación.
- No publicar secretos, respaldos (`backend/backups/`, `backups/`) ni datos empresariales.

## Próximas etapas
Integración con SQL Server, validación de la operación regional, despliegue y recuperación, y PWA instalable.
