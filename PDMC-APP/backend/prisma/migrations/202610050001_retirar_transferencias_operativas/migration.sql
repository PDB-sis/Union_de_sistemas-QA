-- La operación directa no llegó a producción y sus tablas están vacías.
-- Se conserva TransferenciaConsulta, que alimenta los pendientes y reportes de tienda.
DROP TABLE IF EXISTS "TransferenciaOperativaItem";
DROP TABLE IF EXISTS "TransferenciaOperativa";
DROP TYPE IF EXISTS "EstadoTransferenciaOperativa";
