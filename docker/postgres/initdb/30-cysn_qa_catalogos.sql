-- Catálogos de configuración que NEXO QA necesita para funcionar (no son datos de negocio).
SET search_path TO cysn_qa, public;

INSERT INTO rol (id, nombre, descripcion, activo) VALUES
  (1, 'ADMINISTRADOR', 'Acceso administrativo a la plataforma NEXO QA.', TRUE),
  (2, 'SUCURSAL', 'Usuario encargado de la carga y seguimiento de inventarios de sucursal.', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO qa_tipo_diferencia (id, codigo, nombre, orden_visual, activo) VALUES
  (1, 'PRESENCIA_EMPRESA', 'No se encontró en empresas', 10, TRUE),
  (2, 'PRESENCIA_CREACION', 'No se encontró en Creación', 20, TRUE),
  (3, 'REFERENCIA', 'Diferencia de referencia', 30, TRUE),
  (4, 'CODIGO_MARCA', 'Diferencia de código marca', 40, TRUE),
  (5, 'PRECIO_DETAL', 'Diferencia de precio detal', 50, TRUE),
  (6, 'TASA_CAMBIO', 'Diferencia de tasa de cambio', 60, TRUE),
  (7, 'CATEGORIA', 'Diferencia de categoría', 70, TRUE),
  (8, 'PRECIO_PROMOCION', 'Diferencia de precio promoción', 80, TRUE),
  (9, 'COSTO_INICIAL', 'Diferencia de costo inicial', 90, TRUE),
  (10, 'COSTO_DOLAR', 'Diferencia de costo dólar', 100, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Las secuencias siguen después de los ids fijos.
SELECT setval(pg_get_serial_sequence('cysn_qa.rol', 'id'), (SELECT max(id) FROM rol));
SELECT setval(pg_get_serial_sequence('cysn_qa.qa_tipo_diferencia', 'id'), (SELECT max(id) FROM qa_tipo_diferencia));
