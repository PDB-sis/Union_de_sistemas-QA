--
-- PostgreSQL database dump
--

\restrict 94ctThHdAuqsjqeMEtPrF85zKHIwoqsczaE7v7X6DFdwTziyRUU2IiIz965ewpn

-- Dumped from database version 17.11 (Debian 17.11-1.pgdg13+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: EstadoNegativo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoNegativo" AS ENUM (
    'Nuevo',
    'En investigación',
    'Esperando conteo físico',
    'Esperando decisión',
    'Ajuste autorizado',
    'Ajuste realizado',
    'Pendiente de verificar',
    'Cerrado sin ajuste',
    'Solucionado',
    'Reabierto'
);


--
-- Name: EstadoPedidoTienda; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoPedidoTienda" AS ENUM (
    'ENVIADO',
    'EN_REVISION',
    'APROBADO',
    'APROBADO_PARCIAL',
    'EN_PREPARACION',
    'DESPACHADO',
    'RECIBIDO',
    'RECHAZADO',
    'CANCELADO'
);


--
-- Name: EstadoUsuario; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EstadoUsuario" AS ENUM (
    'INVITADO',
    'ACTIVO',
    'BLOQUEADO',
    'INACTIVO'
);


--
-- Name: MotivoCodigoNoInventario; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MotivoCodigoNoInventario" AS ENUM (
    'CODIGO_MEZCLADO_PAQUETE',
    'OTRA_PRENDA',
    'OTRO'
);


--
-- Name: MotivoReporteTienda; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MotivoReporteTienda" AS ENUM (
    'FALTANTE',
    'SOBRANTE',
    'CRUCE',
    'DANADO',
    'VENCIDO',
    'OTRO'
);


--
-- Name: RolUsuario; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RolUsuario" AS ENUM (
    'ADMINISTRADOR',
    'MEJORA_CONTINUA',
    'SUPERVISOR',
    'RECTIFICACION',
    'JEFE_BODEGA',
    'RECEPCION_BODEGA',
    'ETIQUETADO',
    'FACTURACION',
    'TIENDA',
    'CONSULTA_AUDITORIA'
);


--
-- Name: SubmotivoReporteTienda; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubmotivoReporteTienda" AS ENUM (
    'UNIDADES_MAS_PAQUETE',
    'NO_ESTA_TRANSFERENCIA',
    'UNIDADES_MENOS_PAQUETE',
    'NO_ESTA_FISICO'
);


--
-- Name: TipoUbicacion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TipoUbicacion" AS ENUM (
    'REGION',
    'BODEGA',
    'TIENDA'
);


--
-- Name: pdmc_auditoria_inmutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pdmc_auditoria_inmutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
 RAISE EXCEPTION 'La auditoría es inmutable';
END $$;


--
-- Name: pdmc_bodega_ubicacion_validar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pdmc_bodega_ubicacion_validar() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."ubicacionId" IS NOT NULL AND NEW."ubicacionId" IS DISTINCT FROM OLD."ubicacionId" THEN
    RAISE EXCEPTION 'No se puede trasladar un expediente entre ubicaciones';
  END IF;
  IF NEW."ubicacionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Ubicacion" WHERE id=NEW."ubicacionId" AND tipo IN ('BODEGA','TIENDA')) THEN
    RAISE EXCEPTION 'Destino inválido';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: pdmc_ubicacion_validar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pdmc_ubicacion_validar() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."tipo" IS DISTINCT FROM OLD."tipo" THEN
    RAISE EXCEPTION 'El tipo de una ubicación es inmutable';
  END IF;
  IF NEW."regionId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Ubicacion" WHERE id=NEW."regionId" AND tipo='REGION') THEN
    RAISE EXCEPTION 'La ubicación requiere una región válida';
  END IF;
  RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AsignacionAcceso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AsignacionAcceso" (
    id uuid NOT NULL,
    "usuarioId" uuid NOT NULL,
    rol public."RolUsuario" NOT NULL,
    "ubicacionId" uuid,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Auditoria" (
    id uuid NOT NULL,
    "usuarioId" uuid,
    entidad character varying(80) NOT NULL,
    "entidadId" uuid NOT NULL,
    accion character varying(80) NOT NULL,
    motivo text NOT NULL,
    "valorAnterior" jsonb,
    "valorNuevo" jsonb,
    "correlacionId" uuid,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    origen character varying(300) DEFAULT 'SERVIDOR'::character varying NOT NULL
);


--
-- Name: Bodega; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Bodega" (
    id uuid NOT NULL,
    codigo character varying(80) NOT NULL,
    nombre character varying(200) NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL,
    "ubicacionId" uuid,
    CONSTRAINT "Bodega_codigo_no_vacio" CHECK ((length(btrim((codigo)::text)) > 0))
);


--
-- Name: BodegaProducto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BodegaProducto" (
    id uuid NOT NULL,
    nombre character varying(200) NOT NULL
);


--
-- Name: ConsultaInventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ConsultaInventario" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "usuarioId" uuid NOT NULL,
    "nombreArchivo" character varying(255) NOT NULL,
    "fechaConsulta" timestamp(3) with time zone NOT NULL,
    "fechaImportacion" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "hashArchivo" character varying(64) NOT NULL,
    "totalFilas" integer NOT NULL
);


--
-- Name: ExcepcionBodegaProducto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExcepcionBodegaProducto" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "productoId" uuid NOT NULL,
    "bodegaProductoId" uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL
);


--
-- Name: FotoNegativoItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FotoNegativoItem" (
    id uuid NOT NULL,
    "fotoId" uuid NOT NULL,
    "productoId" uuid NOT NULL,
    existencia numeric(18,4) NOT NULL
);


--
-- Name: FotoNegativos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FotoNegativos" (
    id uuid NOT NULL,
    "consultaId" uuid NOT NULL,
    "fechaCorte" date NOT NULL,
    "tipoCorte" character varying(20) NOT NULL,
    "totalCodigos" integer NOT NULL,
    "totalUnidades" numeric(18,4) NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: HistorialNegativo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."HistorialNegativo" (
    id uuid NOT NULL,
    "negativoId" uuid NOT NULL,
    "usuarioId" uuid,
    accion character varying(80) NOT NULL,
    motivo text NOT NULL,
    "valorAnterior" jsonb,
    "valorNuevo" jsonb,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Inconsistencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Inconsistencia" (
    id uuid NOT NULL,
    "sourceKey" character varying(64) NOT NULL,
    fecha timestamp(3) with time zone,
    sucursal character varying(250) NOT NULL,
    chofer character varying(200),
    transferencia character varying(128) NOT NULL,
    "codigoBarra" character varying(128) NOT NULL,
    referencia character varying(200),
    "tipoError" character varying(120) NOT NULL,
    "cantidadErrada" integer NOT NULL,
    motivo character varying(300),
    "comentarioAdmin" text,
    "formaCorreccion" character varying(200),
    "numeroCorreccion" character varying(100),
    "unidadesAjustadas" integer DEFAULT 0 NOT NULL,
    "unidadesSinResolver" integer DEFAULT 0 NOT NULL,
    resuelto boolean DEFAULT false NOT NULL,
    "claveUnica" character varying(300),
    ajustar character varying(30),
    "cantidadAjuste" integer,
    "numeroAjuste" character varying(128),
    veredicto character varying(300),
    ajustado boolean DEFAULT false NOT NULL,
    "productoId" uuid,
    "bodegaProductoId" uuid,
    "actualizadoPorId" uuid,
    "usuarioPdmc" character varying(254),
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL,
    "conteoFisico" integer,
    "existenciaSistemaConteo" integer,
    "conteoRegistradoAt" timestamp(3) with time zone,
    "motivoReporte" public."MotivoReporteTienda",
    "detalleOtro" character varying(300),
    "tiendaId" uuid,
    "reportadoPorId" uuid,
    "grupoReporteId" uuid,
    "claveCruce" uuid,
    "submotivoReporte" public."SubmotivoReporteTienda",
    "reporteTiendaId" uuid,
    CONSTRAINT "Inconsistencia_existencia_sistema_conteo_entera" CHECK ((("existenciaSistemaConteo" IS NULL) OR (("existenciaSistemaConteo" >= '-10000000'::integer) AND ("existenciaSistemaConteo" <= 10000000))))
);


--
-- Name: InconsistenciaCodigoNoInventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InconsistenciaCodigoNoInventario" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "solicitudId" uuid NOT NULL,
    "tiendaId" uuid NOT NULL,
    "reportadoPorId" uuid NOT NULL,
    transferencia character varying(128) NOT NULL,
    "codigoBarraNoInventario" character varying(128) NOT NULL,
    motivo public."MotivoCodigoNoInventario" NOT NULL,
    "codigoBarraTransferencia" character varying(128),
    "cantidadPaquete" integer,
    "cantidadCodigoNoInventario" integer,
    cantidad integer,
    detalle character varying(500),
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reporteTiendaId" uuid,
    CONSTRAINT "CodigoNoInventario_cantidades_positivas" CHECK (((("cantidadPaquete" IS NULL) OR ("cantidadPaquete" > 0)) AND (("cantidadCodigoNoInventario" IS NULL) OR ("cantidadCodigoNoInventario" > 0)) AND ((cantidad IS NULL) OR (cantidad > 0))))
);


--
-- Name: IntentoAcceso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."IntentoAcceso" (
    clave character varying(64) NOT NULL,
    intentos integer DEFAULT 1 NOT NULL,
    "expiresAt" timestamp(3) with time zone NOT NULL
);


--
-- Name: InventarioActual; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InventarioActual" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "consultaId" uuid NOT NULL,
    "productoId" uuid NOT NULL,
    "bodegaProductoId" uuid,
    existencia numeric(18,4) NOT NULL,
    activo boolean NOT NULL,
    categoria character varying(200),
    subcategoria character varying(200)
);


--
-- Name: LineaInventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LineaInventario" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    linea character varying(200) NOT NULL,
    "bodegaProductoId" uuid,
    version integer DEFAULT 1 NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL
);


--
-- Name: Negativo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Negativo" (
    id uuid NOT NULL,
    "productoId" uuid NOT NULL,
    "bodegaId" uuid NOT NULL,
    "responsableId" uuid,
    estado public."EstadoNegativo" DEFAULT 'Nuevo'::public."EstadoNegativo" NOT NULL,
    "conteoFisico" numeric(18,4),
    motivo text,
    "documentoRelacionado" character varying(255),
    veredicto text,
    "numeroAjuste" character varying(128),
    observaciones text,
    "primeraDeteccion" timestamp(3) with time zone NOT NULL,
    "ultimaDeteccion" timestamp(3) with time zone NOT NULL,
    "anuladoAt" timestamp(3) with time zone,
    "motivoAnulacion" text,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL,
    "bodegaProductoId" uuid,
    "fusionadoEnId" uuid,
    "existenciaSistemaConteo" numeric(18,4),
    "conteoRegistradoAt" timestamp(3) with time zone,
    CONSTRAINT "Negativo_anulacion_motivada" CHECK (((("anuladoAt" IS NULL) AND ("motivoAnulacion" IS NULL)) OR (("anuladoAt" IS NOT NULL) AND ("motivoAnulacion" IS NOT NULL) AND (length(btrim("motivoAnulacion")) > 0)))),
    CONSTRAINT "Negativo_conteo_no_negativo" CHECK ((("conteoFisico" IS NULL) OR ("conteoFisico" >= (0)::numeric))),
    CONSTRAINT "Negativo_detecciones_ordenadas" CHECK (("ultimaDeteccion" >= "primeraDeteccion")),
    CONSTRAINT "Negativo_version_positiva" CHECK ((version > 0))
);


--
-- Name: PedidoTienda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PedidoTienda" (
    id uuid NOT NULL,
    codigo character varying(40) NOT NULL,
    "tiendaId" uuid NOT NULL,
    "solicitadoPorId" uuid NOT NULL,
    estado public."EstadoPedidoTienda" DEFAULT 'ENVIADO'::public."EstadoPedidoTienda" NOT NULL,
    observaciones character varying(1000),
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL
);


--
-- Name: PedidoTiendaItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PedidoTiendaItem" (
    id uuid NOT NULL,
    "pedidoId" uuid NOT NULL,
    "productoId" uuid NOT NULL,
    "cantidadSolicitada" integer NOT NULL,
    CONSTRAINT "PedidoTiendaItem_cantidad_positiva" CHECK (("cantidadSolicitada" > 0))
);


--
-- Name: PerfilLaboral; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PerfilLaboral" (
    id uuid NOT NULL,
    codigo character varying(80) NOT NULL,
    nombre character varying(200) NOT NULL,
    tipo character varying(20) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "ubicacionId" uuid,
    CONSTRAINT "PerfilLaboral_tipo_check" CHECK (((tipo)::text = ANY ((ARRAY['FACTURACION'::character varying, 'ETIQUETADO'::character varying])::text[])))
);


--
-- Name: Producto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Producto" (
    id uuid NOT NULL,
    "codigoBarra" character varying(128) NOT NULL,
    referencia character varying(200),
    descripcion text,
    marca character varying(200),
    "codigoMarca" character varying(80),
    talla character varying(80),
    categoria character varying(200),
    linea character varying(200),
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL,
    CONSTRAINT "Producto_codigoBarra_no_vacio" CHECK ((length(btrim(("codigoBarra")::text)) > 0))
);


--
-- Name: ReporteTransferenciaTienda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReporteTransferenciaTienda" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "solicitudId" uuid NOT NULL,
    "tiendaId" uuid NOT NULL,
    "reportadoPorId" uuid NOT NULL,
    transferencia character varying(128) NOT NULL,
    "sinIncidencias" boolean NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SesionUsuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SesionUsuario" (
    id uuid NOT NULL,
    "tokenHash" character varying(64) NOT NULL,
    "usuarioId" uuid NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) with time zone NOT NULL
);


--
-- Name: Tienda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tienda" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo character varying(80) NOT NULL,
    nombre character varying(200) NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "ubicacionId" uuid NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Tienda_codigo_no_vacio" CHECK ((length(btrim((codigo)::text)) > 0)),
    CONSTRAINT "Tienda_nombre_no_vacio" CHECK ((length(btrim((nombre)::text)) > 0))
);


--
-- Name: TransferenciaConsulta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TransferenciaConsulta" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero character varying(128) NOT NULL,
    fecha date NOT NULL,
    usuario character varying(200) NOT NULL,
    "destinoOriginal" character varying(250) NOT NULL,
    "tiendaId" uuid,
    estado character varying(20) NOT NULL,
    observacion text,
    unidades integer NOT NULL,
    "cantidadCodigos" integer NOT NULL,
    "ultimaImportacionId" uuid NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "TransferenciaConsulta_codigos_check" CHECK (("cantidadCodigos" >= 0)),
    CONSTRAINT "TransferenciaConsulta_estado_check" CHECK (((estado)::text = ANY ((ARRAY['Abierta'::character varying, 'Aprobada'::character varying, 'Exportada'::character varying])::text[]))),
    CONSTRAINT "TransferenciaConsulta_unidades_check" CHECK ((unidades >= 0))
);


--
-- Name: TransferenciaConsultaImport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TransferenciaConsultaImport" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "nombreArchivo" character varying(255) NOT NULL,
    "hashArchivo" character varying(64) NOT NULL,
    "totalFilas" integer NOT NULL,
    resumen jsonb NOT NULL,
    "importedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "importedById" uuid,
    CONSTRAINT "TransferenciaConsultaImport_totalFilas_check" CHECK (("totalFilas" >= 0))
);


--
-- Name: Ubicacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Ubicacion" (
    id uuid NOT NULL,
    codigo character varying(80) NOT NULL,
    nombre character varying(200) NOT NULL,
    tipo public."TipoUbicacion" NOT NULL,
    "regionId" uuid,
    CONSTRAINT "Ubicacion_region_forma" CHECK (((tipo <> 'REGION'::public."TipoUbicacion") OR ("regionId" IS NULL)))
);


--
-- Name: Usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Usuario" (
    id uuid NOT NULL,
    email character varying(254) NOT NULL,
    nombre character varying(200) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL,
    estado public."EstadoUsuario" DEFAULT 'INVITADO'::public."EstadoUsuario" NOT NULL,
    rol public."RolUsuario" DEFAULT 'CONSULTA_AUDITORIA'::public."RolUsuario" NOT NULL,
    "passwordHash" text,
    "debeCambiarPassword" boolean DEFAULT true NOT NULL,
    "passwordTemporalHasta" timestamp(3) with time zone,
    "passwordChangedAt" timestamp(3) with time zone
);


--
-- Name: VinculoOperativo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."VinculoOperativo" (
    id uuid NOT NULL,
    "usuarioId" uuid NOT NULL,
    "ubicacionId" uuid,
    "perfilId" uuid,
    CONSTRAINT "VinculoOperativo_check" CHECK ((("ubicacionId" IS NULL) <> ("perfilId" IS NULL)))
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: AsignacionAcceso; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AsignacionAcceso" (id, "usuarioId", rol, "ubicacionId", "createdAt") FROM stdin;
\.


--
-- Data for Name: Auditoria; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Auditoria" (id, "usuarioId", entidad, "entidadId", accion, motivo, "valorAnterior", "valorNuevo", "correlacionId", "createdAt", origen) FROM stdin;
e7d30393-997e-4f1c-9fb1-f202c60a6ad4	\N	Arquitectura	dab0e2be-6cdf-41bc-bc78-ab451cf981b2	RETIRAR_FLUJO_NEGATIVOS_LEGACY	Limpieza autorizada: inventario y ConsultaInventario quedan como fuente de existencias de negativos	{"tablas": ["ConsultaNegativos", "DetalleConsultaNegativos", "MigracionLocalNegativos", "UnificacionNegativos"]}	{"fuente": "ConsultaInventario/InventarioActual", "historial": "HistorialNegativo", "expedientes": "Negativo"}	\N	2026-10-06 18:48:09.439+00	SERVIDOR
\.


--
-- Data for Name: Bodega; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Bodega" (id, codigo, nombre, activa, "createdAt", "updatedAt", "ubicacionId") FROM stdin;
\.


--
-- Data for Name: BodegaProducto; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."BodegaProducto" (id, nombre) FROM stdin;
\.


--
-- Data for Name: ConsultaInventario; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ConsultaInventario" (id, "usuarioId", "nombreArchivo", "fechaConsulta", "fechaImportacion", "hashArchivo", "totalFilas") FROM stdin;
\.


--
-- Data for Name: ExcepcionBodegaProducto; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ExcepcionBodegaProducto" (id, "productoId", "bodegaProductoId", version, "updatedAt") FROM stdin;
\.


--
-- Data for Name: FotoNegativoItem; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."FotoNegativoItem" (id, "fotoId", "productoId", existencia) FROM stdin;
\.


--
-- Data for Name: FotoNegativos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."FotoNegativos" (id, "consultaId", "fechaCorte", "tipoCorte", "totalCodigos", "totalUnidades", "createdAt") FROM stdin;
\.


--
-- Data for Name: HistorialNegativo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."HistorialNegativo" (id, "negativoId", "usuarioId", accion, motivo, "valorAnterior", "valorNuevo", "createdAt") FROM stdin;
\.


--
-- Data for Name: Inconsistencia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Inconsistencia" (id, "sourceKey", fecha, sucursal, chofer, transferencia, "codigoBarra", referencia, "tipoError", "cantidadErrada", motivo, "comentarioAdmin", "formaCorreccion", "numeroCorreccion", "unidadesAjustadas", "unidadesSinResolver", resuelto, "claveUnica", ajustar, "cantidadAjuste", "numeroAjuste", veredicto, ajustado, "productoId", "bodegaProductoId", "actualizadoPorId", "usuarioPdmc", version, "createdAt", "updatedAt", "conteoFisico", "existenciaSistemaConteo", "conteoRegistradoAt", "motivoReporte", "detalleOtro", "tiendaId", "reportadoPorId", "grupoReporteId", "claveCruce", "submotivoReporte", "reporteTiendaId") FROM stdin;
\.


--
-- Data for Name: InconsistenciaCodigoNoInventario; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InconsistenciaCodigoNoInventario" (id, "solicitudId", "tiendaId", "reportadoPorId", transferencia, "codigoBarraNoInventario", motivo, "codigoBarraTransferencia", "cantidadPaquete", "cantidadCodigoNoInventario", cantidad, detalle, "createdAt", "reporteTiendaId") FROM stdin;
\.


--
-- Data for Name: IntentoAcceso; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."IntentoAcceso" (clave, intentos, "expiresAt") FROM stdin;
\.


--
-- Data for Name: InventarioActual; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."InventarioActual" (id, "consultaId", "productoId", "bodegaProductoId", existencia, activo, categoria, subcategoria) FROM stdin;
\.


--
-- Data for Name: LineaInventario; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."LineaInventario" (id, linea, "bodegaProductoId", version, "updatedAt") FROM stdin;
\.


--
-- Data for Name: Negativo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Negativo" (id, "productoId", "bodegaId", "responsableId", estado, "conteoFisico", motivo, "documentoRelacionado", veredicto, "numeroAjuste", observaciones, "primeraDeteccion", "ultimaDeteccion", "anuladoAt", "motivoAnulacion", version, "createdAt", "updatedAt", "bodegaProductoId", "fusionadoEnId", "existenciaSistemaConteo", "conteoRegistradoAt") FROM stdin;
\.


--
-- Data for Name: PedidoTienda; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PedidoTienda" (id, codigo, "tiendaId", "solicitadoPorId", estado, observaciones, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: PedidoTiendaItem; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PedidoTiendaItem" (id, "pedidoId", "productoId", "cantidadSolicitada") FROM stdin;
\.


--
-- Data for Name: PerfilLaboral; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PerfilLaboral" (id, codigo, nombre, tipo, activo, "ubicacionId") FROM stdin;
\.


--
-- Data for Name: Producto; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Producto" (id, "codigoBarra", referencia, descripcion, marca, "codigoMarca", talla, categoria, linea, activo, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: ReporteTransferenciaTienda; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ReporteTransferenciaTienda" (id, "solicitudId", "tiendaId", "reportadoPorId", transferencia, "sinIncidencias", "createdAt") FROM stdin;
\.


--
-- Data for Name: SesionUsuario; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."SesionUsuario" (id, "tokenHash", "usuarioId", "createdAt", "expiresAt") FROM stdin;
\.


--
-- Data for Name: Tienda; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Tienda" (id, codigo, nombre, activa, "ubicacionId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: TransferenciaConsulta; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."TransferenciaConsulta" (id, numero, fecha, usuario, "destinoOriginal", "tiendaId", estado, observacion, unidades, "cantidadCodigos", "ultimaImportacionId", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: TransferenciaConsultaImport; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."TransferenciaConsultaImport" (id, "nombreArchivo", "hashArchivo", "totalFilas", resumen, "importedAt", "importedById") FROM stdin;
\.


--
-- Data for Name: Ubicacion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Ubicacion" (id, codigo, nombre, tipo, "regionId") FROM stdin;
\.


--
-- Data for Name: Usuario; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Usuario" (id, email, nombre, activo, "createdAt", "updatedAt", estado, rol, "passwordHash", "debeCambiarPassword", "passwordTemporalHasta", "passwordChangedAt") FROM stdin;
\.


--
-- Data for Name: VinculoOperativo; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."VinculoOperativo" (id, "usuarioId", "ubicacionId", "perfilId") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
c7eb8805-10f5-4a13-8709-1c64a156ad1c	0213fce369d7bc10b6e4929a5bf4d11ec095186598a60ae8ab11f2bdbd576155	2026-10-06 18:48:09.659226+00	202610010001_codigo_unico_inconsistencia_tienda	\N	\N	2026-10-06 18:48:09.646189+00	1
21963d96-fd40-445f-bd8a-927033a06661	df667c677e165ca94e079f71e7416798057459ce5e5c4dc313f7295af4fdf78a	2026-10-06 18:48:09.0401+00	202609080001_base_negativos	\N	\N	2026-10-06 18:48:08.956086+00	1
244d67d1-ad0d-4e16-a182-fb4a63a725f4	14792b0b4fabd0237f02ec9cdba3bb1f6f03d5e7c174d12f0574f7b4cc54d90a	2026-10-06 18:48:09.459779+00	202609230002_limpiar_consultas_negativos_legacy	\N	\N	2026-10-06 18:48:09.436225+00	1
ea633fb2-4286-46b4-81a1-822161f4f17b	ba908f1836b198d3dc0b276b34ecb76ac307487bad2cf8add1b5dc69d91a907f	2026-10-06 18:48:09.056734+00	202609090001_interfaz_negativos	\N	\N	2026-10-06 18:48:09.042874+00	1
efcc8161-31ec-4ece-96bb-d034e62218ec	c622b783324a56375ff8d1bd5d509d71c54a2ddbf87be8830abeda4580db6528	2026-10-06 18:48:09.091265+00	202609100001_autenticacion	\N	\N	2026-10-06 18:48:09.061136+00	1
28e5d2b4-f149-49ac-a535-80255299cf77	0386452cd18a4db21ee08f50d70c8fb71268985e06cd134dce1beea7b446cadc	2026-10-06 18:48:09.153376+00	202609110001_autorizacion	\N	\N	2026-10-06 18:48:09.093835+00	1
76e989e7-c445-480f-add4-afb5035b30f1	aba32f9278d4eb36bcc14545f16d7435b209953bd331b3a62fa832496ec9fd76	2026-10-06 18:48:09.477046+00	202609230003_catalogo_tiendas	\N	\N	2026-10-06 18:48:09.462144+00	1
82cd9ee0-5f29-44a7-9d85-8d6723ec78c9	946898c28cfbbd9ea16a63f743540bb4a2f6043cc97d3a4715157dce6d41848b	2026-10-06 18:48:09.175385+00	202609110002_negativos_generales	\N	\N	2026-10-06 18:48:09.15616+00	1
fa95ca92-6522-4094-9fce-174c7577ba78	849b43e181c5ffc5413bf71d7f45e08496587b4ef2d5de8f3ec765eec5d24656	2026-10-06 18:48:09.21173+00	202609140001_administracion	\N	\N	2026-10-06 18:48:09.181765+00	1
0dbcd460-1e59-4219-90c9-562d745bb3d1	d3af6ef1d8da18c84c82b9f88c0b97bea2ce5c8d738ccb8d3f73c54d67cef5ae	2026-10-06 18:48:09.246791+00	202609150001_inventario	\N	\N	2026-10-06 18:48:09.215398+00	1
817b588e-0530-4a13-be72-a2a8b5356958	2292be15cfb6460251e96c8c82db2863e87a013f3ded89ada953db38dfb4fb67	2026-10-06 18:48:09.498728+00	202609240001_reportes_tienda	\N	\N	2026-10-06 18:48:09.479645+00	1
01b233f5-9120-4263-8ce9-254efb545709	ef19b2b735ee8e937aa2d2078799a2b9ed5ab627f92a7ded10ba869b70acaf98	2026-10-06 18:48:09.269965+00	202609150002_linea_bodega_inventario	\N	\N	2026-10-06 18:48:09.25047+00	1
b491ab73-d84e-4bdd-9ea8-78ed52bc25d0	5d39231dbabf70b9460348996abd00c119740513cfe32135c60b0c5d8c100a0c	2026-10-06 18:48:09.297941+00	202609150003_excepcion_bodega_producto	\N	\N	2026-10-06 18:48:09.27302+00	1
7cc3ded3-a808-4a4e-8b8f-5a3c38ffa22c	1fd3a2dd00a147ce03eb25deb241585645f787edef7f74dc1d9bb6fef9ea4915	2026-10-06 18:48:09.683272+00	202610010002_normalizar_sincronizacion_app_tienda	\N	\N	2026-10-06 18:48:09.663551+00	1
63b45328-1228-42c9-b196-8f5e4e328308	cd8c70e243d54b2817e16932e7c6b1c031a5d4cf4cf91fc7154b333a8b70a52d	2026-10-06 18:48:09.356406+00	202609150004_inconsistencias	\N	\N	2026-10-06 18:48:09.305861+00	1
347425fb-f496-4a53-a031-add1348384d4	a0902050da2544d0b0d535bd1cd21edf963eecc0b1e6af95c1a1a71c623b0c41	2026-10-06 18:48:09.520322+00	202609240002_transferencias_operativas	\N	\N	2026-10-06 18:48:09.501479+00	1
161a5605-a1eb-4020-8a65-9e34fc4b0aa2	10ee07fcba4a1a4ab5f5d889b7a04e15d45c4697e2a0d1e5ed59d4c134e1a266	2026-10-06 18:48:09.370818+00	202609150005_conteo_inconsistencias	\N	\N	2026-10-06 18:48:09.359682+00	1
14e81ba4-d1e1-44cd-ab44-e41aec217850	54819192c1fd967ab2e66df43415d16f53b568034c2ea1decbc8c10c3ad12fc7	2026-10-06 18:48:09.396997+00	202609210001_conteo_snapshot_workflow	\N	\N	2026-10-06 18:48:09.373776+00	1
5241d048-b29e-4e0e-a6c3-bf45716a8bec	5c78a9bc4aba05969f9e9313f70c6cf18fa7dba78e71b5559eb93c63248ddd56	2026-10-06 18:48:09.433161+00	202609230001_modulo_tiendas	\N	\N	2026-10-06 18:48:09.400613+00	1
7b9a40fa-600d-473e-add0-af1c6b2822e1	63d6ed044aff199d9dfb40345607f9c8ea7f0a0f0f6248fb11d67319bca60c77	2026-10-06 18:48:09.532344+00	202609240003_normalizar_nombres_tiendas	\N	\N	2026-10-06 18:48:09.522682+00	1
b40007e8-a8f4-4411-96e1-10df99de6de0	cdc8111bcaaac883bebddd1d94a6466411db51b1221541a3d1cf6a46c033d307	2026-10-06 18:48:09.551147+00	202609240004_transferencias_consulta	\N	\N	2026-10-06 18:48:09.534863+00	1
3128b620-4fa6-481b-a36c-cef5c47ffe16	5c741cee0f38130dea08ba65bfd5f79cf54a29b1efa57cc754019e984b9eb201	2026-10-06 18:48:09.736444+00	202610010003_fotografias_negativos_semanales	\N	\N	2026-10-06 18:48:09.689851+00	1
6da153da-edf7-4470-952a-d7b3a97df5d8	45ccbe26bcac37f98bb1430e9cef3f1a33027d2fbeeaec900ffb758d654476cf	2026-10-06 18:48:09.576128+00	202609240005_cascade_report_inconsistencies	\N	\N	2026-10-06 18:48:09.553703+00	1
e7d12936-ec81-454d-9de9-66099ac4b843	ded4d76c95fd9ed5762de74fc168e3b8b18bab6310e8b75ea1d2e1ef1263ee4c	2026-10-06 18:48:09.635511+00	202609300001_pedidos_tienda	\N	\N	2026-10-06 18:48:09.578726+00	1
b4d7a8bf-d35d-4734-a220-9b82d102368d	c91b480532a561e380a6cce0466f32c6c6a052ac77ffec4f6c7b64787fed3daa	2026-10-06 18:48:09.749404+00	202610010004_un_corte_negativos_por_fecha	\N	\N	2026-10-06 18:48:09.739719+00	1
aaf84e9d-8627-46c5-8395-1830a5d8c6f5	ba94af9428d48212d96cef5d5bc569a4e317a7df58b0bc607dc1fb2092302a41	2026-10-06 18:48:09.767128+00	202610020001_retirar_google_sheets	\N	\N	2026-10-06 18:48:09.75207+00	1
58d6c5ed-99fc-46a8-8ee9-9aae5afcce95	64235c5089deb392f26521a8a56c2a3b130d9a69770962bf1491965fa48860b1	2026-10-06 18:48:09.787732+00	202610050001_retirar_transferencias_operativas	\N	\N	2026-10-06 18:48:09.770686+00	1
\.


--
-- Name: AsignacionAcceso AsignacionAcceso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AsignacionAcceso"
    ADD CONSTRAINT "AsignacionAcceso_pkey" PRIMARY KEY (id);


--
-- Name: Auditoria Auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Auditoria"
    ADD CONSTRAINT "Auditoria_pkey" PRIMARY KEY (id);


--
-- Name: BodegaProducto BodegaProducto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BodegaProducto"
    ADD CONSTRAINT "BodegaProducto_pkey" PRIMARY KEY (id);


--
-- Name: Bodega Bodega_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Bodega"
    ADD CONSTRAINT "Bodega_pkey" PRIMARY KEY (id);


--
-- Name: ConsultaInventario ConsultaInventario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ConsultaInventario"
    ADD CONSTRAINT "ConsultaInventario_pkey" PRIMARY KEY (id);


--
-- Name: ExcepcionBodegaProducto ExcepcionBodegaProducto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExcepcionBodegaProducto"
    ADD CONSTRAINT "ExcepcionBodegaProducto_pkey" PRIMARY KEY (id);


--
-- Name: FotoNegativoItem FotoNegativoItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FotoNegativoItem"
    ADD CONSTRAINT "FotoNegativoItem_pkey" PRIMARY KEY (id);


--
-- Name: FotoNegativos FotoNegativos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FotoNegativos"
    ADD CONSTRAINT "FotoNegativos_pkey" PRIMARY KEY (id);


--
-- Name: HistorialNegativo HistorialNegativo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HistorialNegativo"
    ADD CONSTRAINT "HistorialNegativo_pkey" PRIMARY KEY (id);


--
-- Name: InconsistenciaCodigoNoInventario InconsistenciaCodigoNoInventario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InconsistenciaCodigoNoInventario"
    ADD CONSTRAINT "InconsistenciaCodigoNoInventario_pkey" PRIMARY KEY (id);


--
-- Name: InconsistenciaCodigoNoInventario InconsistenciaCodigoNoInventario_solicitudId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InconsistenciaCodigoNoInventario"
    ADD CONSTRAINT "InconsistenciaCodigoNoInventario_solicitudId_key" UNIQUE ("solicitudId");


--
-- Name: Inconsistencia Inconsistencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Inconsistencia"
    ADD CONSTRAINT "Inconsistencia_pkey" PRIMARY KEY (id);


--
-- Name: IntentoAcceso IntentoAcceso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntentoAcceso"
    ADD CONSTRAINT "IntentoAcceso_pkey" PRIMARY KEY (clave);


--
-- Name: InventarioActual InventarioActual_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventarioActual"
    ADD CONSTRAINT "InventarioActual_pkey" PRIMARY KEY (id);


--
-- Name: LineaInventario LineaInventario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LineaInventario"
    ADD CONSTRAINT "LineaInventario_pkey" PRIMARY KEY (id);


--
-- Name: Negativo Negativo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Negativo"
    ADD CONSTRAINT "Negativo_pkey" PRIMARY KEY (id);


--
-- Name: PedidoTiendaItem PedidoTiendaItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PedidoTiendaItem"
    ADD CONSTRAINT "PedidoTiendaItem_pkey" PRIMARY KEY (id);


--
-- Name: PedidoTienda PedidoTienda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PedidoTienda"
    ADD CONSTRAINT "PedidoTienda_pkey" PRIMARY KEY (id);


--
-- Name: PerfilLaboral PerfilLaboral_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PerfilLaboral"
    ADD CONSTRAINT "PerfilLaboral_codigo_key" UNIQUE (codigo);


--
-- Name: PerfilLaboral PerfilLaboral_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PerfilLaboral"
    ADD CONSTRAINT "PerfilLaboral_pkey" PRIMARY KEY (id);


--
-- Name: Producto Producto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Producto"
    ADD CONSTRAINT "Producto_pkey" PRIMARY KEY (id);


--
-- Name: ReporteTransferenciaTienda ReporteTransferenciaTienda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReporteTransferenciaTienda"
    ADD CONSTRAINT "ReporteTransferenciaTienda_pkey" PRIMARY KEY (id);


--
-- Name: ReporteTransferenciaTienda ReporteTransferenciaTienda_solicitudId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReporteTransferenciaTienda"
    ADD CONSTRAINT "ReporteTransferenciaTienda_solicitudId_key" UNIQUE ("solicitudId");


--
-- Name: ReporteTransferenciaTienda ReporteTransferenciaTienda_tiendaId_transferencia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReporteTransferenciaTienda"
    ADD CONSTRAINT "ReporteTransferenciaTienda_tiendaId_transferencia_key" UNIQUE ("tiendaId", transferencia);


--
-- Name: SesionUsuario SesionUsuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SesionUsuario"
    ADD CONSTRAINT "SesionUsuario_pkey" PRIMARY KEY (id);


--
-- Name: SesionUsuario SesionUsuario_tokenHash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SesionUsuario"
    ADD CONSTRAINT "SesionUsuario_tokenHash_key" UNIQUE ("tokenHash");


--
-- Name: Tienda Tienda_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tienda"
    ADD CONSTRAINT "Tienda_codigo_key" UNIQUE (codigo);


--
-- Name: Tienda Tienda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tienda"
    ADD CONSTRAINT "Tienda_pkey" PRIMARY KEY (id);


--
-- Name: Tienda Tienda_ubicacionId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tienda"
    ADD CONSTRAINT "Tienda_ubicacionId_key" UNIQUE ("ubicacionId");


--
-- Name: TransferenciaConsultaImport TransferenciaConsultaImport_hashArchivo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferenciaConsultaImport"
    ADD CONSTRAINT "TransferenciaConsultaImport_hashArchivo_key" UNIQUE ("hashArchivo");


--
-- Name: TransferenciaConsultaImport TransferenciaConsultaImport_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferenciaConsultaImport"
    ADD CONSTRAINT "TransferenciaConsultaImport_pkey" PRIMARY KEY (id);


--
-- Name: TransferenciaConsulta TransferenciaConsulta_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferenciaConsulta"
    ADD CONSTRAINT "TransferenciaConsulta_numero_key" UNIQUE (numero);


--
-- Name: TransferenciaConsulta TransferenciaConsulta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferenciaConsulta"
    ADD CONSTRAINT "TransferenciaConsulta_pkey" PRIMARY KEY (id);


--
-- Name: Ubicacion Ubicacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ubicacion"
    ADD CONSTRAINT "Ubicacion_pkey" PRIMARY KEY (id);


--
-- Name: Usuario Usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Usuario"
    ADD CONSTRAINT "Usuario_pkey" PRIMARY KEY (id);


--
-- Name: VinculoOperativo VinculoOperativo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VinculoOperativo"
    ADD CONSTRAINT "VinculoOperativo_pkey" PRIMARY KEY (id);


--
-- Name: VinculoOperativo VinculoOperativo_usuarioId_perfilId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VinculoOperativo"
    ADD CONSTRAINT "VinculoOperativo_usuarioId_perfilId_key" UNIQUE ("usuarioId", "perfilId");


--
-- Name: VinculoOperativo VinculoOperativo_usuarioId_ubicacionId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VinculoOperativo"
    ADD CONSTRAINT "VinculoOperativo_usuarioId_ubicacionId_key" UNIQUE ("usuarioId", "ubicacionId");


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: AsignacionAcceso_nacional_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AsignacionAcceso_nacional_key" ON public."AsignacionAcceso" USING btree ("usuarioId", rol) WHERE ("ubicacionId" IS NULL);


--
-- Name: AsignacionAcceso_usuarioId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AsignacionAcceso_usuarioId_idx" ON public."AsignacionAcceso" USING btree ("usuarioId");


--
-- Name: AsignacionAcceso_usuarioId_rol_ubicacionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AsignacionAcceso_usuarioId_rol_ubicacionId_key" ON public."AsignacionAcceso" USING btree ("usuarioId", rol, "ubicacionId");


--
-- Name: Auditoria_correlacionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Auditoria_correlacionId_idx" ON public."Auditoria" USING btree ("correlacionId");


--
-- Name: Auditoria_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Auditoria_createdAt_id_idx" ON public."Auditoria" USING btree ("createdAt", id);


--
-- Name: Auditoria_entidad_entidadId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Auditoria_entidad_entidadId_createdAt_idx" ON public."Auditoria" USING btree (entidad, "entidadId", "createdAt");


--
-- Name: Auditoria_usuarioId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Auditoria_usuarioId_createdAt_idx" ON public."Auditoria" USING btree ("usuarioId", "createdAt");


--
-- Name: BodegaProducto_nombre_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "BodegaProducto_nombre_key" ON public."BodegaProducto" USING btree (nombre);


--
-- Name: Bodega_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Bodega_codigo_key" ON public."Bodega" USING btree (codigo);


--
-- Name: Bodega_ubicacionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Bodega_ubicacionId_key" ON public."Bodega" USING btree ("ubicacionId");


--
-- Name: ConsultaInventario_fechaConsulta_fechaImportacion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ConsultaInventario_fechaConsulta_fechaImportacion_idx" ON public."ConsultaInventario" USING btree ("fechaConsulta", "fechaImportacion");


--
-- Name: ConsultaInventario_hashArchivo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ConsultaInventario_hashArchivo_key" ON public."ConsultaInventario" USING btree ("hashArchivo");


--
-- Name: ExcepcionBodegaProducto_bodegaProductoId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExcepcionBodegaProducto_bodegaProductoId_idx" ON public."ExcepcionBodegaProducto" USING btree ("bodegaProductoId");


--
-- Name: ExcepcionBodegaProducto_productoId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ExcepcionBodegaProducto_productoId_key" ON public."ExcepcionBodegaProducto" USING btree ("productoId");


--
-- Name: FotoNegativoItem_fotoId_productoId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FotoNegativoItem_fotoId_productoId_key" ON public."FotoNegativoItem" USING btree ("fotoId", "productoId");


--
-- Name: FotoNegativoItem_productoId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FotoNegativoItem_productoId_idx" ON public."FotoNegativoItem" USING btree ("productoId");


--
-- Name: FotoNegativos_consultaId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FotoNegativos_consultaId_key" ON public."FotoNegativos" USING btree ("consultaId");


--
-- Name: FotoNegativos_fechaCorte_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FotoNegativos_fechaCorte_idx" ON public."FotoNegativos" USING btree ("fechaCorte");


--
-- Name: FotoNegativos_fechaCorte_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FotoNegativos_fechaCorte_key" ON public."FotoNegativos" USING btree ("fechaCorte");


--
-- Name: HistorialNegativo_negativoId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "HistorialNegativo_negativoId_createdAt_idx" ON public."HistorialNegativo" USING btree ("negativoId", "createdAt");


--
-- Name: HistorialNegativo_usuarioId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "HistorialNegativo_usuarioId_idx" ON public."HistorialNegativo" USING btree ("usuarioId");


--
-- Name: InconsistenciaCodigoNoInventario_codigoBarraNoInventario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InconsistenciaCodigoNoInventario_codigoBarraNoInventario_idx" ON public."InconsistenciaCodigoNoInventario" USING btree ("codigoBarraNoInventario");


--
-- Name: InconsistenciaCodigoNoInventario_reporteTiendaId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InconsistenciaCodigoNoInventario_reporteTiendaId_idx" ON public."InconsistenciaCodigoNoInventario" USING btree ("reporteTiendaId");


--
-- Name: InconsistenciaCodigoNoInventario_tiendaId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InconsistenciaCodigoNoInventario_tiendaId_createdAt_idx" ON public."InconsistenciaCodigoNoInventario" USING btree ("tiendaId", "createdAt");


--
-- Name: InconsistenciaCodigoNoInventario_transferencia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InconsistenciaCodigoNoInventario_transferencia_idx" ON public."InconsistenciaCodigoNoInventario" USING btree (transferencia);


--
-- Name: Inconsistencia_bodegaProductoId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_bodegaProductoId_idx" ON public."Inconsistencia" USING btree ("bodegaProductoId");


--
-- Name: Inconsistencia_claveCruce_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_claveCruce_idx" ON public."Inconsistencia" USING btree ("claveCruce");


--
-- Name: Inconsistencia_codigoBarra_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_codigoBarra_idx" ON public."Inconsistencia" USING btree ("codigoBarra");


--
-- Name: Inconsistencia_conteoFisico_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_conteoFisico_idx" ON public."Inconsistencia" USING btree ("conteoFisico");


--
-- Name: Inconsistencia_grupoReporteId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_grupoReporteId_idx" ON public."Inconsistencia" USING btree ("grupoReporteId");


--
-- Name: Inconsistencia_reportadoPorId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_reportadoPorId_createdAt_idx" ON public."Inconsistencia" USING btree ("reportadoPorId", "createdAt");


--
-- Name: Inconsistencia_reporteTiendaId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_reporteTiendaId_idx" ON public."Inconsistencia" USING btree ("reporteTiendaId");


--
-- Name: Inconsistencia_resuelto_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_resuelto_updatedAt_idx" ON public."Inconsistencia" USING btree (resuelto, "updatedAt");


--
-- Name: Inconsistencia_sourceKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Inconsistencia_sourceKey_key" ON public."Inconsistencia" USING btree ("sourceKey");


--
-- Name: Inconsistencia_sucursal_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_sucursal_idx" ON public."Inconsistencia" USING btree (sucursal);


--
-- Name: Inconsistencia_tiendaId_resuelto_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_tiendaId_resuelto_createdAt_idx" ON public."Inconsistencia" USING btree ("tiendaId", resuelto, "createdAt");


--
-- Name: Inconsistencia_transferencia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Inconsistencia_transferencia_idx" ON public."Inconsistencia" USING btree (transferencia);


--
-- Name: IntentoAcceso_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IntentoAcceso_expiresAt_idx" ON public."IntentoAcceso" USING btree ("expiresAt");


--
-- Name: InventarioActual_bodegaProductoId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventarioActual_bodegaProductoId_idx" ON public."InventarioActual" USING btree ("bodegaProductoId");


--
-- Name: InventarioActual_productoId_bodegaProductoId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InventarioActual_productoId_bodegaProductoId_key" ON public."InventarioActual" USING btree ("productoId", "bodegaProductoId");


--
-- Name: InventarioActual_productoId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InventarioActual_productoId_idx" ON public."InventarioActual" USING btree ("productoId");


--
-- Name: LineaInventario_linea_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LineaInventario_linea_key" ON public."LineaInventario" USING btree (linea);


--
-- Name: Negativo_bodegaId_anuladoAt_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Negativo_bodegaId_anuladoAt_estado_idx" ON public."Negativo" USING btree ("bodegaId", "anuladoAt", estado);


--
-- Name: Negativo_conteoFisico_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Negativo_conteoFisico_idx" ON public."Negativo" USING btree ("conteoFisico");


--
-- Name: Negativo_id_bodegaId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Negativo_id_bodegaId_key" ON public."Negativo" USING btree (id, "bodegaId");


--
-- Name: Negativo_productoId_bodegaId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Negativo_productoId_bodegaId_key" ON public."Negativo" USING btree ("productoId", "bodegaId");


--
-- Name: Negativo_responsableId_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Negativo_responsableId_estado_idx" ON public."Negativo" USING btree ("responsableId", estado);


--
-- Name: Negativo_ultimaDeteccion_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Negativo_ultimaDeteccion_idx" ON public."Negativo" USING btree ("ultimaDeteccion");


--
-- Name: PedidoTiendaItem_pedidoId_productoId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PedidoTiendaItem_pedidoId_productoId_key" ON public."PedidoTiendaItem" USING btree ("pedidoId", "productoId");


--
-- Name: PedidoTiendaItem_productoId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PedidoTiendaItem_productoId_idx" ON public."PedidoTiendaItem" USING btree ("productoId");


--
-- Name: PedidoTienda_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PedidoTienda_codigo_key" ON public."PedidoTienda" USING btree (codigo);


--
-- Name: PedidoTienda_estado_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PedidoTienda_estado_createdAt_idx" ON public."PedidoTienda" USING btree (estado, "createdAt");


--
-- Name: PedidoTienda_solicitadoPorId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PedidoTienda_solicitadoPorId_createdAt_idx" ON public."PedidoTienda" USING btree ("solicitadoPorId", "createdAt");


--
-- Name: PedidoTienda_tiendaId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PedidoTienda_tiendaId_createdAt_idx" ON public."PedidoTienda" USING btree ("tiendaId", "createdAt");


--
-- Name: Producto_codigoBarra_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Producto_codigoBarra_key" ON public."Producto" USING btree ("codigoBarra");


--
-- Name: Producto_linea_marca_activo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Producto_linea_marca_activo_idx" ON public."Producto" USING btree (linea, marca, activo);


--
-- Name: Producto_marca_activo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Producto_marca_activo_idx" ON public."Producto" USING btree (marca, activo);


--
-- Name: Producto_referencia_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Producto_referencia_idx" ON public."Producto" USING btree (referencia);


--
-- Name: ReporteTransferenciaTienda_reportadoPorId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReporteTransferenciaTienda_reportadoPorId_createdAt_idx" ON public."ReporteTransferenciaTienda" USING btree ("reportadoPorId", "createdAt");


--
-- Name: SesionUsuario_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SesionUsuario_expiresAt_idx" ON public."SesionUsuario" USING btree ("expiresAt");


--
-- Name: SesionUsuario_usuarioId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SesionUsuario_usuarioId_idx" ON public."SesionUsuario" USING btree ("usuarioId");


--
-- Name: Tienda_activa_nombre_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Tienda_activa_nombre_idx" ON public."Tienda" USING btree (activa, nombre);


--
-- Name: TransferenciaConsultaImport_importedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransferenciaConsultaImport_importedAt_idx" ON public."TransferenciaConsultaImport" USING btree ("importedAt");


--
-- Name: TransferenciaConsulta_estado_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransferenciaConsulta_estado_fecha_idx" ON public."TransferenciaConsulta" USING btree (estado, fecha);


--
-- Name: TransferenciaConsulta_tiendaId_estado_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransferenciaConsulta_tiendaId_estado_fecha_idx" ON public."TransferenciaConsulta" USING btree ("tiendaId", estado, fecha);


--
-- Name: TransferenciaConsulta_ultimaImportacionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TransferenciaConsulta_ultimaImportacionId_idx" ON public."TransferenciaConsulta" USING btree ("ultimaImportacionId");


--
-- Name: Ubicacion_codigo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Ubicacion_codigo_key" ON public."Ubicacion" USING btree (codigo);


--
-- Name: Ubicacion_regionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Ubicacion_regionId_idx" ON public."Ubicacion" USING btree ("regionId");


--
-- Name: Usuario_email_insensible_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Usuario_email_insensible_key" ON public."Usuario" USING btree (lower((email)::text));


--
-- Name: Usuario_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Usuario_email_key" ON public."Usuario" USING btree (email);


--
-- Name: Auditoria Auditoria_inmutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Auditoria_inmutable" BEFORE DELETE OR UPDATE ON public."Auditoria" FOR EACH ROW EXECUTE FUNCTION public.pdmc_auditoria_inmutable();


--
-- Name: Bodega Bodega_ubicacion_validar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Bodega_ubicacion_validar" BEFORE INSERT OR UPDATE ON public."Bodega" FOR EACH ROW EXECUTE FUNCTION public.pdmc_bodega_ubicacion_validar();


--
-- Name: Ubicacion Ubicacion_validar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Ubicacion_validar" BEFORE INSERT OR UPDATE ON public."Ubicacion" FOR EACH ROW EXECUTE FUNCTION public.pdmc_ubicacion_validar();


--
-- Name: AsignacionAcceso AsignacionAcceso_ubicacionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AsignacionAcceso"
    ADD CONSTRAINT "AsignacionAcceso_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES public."Ubicacion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AsignacionAcceso AsignacionAcceso_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AsignacionAcceso"
    ADD CONSTRAINT "AsignacionAcceso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Auditoria Auditoria_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Auditoria"
    ADD CONSTRAINT "Auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Bodega Bodega_ubicacionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Bodega"
    ADD CONSTRAINT "Bodega_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES public."Ubicacion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ConsultaInventario ConsultaInventario_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ConsultaInventario"
    ADD CONSTRAINT "ConsultaInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ExcepcionBodegaProducto ExcepcionBodegaProducto_bodegaProductoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExcepcionBodegaProducto"
    ADD CONSTRAINT "ExcepcionBodegaProducto_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES public."BodegaProducto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ExcepcionBodegaProducto ExcepcionBodegaProducto_productoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExcepcionBodegaProducto"
    ADD CONSTRAINT "ExcepcionBodegaProducto_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES public."Producto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FotoNegativoItem FotoNegativoItem_fotoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FotoNegativoItem"
    ADD CONSTRAINT "FotoNegativoItem_fotoId_fkey" FOREIGN KEY ("fotoId") REFERENCES public."FotoNegativos"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FotoNegativoItem FotoNegativoItem_productoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FotoNegativoItem"
    ADD CONSTRAINT "FotoNegativoItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES public."Producto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FotoNegativos FotoNegativos_consultaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FotoNegativos"
    ADD CONSTRAINT "FotoNegativos_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES public."ConsultaInventario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: HistorialNegativo HistorialNegativo_negativoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HistorialNegativo"
    ADD CONSTRAINT "HistorialNegativo_negativoId_fkey" FOREIGN KEY ("negativoId") REFERENCES public."Negativo"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: HistorialNegativo HistorialNegativo_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HistorialNegativo"
    ADD CONSTRAINT "HistorialNegativo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InconsistenciaCodigoNoInventario InconsistenciaCodigoNoInventario_reportadoPorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InconsistenciaCodigoNoInventario"
    ADD CONSTRAINT "InconsistenciaCodigoNoInventario_reportadoPorId_fkey" FOREIGN KEY ("reportadoPorId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InconsistenciaCodigoNoInventario InconsistenciaCodigoNoInventario_reporteTiendaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InconsistenciaCodigoNoInventario"
    ADD CONSTRAINT "InconsistenciaCodigoNoInventario_reporteTiendaId_fkey" FOREIGN KEY ("reporteTiendaId") REFERENCES public."ReporteTransferenciaTienda"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InconsistenciaCodigoNoInventario InconsistenciaCodigoNoInventario_tiendaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InconsistenciaCodigoNoInventario"
    ADD CONSTRAINT "InconsistenciaCodigoNoInventario_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES public."Ubicacion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Inconsistencia Inconsistencia_actualizadoPorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Inconsistencia"
    ADD CONSTRAINT "Inconsistencia_actualizadoPorId_fkey" FOREIGN KEY ("actualizadoPorId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Inconsistencia Inconsistencia_bodegaProductoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Inconsistencia"
    ADD CONSTRAINT "Inconsistencia_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES public."BodegaProducto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Inconsistencia Inconsistencia_productoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Inconsistencia"
    ADD CONSTRAINT "Inconsistencia_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES public."Producto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Inconsistencia Inconsistencia_reportadoPorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Inconsistencia"
    ADD CONSTRAINT "Inconsistencia_reportadoPorId_fkey" FOREIGN KEY ("reportadoPorId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Inconsistencia Inconsistencia_reporteTiendaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Inconsistencia"
    ADD CONSTRAINT "Inconsistencia_reporteTiendaId_fkey" FOREIGN KEY ("reporteTiendaId") REFERENCES public."ReporteTransferenciaTienda"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Inconsistencia Inconsistencia_tiendaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Inconsistencia"
    ADD CONSTRAINT "Inconsistencia_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES public."Ubicacion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventarioActual InventarioActual_bodegaProductoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventarioActual"
    ADD CONSTRAINT "InventarioActual_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES public."BodegaProducto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventarioActual InventarioActual_consultaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventarioActual"
    ADD CONSTRAINT "InventarioActual_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES public."ConsultaInventario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InventarioActual InventarioActual_productoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InventarioActual"
    ADD CONSTRAINT "InventarioActual_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES public."Producto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LineaInventario LineaInventario_bodegaProductoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LineaInventario"
    ADD CONSTRAINT "LineaInventario_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES public."BodegaProducto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Negativo Negativo_bodegaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Negativo"
    ADD CONSTRAINT "Negativo_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES public."Bodega"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Negativo Negativo_bodegaProductoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Negativo"
    ADD CONSTRAINT "Negativo_bodegaProductoId_fkey" FOREIGN KEY ("bodegaProductoId") REFERENCES public."BodegaProducto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Negativo Negativo_fusionadoEnId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Negativo"
    ADD CONSTRAINT "Negativo_fusionadoEnId_fkey" FOREIGN KEY ("fusionadoEnId") REFERENCES public."Negativo"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Negativo Negativo_productoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Negativo"
    ADD CONSTRAINT "Negativo_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES public."Producto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Negativo Negativo_responsableId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Negativo"
    ADD CONSTRAINT "Negativo_responsableId_fkey" FOREIGN KEY ("responsableId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PedidoTiendaItem PedidoTiendaItem_pedidoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PedidoTiendaItem"
    ADD CONSTRAINT "PedidoTiendaItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES public."PedidoTienda"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PedidoTiendaItem PedidoTiendaItem_productoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PedidoTiendaItem"
    ADD CONSTRAINT "PedidoTiendaItem_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES public."Producto"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PedidoTienda PedidoTienda_solicitadoPorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PedidoTienda"
    ADD CONSTRAINT "PedidoTienda_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PedidoTienda PedidoTienda_tiendaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PedidoTienda"
    ADD CONSTRAINT "PedidoTienda_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES public."Ubicacion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PerfilLaboral PerfilLaboral_ubicacionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PerfilLaboral"
    ADD CONSTRAINT "PerfilLaboral_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES public."Ubicacion"(id) ON DELETE RESTRICT;


--
-- Name: ReporteTransferenciaTienda ReporteTransferenciaTienda_reportadoPorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReporteTransferenciaTienda"
    ADD CONSTRAINT "ReporteTransferenciaTienda_reportadoPorId_fkey" FOREIGN KEY ("reportadoPorId") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ReporteTransferenciaTienda ReporteTransferenciaTienda_tiendaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReporteTransferenciaTienda"
    ADD CONSTRAINT "ReporteTransferenciaTienda_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES public."Ubicacion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SesionUsuario SesionUsuario_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SesionUsuario"
    ADD CONSTRAINT "SesionUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public."Usuario"(id) ON DELETE CASCADE;


--
-- Name: Tienda Tienda_ubicacionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tienda"
    ADD CONSTRAINT "Tienda_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES public."Ubicacion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TransferenciaConsultaImport TransferenciaConsultaImport_importedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferenciaConsultaImport"
    ADD CONSTRAINT "TransferenciaConsultaImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES public."Usuario"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TransferenciaConsulta TransferenciaConsulta_tiendaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferenciaConsulta"
    ADD CONSTRAINT "TransferenciaConsulta_tiendaId_fkey" FOREIGN KEY ("tiendaId") REFERENCES public."Ubicacion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TransferenciaConsulta TransferenciaConsulta_ultimaImportacionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TransferenciaConsulta"
    ADD CONSTRAINT "TransferenciaConsulta_ultimaImportacionId_fkey" FOREIGN KEY ("ultimaImportacionId") REFERENCES public."TransferenciaConsultaImport"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Ubicacion Ubicacion_regionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Ubicacion"
    ADD CONSTRAINT "Ubicacion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES public."Ubicacion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: VinculoOperativo VinculoOperativo_perfilId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VinculoOperativo"
    ADD CONSTRAINT "VinculoOperativo_perfilId_fkey" FOREIGN KEY ("perfilId") REFERENCES public."PerfilLaboral"(id) ON DELETE RESTRICT;


--
-- Name: VinculoOperativo VinculoOperativo_ubicacionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VinculoOperativo"
    ADD CONSTRAINT "VinculoOperativo_ubicacionId_fkey" FOREIGN KEY ("ubicacionId") REFERENCES public."Ubicacion"(id) ON DELETE RESTRICT;


--
-- Name: VinculoOperativo VinculoOperativo_usuarioId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."VinculoOperativo"
    ADD CONSTRAINT "VinculoOperativo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES public."Usuario"(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict 94ctThHdAuqsjqeMEtPrF85zKHIwoqsczaE7v7X6DFdwTziyRUU2IiIz965ewpn

