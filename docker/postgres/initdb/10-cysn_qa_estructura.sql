-- Estructura del esquema cysn_qa (NEXO QA), sin datos. Volcado de pg_dump 18 del 2026-10-12;
-- se quitaron sus dos metacomandos de psql (restrict/unrestrict). Luego se aplican las migraciones 001-006.
--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6 (Debian 18.6-1.pgdg13+2)

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
-- Name: qa_estado_comparacion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE cysn_qa.qa_estado_comparacion AS ENUM (
    'IGUAL',
    'DIFERENCIA',
    'NO_EN_EMPRESAS',
    'NO_EN_CREACION'
);


--
-- Name: qa_estado_correccion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE cysn_qa.qa_estado_correccion AS ENUM (
    'PENDIENTE',
    'CORREGIDO'
);


--
-- Name: qa_estado_ejecucion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE cysn_qa.qa_estado_ejecucion AS ENUM (
    'PREPARANDO',
    'CARGANDO',
    'PROCESANDO',
    'COMPLETADA',
    'ERROR',
    'CERRADA'
);


--
-- Name: qa_estado_importacion; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE cysn_qa.qa_estado_importacion AS ENUM (
    'PENDIENTE',
    'IMPORTANDO',
    'COMPLETADA',
    'ERROR'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: creacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.creacion (
    registro_id bigint NOT NULL,
    sucursal_origen character varying(255),
    tasa_cambio numeric(18,6),
    fecha_tasa_cambio timestamp without time zone,
    codigo_barra character varying(100) NOT NULL,
    referencia character varying(180),
    codigo_marca_origen character varying(100),
    concatenado character varying(255),
    marca_origen character varying(180),
    descripcion text,
    codigo_categoria character varying(100),
    nombre_categoria character varying(180),
    status_origen character varying(100),
    existencia numeric(18,2),
    costo_dolar numeric(18,4),
    costo_inicial numeric(18,4),
    precio_promocion numeric(18,4),
    precio_detal_usd_mas_iva numeric(18,4),
    precio_detal_mas_iva numeric(18,4),
    precio_mayor_usd_mas_iva numeric(18,4),
    precio_mayor_mas_iva numeric(18,4),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    hash_origen character varying(64),
    sincronizado_en timestamp with time zone,
    vigente boolean DEFAULT true NOT NULL,
    ultima_ejecucion_id bigint
);


--
-- Name: creacion_registro_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.creacion_registro_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creacion_registro_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.creacion_registro_id_seq OWNED BY cysn_qa.creacion.registro_id;


--
-- Name: creacion_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.creacion_snapshot (
    id bigint NOT NULL,
    qa_ciclo_id bigint NOT NULL,
    creado_por_user_id bigint,
    estado character varying(30) DEFAULT 'PREPARANDO'::character varying NOT NULL,
    total_registros integer DEFAULT 0 NOT NULL,
    origen character varying(100) DEFAULT 'CREACION'::character varying NOT NULL,
    iniciado_at timestamp with time zone,
    completado_at timestamp with time zone,
    error_mensaje text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_creacion_snapshot_estado CHECK (((estado)::text = ANY (ARRAY[('PREPARANDO'::character varying)::text, ('CAPTURANDO'::character varying)::text, ('COMPLETADO'::character varying)::text, ('ERROR'::character varying)::text]))),
    CONSTRAINT ck_creacion_snapshot_total CHECK ((total_registros >= 0))
);


--
-- Name: creacion_snapshot_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.creacion_snapshot_detalle (
    id bigint NOT NULL,
    creacion_snapshot_id bigint NOT NULL,
    codigo_barra character varying(100) NOT NULL,
    referencia character varying(180),
    codigo_marca character varying(100),
    marca character varying(180),
    descripcion text,
    categoria character varying(100),
    status character varying(100),
    existencia numeric(18,2),
    tasa_cambio numeric(18,6),
    fecha_tasa_cambio timestamp with time zone,
    precio_detal_usd_mas_iva numeric(18,4),
    precio_detal_mas_iva numeric(18,4),
    precio_mayor_usd_mas_iva numeric(18,4),
    precio_mayor_mas_iva numeric(18,4),
    precio_promocion numeric(18,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: creacion_snapshot_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.creacion_snapshot_detalle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creacion_snapshot_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.creacion_snapshot_detalle_id_seq OWNED BY cysn_qa.creacion_snapshot_detalle.id;


--
-- Name: creacion_snapshot_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.creacion_snapshot_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: creacion_snapshot_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.creacion_snapshot_id_seq OWNED BY cysn_qa.creacion_snapshot.id;


--
-- Name: empresa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.empresa (
    id bigint NOT NULL,
    codigo character varying(50),
    nombre character varying(180) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: empresa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.empresa_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: empresa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.empresa_id_seq OWNED BY cysn_qa.empresa.id;


--
-- Name: inventario_carga; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.inventario_carga (
    id bigint NOT NULL,
    qa_ciclo_sucursal_id bigint NOT NULL,
    cargado_por_user_id bigint NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    es_actual boolean DEFAULT true NOT NULL,
    reemplaza_carga_id bigint,
    archivo_nombre_original character varying(255) NOT NULL,
    archivo_nombre_guardado character varying(255),
    archivo_ruta text,
    archivo_sha256 character varying(64) NOT NULL,
    archivo_tamano_bytes bigint,
    estado character varying(30) DEFAULT 'RECIBIDO'::character varying NOT NULL,
    total_registros integer DEFAULT 0 NOT NULL,
    registros_validos integer DEFAULT 0 NOT NULL,
    registros_invalidos integer DEFAULT 0 NOT NULL,
    error_mensaje text,
    recibido_at timestamp with time zone DEFAULT now() NOT NULL,
    procesado_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_inventario_carga_estado CHECK (((estado)::text = ANY (ARRAY[('RECIBIDO'::character varying)::text, ('PROCESANDO'::character varying)::text, ('VALIDADO'::character varying)::text, ('RECHAZADO'::character varying)::text, ('ERROR'::character varying)::text, ('REEMPLAZADO'::character varying)::text]))),
    CONSTRAINT ck_inventario_carga_tamano CHECK (((archivo_tamano_bytes IS NULL) OR (archivo_tamano_bytes >= 0))),
    CONSTRAINT ck_inventario_carga_totales CHECK (((total_registros >= 0) AND (registros_validos >= 0) AND (registros_invalidos >= 0))),
    CONSTRAINT ck_inventario_carga_version CHECK ((version >= 1))
);


--
-- Name: inventario_carga_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.inventario_carga_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventario_carga_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.inventario_carga_id_seq OWNED BY cysn_qa.inventario_carga.id;


--
-- Name: inventario_detalle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.inventario_detalle (
    id bigint NOT NULL,
    inventario_carga_id bigint NOT NULL,
    numero_fila_archivo integer,
    tasa_cambio numeric(18,6),
    fecha_tasa_cambio timestamp with time zone,
    codigo_barra character varying(100) NOT NULL,
    referencia character varying(180),
    codigo_marca character varying(100),
    concatenado character varying(255),
    marca character varying(180),
    descripcion text,
    status character varying(100),
    existencia numeric(18,2),
    precio_detal_usd_mas_iva numeric(18,4),
    precio_detal_mas_iva numeric(18,4),
    precio_mayor_usd_mas_iva numeric(18,4),
    precio_mayor_mas_iva numeric(18,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    codigo_categoria character varying(100),
    precio_promocion numeric(18,4),
    costo_inicial numeric(18,4),
    costo_dolar numeric(18,4),
    CONSTRAINT ck_inventario_detalle_numero_fila CHECK (((numero_fila_archivo IS NULL) OR (numero_fila_archivo >= 1)))
);


--
-- Name: inventario_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.inventario_detalle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventario_detalle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.inventario_detalle_id_seq OWNED BY cysn_qa.inventario_detalle.id;


--
-- Name: qa_ciclo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.qa_ciclo (
    id bigint NOT NULL,
    nombre character varying(180) NOT NULL,
    descripcion text,
    fecha_inicio date NOT NULL,
    fecha_fin date,
    estado character varying(30) DEFAULT 'PREPARANDO'::character varying NOT NULL,
    creado_por_user_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_qa_ciclo_estado CHECK (((estado)::text = ANY (ARRAY[('PREPARANDO'::character varying)::text, ('RECEPCION'::character varying)::text, ('LISTO_QA'::character varying)::text, ('PROCESANDO'::character varying)::text, ('COMPLETADO'::character varying)::text, ('CERRADO'::character varying)::text]))),
    CONSTRAINT ck_qa_ciclo_fechas CHECK (((fecha_fin IS NULL) OR (fecha_fin >= fecha_inicio)))
);


--
-- Name: qa_ciclo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.qa_ciclo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_ciclo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.qa_ciclo_id_seq OWNED BY cysn_qa.qa_ciclo.id;


--
-- Name: qa_ciclo_sucursal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.qa_ciclo_sucursal (
    id bigint NOT NULL,
    qa_ciclo_id bigint NOT NULL,
    sucursal_id bigint NOT NULL,
    estado_recepcion character varying(30) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    recibido_at timestamp with time zone,
    validado_at timestamp with time zone,
    observacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_qa_ciclo_sucursal_estado CHECK (((estado_recepcion)::text = ANY (ARRAY[('PENDIENTE'::character varying)::text, ('RECIBIDO'::character varying)::text, ('VALIDADO'::character varying)::text, ('RECHAZADO'::character varying)::text])))
);


--
-- Name: qa_ciclo_sucursal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.qa_ciclo_sucursal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_ciclo_sucursal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.qa_ciclo_sucursal_id_seq OWNED BY cysn_qa.qa_ciclo_sucursal.id;


--
-- Name: qa_correccion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.qa_correccion (
    id bigint NOT NULL,
    qa_diferencia_id bigint NOT NULL,
    estado_anterior cysn_qa.qa_estado_correccion NOT NULL,
    estado_nuevo cysn_qa.qa_estado_correccion NOT NULL,
    usuario character varying(180),
    observacion text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qa_correccion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.qa_correccion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_correccion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.qa_correccion_id_seq OWNED BY cysn_qa.qa_correccion.id;


--
-- Name: qa_diferencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.qa_diferencia (
    id bigint NOT NULL,
    qa_resultado_id bigint NOT NULL,
    tipo_diferencia_id smallint NOT NULL,
    valor_creacion text,
    valor_empresa text,
    diferencia_numerica numeric(20,6),
    estado_correccion cysn_qa.qa_estado_correccion DEFAULT 'PENDIENTE'::cysn_qa.qa_estado_correccion NOT NULL,
    corregido_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qa_diferencia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.qa_diferencia_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_diferencia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.qa_diferencia_id_seq OWNED BY cysn_qa.qa_diferencia.id;


--
-- Name: qa_ejecucion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.qa_ejecucion (
    id bigint NOT NULL,
    nombre character varying(180) NOT NULL,
    fecha_referencia date,
    estado cysn_qa.qa_estado_ejecucion DEFAULT 'PREPARANDO'::cysn_qa.qa_estado_ejecucion NOT NULL,
    descripcion text,
    fecha_inicio timestamp with time zone DEFAULT now() NOT NULL,
    fecha_fin timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    qa_ciclo_id bigint
);


--
-- Name: qa_ejecucion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.qa_ejecucion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_ejecucion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.qa_ejecucion_id_seq OWNED BY cysn_qa.qa_ejecucion.id;


--
-- Name: qa_importacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.qa_importacion (
    id bigint NOT NULL,
    qa_ejecucion_id bigint NOT NULL,
    nombre_archivo character varying(300) NOT NULL,
    sha256 character(64),
    tamano_bytes bigint,
    codificacion character varying(30),
    delimitador character varying(5),
    total_registros integer,
    estado cysn_qa.qa_estado_importacion DEFAULT 'PENDIENTE'::cysn_qa.qa_estado_importacion NOT NULL,
    mensaje_error text,
    fecha_inicio timestamp with time zone DEFAULT now() NOT NULL,
    fecha_fin timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qa_importacion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.qa_importacion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_importacion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.qa_importacion_id_seq OWNED BY cysn_qa.qa_importacion.id;


--
-- Name: qa_resultado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.qa_resultado (
    id bigint NOT NULL,
    qa_ejecucion_id bigint NOT NULL,
    qa_importacion_id bigint,
    numero_fila_origen integer NOT NULL,
    sucursal_origen text,
    estado_creacion character varying(80),
    tabla_empresa character varying(120),
    codigo_barra text NOT NULL,
    referencia_creacion text,
    codigo_marca_creacion text,
    precio_detal_usd_creacion numeric(20,6),
    tasa_cambio_creacion numeric(20,6),
    status_creacion text,
    sucursal_empresa text,
    referencia_empresa text,
    codigo_marca_empresa text,
    precio_detal_empresa numeric(20,6),
    precio_detal_usd_empresa numeric(20,6),
    tasa_cambio_empresa numeric(20,6),
    precio_detal_usd_calculado_empresa numeric(20,6),
    status_empresa text,
    existencia_empresa numeric(20,4),
    categoria_creacion text,
    categoria_empresa text,
    precio_promocion_creacion numeric(20,6),
    precio_promocion_empresa numeric(20,6),
    estado_comparacion cysn_qa.qa_estado_comparacion NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    costo_inicial_creacion numeric(20,6),
    costo_inicial_empresa numeric(20,6),
    costo_dolar_creacion numeric(20,6),
    costo_dolar_empresa numeric(20,6)
);


--
-- Name: qa_resultado_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.qa_resultado_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_resultado_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.qa_resultado_id_seq OWNED BY cysn_qa.qa_resultado.id;


--
-- Name: qa_tipo_diferencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.qa_tipo_diferencia (
    id smallint NOT NULL,
    codigo character varying(80) NOT NULL,
    nombre character varying(160) NOT NULL,
    orden_visual integer DEFAULT 100 NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: qa_tipo_diferencia_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.qa_tipo_diferencia_id_seq
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: qa_tipo_diferencia_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.qa_tipo_diferencia_id_seq OWNED BY cysn_qa.qa_tipo_diferencia.id;


--
-- Name: rol; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.rol (
    id bigint NOT NULL,
    nombre character varying(80) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rol_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.rol_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rol_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.rol_id_seq OWNED BY cysn_qa.rol.id;


--
-- Name: sincronizacion_ejecucion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.sincronizacion_ejecucion (
    id bigint NOT NULL,
    proceso character varying(50) NOT NULL,
    modo character varying(20) NOT NULL,
    estado character varying(20) NOT NULL,
    iniciado_en timestamp with time zone DEFAULT now() NOT NULL,
    finalizado_en timestamp with time zone,
    duracion_ms integer,
    total_origen integer,
    total_validos integer,
    descartados integer,
    duplicados_origen integer,
    insertados integer,
    actualizados integer,
    sin_cambios integer,
    inactivados integer,
    intentos integer,
    error text,
    detalle jsonb,
    host character varying(255),
    CONSTRAINT sincronizacion_ejecucion_estado_check CHECK (((estado)::text = ANY ((ARRAY['EN_CURSO'::character varying, 'EXITOSA'::character varying, 'FALLIDA'::character varying, 'ABORTADA'::character varying])::text[]))),
    CONSTRAINT sincronizacion_ejecucion_modo_check CHECK (((modo)::text = ANY ((ARRAY['REAL'::character varying, 'DRY_RUN'::character varying])::text[])))
);


--
-- Name: sincronizacion_ejecucion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.sincronizacion_ejecucion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sincronizacion_ejecucion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.sincronizacion_ejecucion_id_seq OWNED BY cysn_qa.sincronizacion_ejecucion.id;


--
-- Name: sincronizacion_estado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.sincronizacion_estado (
    proceso character varying(50) NOT NULL,
    ultima_ejecucion_id bigint,
    ultimo_estado character varying(20),
    ultimo_modo character varying(20),
    ultima_ejecucion_en timestamp with time zone,
    ultimo_exito_en timestamp with time zone,
    ultimo_exito_ejecucion_id bigint,
    ultimo_error text,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sucursal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.sucursal (
    id bigint NOT NULL,
    empresa_id bigint NOT NULL,
    codigo character varying(50),
    nombre character varying(180) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    identificador_inventario character varying(255)
);


--
-- Name: sucursal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.sucursal_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sucursal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.sucursal_id_seq OWNED BY cysn_qa.sucursal.id;


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa."user" (
    id bigint NOT NULL,
    rol_id bigint NOT NULL,
    username character varying(100) NOT NULL,
    nombre character varying(180) NOT NULL,
    email character varying(180),
    password_hash text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    ultimo_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE cysn_qa.user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE cysn_qa.user_id_seq OWNED BY cysn_qa."user".id;


--
-- Name: user_sucursal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE cysn_qa.user_sucursal (
    user_id bigint NOT NULL,
    sucursal_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: creacion registro_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion ALTER COLUMN registro_id SET DEFAULT nextval('cysn_qa.creacion_registro_id_seq'::regclass);


--
-- Name: creacion_snapshot id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion_snapshot ALTER COLUMN id SET DEFAULT nextval('cysn_qa.creacion_snapshot_id_seq'::regclass);


--
-- Name: creacion_snapshot_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion_snapshot_detalle ALTER COLUMN id SET DEFAULT nextval('cysn_qa.creacion_snapshot_detalle_id_seq'::regclass);


--
-- Name: empresa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.empresa ALTER COLUMN id SET DEFAULT nextval('cysn_qa.empresa_id_seq'::regclass);


--
-- Name: inventario_carga id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.inventario_carga ALTER COLUMN id SET DEFAULT nextval('cysn_qa.inventario_carga_id_seq'::regclass);


--
-- Name: inventario_detalle id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.inventario_detalle ALTER COLUMN id SET DEFAULT nextval('cysn_qa.inventario_detalle_id_seq'::regclass);


--
-- Name: qa_ciclo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ciclo ALTER COLUMN id SET DEFAULT nextval('cysn_qa.qa_ciclo_id_seq'::regclass);


--
-- Name: qa_ciclo_sucursal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ciclo_sucursal ALTER COLUMN id SET DEFAULT nextval('cysn_qa.qa_ciclo_sucursal_id_seq'::regclass);


--
-- Name: qa_correccion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_correccion ALTER COLUMN id SET DEFAULT nextval('cysn_qa.qa_correccion_id_seq'::regclass);


--
-- Name: qa_diferencia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_diferencia ALTER COLUMN id SET DEFAULT nextval('cysn_qa.qa_diferencia_id_seq'::regclass);


--
-- Name: qa_ejecucion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ejecucion ALTER COLUMN id SET DEFAULT nextval('cysn_qa.qa_ejecucion_id_seq'::regclass);


--
-- Name: qa_importacion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_importacion ALTER COLUMN id SET DEFAULT nextval('cysn_qa.qa_importacion_id_seq'::regclass);


--
-- Name: qa_resultado id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_resultado ALTER COLUMN id SET DEFAULT nextval('cysn_qa.qa_resultado_id_seq'::regclass);


--
-- Name: qa_tipo_diferencia id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_tipo_diferencia ALTER COLUMN id SET DEFAULT nextval('cysn_qa.qa_tipo_diferencia_id_seq'::regclass);


--
-- Name: rol id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.rol ALTER COLUMN id SET DEFAULT nextval('cysn_qa.rol_id_seq'::regclass);


--
-- Name: sincronizacion_ejecucion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.sincronizacion_ejecucion ALTER COLUMN id SET DEFAULT nextval('cysn_qa.sincronizacion_ejecucion_id_seq'::regclass);


--
-- Name: sucursal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.sucursal ALTER COLUMN id SET DEFAULT nextval('cysn_qa.sucursal_id_seq'::regclass);


--
-- Name: user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa."user" ALTER COLUMN id SET DEFAULT nextval('cysn_qa.user_id_seq'::regclass);


--
-- Name: creacion creacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion
    ADD CONSTRAINT creacion_pkey PRIMARY KEY (registro_id);


--
-- Name: creacion_snapshot_detalle creacion_snapshot_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion_snapshot_detalle
    ADD CONSTRAINT creacion_snapshot_detalle_pkey PRIMARY KEY (id);


--
-- Name: creacion_snapshot creacion_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion_snapshot
    ADD CONSTRAINT creacion_snapshot_pkey PRIMARY KEY (id);


--
-- Name: empresa empresa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.empresa
    ADD CONSTRAINT empresa_pkey PRIMARY KEY (id);


--
-- Name: inventario_carga inventario_carga_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.inventario_carga
    ADD CONSTRAINT inventario_carga_pkey PRIMARY KEY (id);


--
-- Name: inventario_detalle inventario_detalle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.inventario_detalle
    ADD CONSTRAINT inventario_detalle_pkey PRIMARY KEY (id);


--
-- Name: user_sucursal pk_user_sucursal; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.user_sucursal
    ADD CONSTRAINT pk_user_sucursal PRIMARY KEY (user_id, sucursal_id);


--
-- Name: qa_ciclo qa_ciclo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ciclo
    ADD CONSTRAINT qa_ciclo_pkey PRIMARY KEY (id);


--
-- Name: qa_ciclo_sucursal qa_ciclo_sucursal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ciclo_sucursal
    ADD CONSTRAINT qa_ciclo_sucursal_pkey PRIMARY KEY (id);


--
-- Name: qa_correccion qa_correccion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_correccion
    ADD CONSTRAINT qa_correccion_pkey PRIMARY KEY (id);


--
-- Name: qa_diferencia qa_diferencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_diferencia
    ADD CONSTRAINT qa_diferencia_pkey PRIMARY KEY (id);


--
-- Name: qa_ejecucion qa_ejecucion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ejecucion
    ADD CONSTRAINT qa_ejecucion_pkey PRIMARY KEY (id);


--
-- Name: qa_importacion qa_importacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_importacion
    ADD CONSTRAINT qa_importacion_pkey PRIMARY KEY (id);


--
-- Name: qa_resultado qa_resultado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_resultado
    ADD CONSTRAINT qa_resultado_pkey PRIMARY KEY (id);


--
-- Name: qa_tipo_diferencia qa_tipo_diferencia_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_tipo_diferencia
    ADD CONSTRAINT qa_tipo_diferencia_codigo_key UNIQUE (codigo);


--
-- Name: qa_tipo_diferencia qa_tipo_diferencia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_tipo_diferencia
    ADD CONSTRAINT qa_tipo_diferencia_pkey PRIMARY KEY (id);


--
-- Name: rol rol_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.rol
    ADD CONSTRAINT rol_pkey PRIMARY KEY (id);


--
-- Name: sincronizacion_ejecucion sincronizacion_ejecucion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.sincronizacion_ejecucion
    ADD CONSTRAINT sincronizacion_ejecucion_pkey PRIMARY KEY (id);


--
-- Name: sincronizacion_estado sincronizacion_estado_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.sincronizacion_estado
    ADD CONSTRAINT sincronizacion_estado_pkey PRIMARY KEY (proceso);


--
-- Name: sucursal sucursal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.sucursal
    ADD CONSTRAINT sucursal_pkey PRIMARY KEY (id);


--
-- Name: creacion_snapshot uq_creacion_snapshot_ciclo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion_snapshot
    ADD CONSTRAINT uq_creacion_snapshot_ciclo UNIQUE (qa_ciclo_id);


--
-- Name: empresa uq_empresa_codigo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.empresa
    ADD CONSTRAINT uq_empresa_codigo UNIQUE (codigo);


--
-- Name: empresa uq_empresa_nombre; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.empresa
    ADD CONSTRAINT uq_empresa_nombre UNIQUE (nombre);


--
-- Name: inventario_carga uq_inventario_carga_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.inventario_carga
    ADD CONSTRAINT uq_inventario_carga_version UNIQUE (qa_ciclo_sucursal_id, version);


--
-- Name: qa_ciclo_sucursal uq_qa_ciclo_sucursal; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ciclo_sucursal
    ADD CONSTRAINT uq_qa_ciclo_sucursal UNIQUE (qa_ciclo_id, sucursal_id);


--
-- Name: qa_resultado uq_resultado_importacion_fila; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_resultado
    ADD CONSTRAINT uq_resultado_importacion_fila UNIQUE (qa_importacion_id, numero_fila_origen);


--
-- Name: qa_diferencia uq_resultado_tipo_diferencia; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_diferencia
    ADD CONSTRAINT uq_resultado_tipo_diferencia UNIQUE (qa_resultado_id, tipo_diferencia_id);


--
-- Name: rol uq_rol_nombre; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.rol
    ADD CONSTRAINT uq_rol_nombre UNIQUE (nombre);


--
-- Name: sucursal uq_sucursal_empresa_codigo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.sucursal
    ADD CONSTRAINT uq_sucursal_empresa_codigo UNIQUE (empresa_id, codigo);


--
-- Name: sucursal uq_sucursal_empresa_nombre; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.sucursal
    ADD CONSTRAINT uq_sucursal_empresa_nombre UNIQUE (empresa_id, nombre);


--
-- Name: user uq_user_email; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa."user"
    ADD CONSTRAINT uq_user_email UNIQUE (email);


--
-- Name: user uq_user_username; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa."user"
    ADD CONSTRAINT uq_user_username UNIQUE (username);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: idx_creacion_codigo_barra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creacion_codigo_barra ON cysn_qa.creacion USING btree (codigo_barra);


--
-- Name: idx_creacion_codigo_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creacion_codigo_categoria ON cysn_qa.creacion USING btree (codigo_categoria);


--
-- Name: idx_creacion_codigo_marca; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creacion_codigo_marca ON cysn_qa.creacion USING btree (codigo_marca_origen);


--
-- Name: idx_creacion_referencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creacion_referencia ON cysn_qa.creacion USING btree (referencia);


--
-- Name: idx_creacion_snapshot_detalle_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creacion_snapshot_detalle_codigo ON cysn_qa.creacion_snapshot_detalle USING btree (codigo_barra);


--
-- Name: idx_creacion_snapshot_detalle_referencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creacion_snapshot_detalle_referencia ON cysn_qa.creacion_snapshot_detalle USING btree (referencia);


--
-- Name: idx_creacion_snapshot_detalle_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creacion_snapshot_detalle_snapshot ON cysn_qa.creacion_snapshot_detalle USING btree (creacion_snapshot_id);


--
-- Name: idx_creacion_snapshot_detalle_snapshot_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creacion_snapshot_detalle_snapshot_codigo ON cysn_qa.creacion_snapshot_detalle USING btree (creacion_snapshot_id, codigo_barra);


--
-- Name: idx_creacion_snapshot_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creacion_snapshot_estado ON cysn_qa.creacion_snapshot USING btree (estado);


--
-- Name: idx_inventario_carga_ciclo_sucursal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_carga_ciclo_sucursal ON cysn_qa.inventario_carga USING btree (qa_ciclo_sucursal_id);


--
-- Name: idx_inventario_carga_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_carga_estado ON cysn_qa.inventario_carga USING btree (estado);


--
-- Name: idx_inventario_carga_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_carga_user ON cysn_qa.inventario_carga USING btree (cargado_por_user_id);


--
-- Name: idx_inventario_detalle_carga; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_detalle_carga ON cysn_qa.inventario_detalle USING btree (inventario_carga_id);


--
-- Name: idx_inventario_detalle_carga_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_detalle_carga_codigo ON cysn_qa.inventario_detalle USING btree (inventario_carga_id, codigo_barra);


--
-- Name: idx_inventario_detalle_codigo_barra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_detalle_codigo_barra ON cysn_qa.inventario_detalle USING btree (codigo_barra);


--
-- Name: idx_inventario_detalle_referencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_detalle_referencia ON cysn_qa.inventario_detalle USING btree (referencia);


--
-- Name: idx_qa_ciclo_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_ciclo_estado ON cysn_qa.qa_ciclo USING btree (estado);


--
-- Name: idx_qa_ciclo_sucursal_ciclo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_ciclo_sucursal_ciclo ON cysn_qa.qa_ciclo_sucursal USING btree (qa_ciclo_id);


--
-- Name: idx_qa_ciclo_sucursal_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_ciclo_sucursal_estado ON cysn_qa.qa_ciclo_sucursal USING btree (qa_ciclo_id, estado_recepcion);


--
-- Name: idx_qa_ciclo_sucursal_sucursal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_ciclo_sucursal_sucursal ON cysn_qa.qa_ciclo_sucursal USING btree (sucursal_id);


--
-- Name: idx_qa_correccion_diferencia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_correccion_diferencia ON cysn_qa.qa_correccion USING btree (qa_diferencia_id, created_at);


--
-- Name: idx_qa_diferencia_resultado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_diferencia_resultado ON cysn_qa.qa_diferencia USING btree (qa_resultado_id);


--
-- Name: idx_qa_diferencia_tipo_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_diferencia_tipo_estado ON cysn_qa.qa_diferencia USING btree (tipo_diferencia_id, estado_correccion);


--
-- Name: idx_qa_ejecucion_ciclo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_ejecucion_ciclo ON cysn_qa.qa_ejecucion USING btree (qa_ciclo_id);


--
-- Name: idx_qa_resultado_codigo_barra; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_resultado_codigo_barra ON cysn_qa.qa_resultado USING btree (qa_ejecucion_id, codigo_barra);


--
-- Name: idx_qa_resultado_ejecucion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_resultado_ejecucion ON cysn_qa.qa_resultado USING btree (qa_ejecucion_id);


--
-- Name: idx_qa_resultado_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_resultado_empresa ON cysn_qa.qa_resultado USING btree (qa_ejecucion_id, tabla_empresa);


--
-- Name: idx_qa_resultado_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_resultado_estado ON cysn_qa.qa_resultado USING btree (qa_ejecucion_id, estado_comparacion);


--
-- Name: idx_qa_resultado_sucursal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qa_resultado_sucursal ON cysn_qa.qa_resultado USING btree (qa_ejecucion_id, sucursal_empresa);


--
-- Name: idx_sucursal_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sucursal_empresa ON cysn_qa.sucursal USING btree (empresa_id);


--
-- Name: idx_user_rol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_rol ON cysn_qa."user" USING btree (rol_id);


--
-- Name: idx_user_sucursal_sucursal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sucursal_sucursal ON cysn_qa.user_sucursal USING btree (sucursal_id);


--
-- Name: ix_creacion_codigo_barra_vigente_reg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_creacion_codigo_barra_vigente_reg ON cysn_qa.creacion USING btree (codigo_barra, registro_id DESC) WHERE vigente;


--
-- Name: ix_sincronizacion_ejecucion_proceso_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sincronizacion_ejecucion_proceso_id ON cysn_qa.sincronizacion_ejecucion USING btree (proceso, id DESC);


--
-- Name: uq_inventario_carga_actual; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_inventario_carga_actual ON cysn_qa.inventario_carga USING btree (qa_ciclo_sucursal_id) WHERE (es_actual = true);


--
-- Name: uq_inventario_carga_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_inventario_carga_hash ON cysn_qa.inventario_carga USING btree (qa_ciclo_sucursal_id, archivo_sha256);


--
-- Name: uq_sucursal_identificador_inventario; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_sucursal_identificador_inventario ON cysn_qa.sucursal USING btree (identificador_inventario) WHERE (identificador_inventario IS NOT NULL);


--
-- Name: creacion_snapshot fk_creacion_snapshot_ciclo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion_snapshot
    ADD CONSTRAINT fk_creacion_snapshot_ciclo FOREIGN KEY (qa_ciclo_id) REFERENCES cysn_qa.qa_ciclo(id) ON DELETE CASCADE;


--
-- Name: creacion_snapshot_detalle fk_creacion_snapshot_detalle_snapshot; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion_snapshot_detalle
    ADD CONSTRAINT fk_creacion_snapshot_detalle_snapshot FOREIGN KEY (creacion_snapshot_id) REFERENCES cysn_qa.creacion_snapshot(id) ON DELETE CASCADE;


--
-- Name: creacion_snapshot fk_creacion_snapshot_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.creacion_snapshot
    ADD CONSTRAINT fk_creacion_snapshot_user FOREIGN KEY (creado_por_user_id) REFERENCES cysn_qa."user"(id) ON DELETE SET NULL;


--
-- Name: inventario_carga fk_inventario_carga_ciclo_sucursal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.inventario_carga
    ADD CONSTRAINT fk_inventario_carga_ciclo_sucursal FOREIGN KEY (qa_ciclo_sucursal_id) REFERENCES cysn_qa.qa_ciclo_sucursal(id) ON DELETE CASCADE;


--
-- Name: inventario_carga fk_inventario_carga_reemplaza; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.inventario_carga
    ADD CONSTRAINT fk_inventario_carga_reemplaza FOREIGN KEY (reemplaza_carga_id) REFERENCES cysn_qa.inventario_carga(id) ON DELETE SET NULL;


--
-- Name: inventario_carga fk_inventario_carga_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.inventario_carga
    ADD CONSTRAINT fk_inventario_carga_user FOREIGN KEY (cargado_por_user_id) REFERENCES cysn_qa."user"(id) ON DELETE RESTRICT;


--
-- Name: inventario_detalle fk_inventario_detalle_carga; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.inventario_detalle
    ADD CONSTRAINT fk_inventario_detalle_carga FOREIGN KEY (inventario_carga_id) REFERENCES cysn_qa.inventario_carga(id) ON DELETE CASCADE;


--
-- Name: qa_ciclo fk_qa_ciclo_creado_por; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ciclo
    ADD CONSTRAINT fk_qa_ciclo_creado_por FOREIGN KEY (creado_por_user_id) REFERENCES cysn_qa."user"(id) ON DELETE SET NULL;


--
-- Name: qa_ciclo_sucursal fk_qa_ciclo_sucursal_ciclo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ciclo_sucursal
    ADD CONSTRAINT fk_qa_ciclo_sucursal_ciclo FOREIGN KEY (qa_ciclo_id) REFERENCES cysn_qa.qa_ciclo(id) ON DELETE CASCADE;


--
-- Name: qa_ciclo_sucursal fk_qa_ciclo_sucursal_sucursal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ciclo_sucursal
    ADD CONSTRAINT fk_qa_ciclo_sucursal_sucursal FOREIGN KEY (sucursal_id) REFERENCES cysn_qa.sucursal(id) ON DELETE RESTRICT;


--
-- Name: qa_correccion fk_qa_correccion_diferencia; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_correccion
    ADD CONSTRAINT fk_qa_correccion_diferencia FOREIGN KEY (qa_diferencia_id) REFERENCES cysn_qa.qa_diferencia(id) ON DELETE CASCADE;


--
-- Name: qa_ejecucion fk_qa_ejecucion_ciclo; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_ejecucion
    ADD CONSTRAINT fk_qa_ejecucion_ciclo FOREIGN KEY (qa_ciclo_id) REFERENCES cysn_qa.qa_ciclo(id) ON DELETE RESTRICT;


--
-- Name: sucursal fk_sucursal_empresa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.sucursal
    ADD CONSTRAINT fk_sucursal_empresa FOREIGN KEY (empresa_id) REFERENCES cysn_qa.empresa(id) ON DELETE RESTRICT;


--
-- Name: user fk_user_rol; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa."user"
    ADD CONSTRAINT fk_user_rol FOREIGN KEY (rol_id) REFERENCES cysn_qa.rol(id) ON DELETE RESTRICT;


--
-- Name: user_sucursal fk_user_sucursal_sucursal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.user_sucursal
    ADD CONSTRAINT fk_user_sucursal_sucursal FOREIGN KEY (sucursal_id) REFERENCES cysn_qa.sucursal(id) ON DELETE CASCADE;


--
-- Name: user_sucursal fk_user_sucursal_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.user_sucursal
    ADD CONSTRAINT fk_user_sucursal_user FOREIGN KEY (user_id) REFERENCES cysn_qa."user"(id) ON DELETE CASCADE;


--
-- Name: qa_diferencia qa_diferencia_qa_resultado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_diferencia
    ADD CONSTRAINT qa_diferencia_qa_resultado_id_fkey FOREIGN KEY (qa_resultado_id) REFERENCES cysn_qa.qa_resultado(id) ON DELETE CASCADE;


--
-- Name: qa_diferencia qa_diferencia_tipo_diferencia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_diferencia
    ADD CONSTRAINT qa_diferencia_tipo_diferencia_id_fkey FOREIGN KEY (tipo_diferencia_id) REFERENCES cysn_qa.qa_tipo_diferencia(id);


--
-- Name: qa_importacion qa_importacion_qa_ejecucion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_importacion
    ADD CONSTRAINT qa_importacion_qa_ejecucion_id_fkey FOREIGN KEY (qa_ejecucion_id) REFERENCES cysn_qa.qa_ejecucion(id) ON DELETE CASCADE;


--
-- Name: qa_resultado qa_resultado_qa_ejecucion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_resultado
    ADD CONSTRAINT qa_resultado_qa_ejecucion_id_fkey FOREIGN KEY (qa_ejecucion_id) REFERENCES cysn_qa.qa_ejecucion(id) ON DELETE CASCADE;


--
-- Name: qa_resultado qa_resultado_qa_importacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY cysn_qa.qa_resultado
    ADD CONSTRAINT qa_resultado_qa_importacion_id_fkey FOREIGN KEY (qa_importacion_id) REFERENCES cysn_qa.qa_importacion(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


