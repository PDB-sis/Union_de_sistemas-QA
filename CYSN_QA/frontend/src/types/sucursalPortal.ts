export interface SucursalRecepcionPortal {
  qa_ciclo_id: number;
  ciclo: string;
  estado_ciclo: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;

  qa_ciclo_sucursal_id: number;

  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;
  identificador_inventario: string | null;

  estado_recepcion: string;
  recibido_at: string | null;
  validado_at: string | null;
  observacion: string | null;

  carga_id: number | null;
  carga_version: number | null;
  estado_carga: string | null;
  archivo_nombre: string | null;
  total_registros: number | null;
  registros_validos: number | null;
  registros_invalidos: number | null;
  carga_recibido_at: string | null;
  carga_procesado_at: string | null;

  puede_cargar_inventario: boolean;
}

export interface InventarioCSVValidacionResponse {
  validado: boolean;
  qa_ciclo_id: number;
  ciclo: string;
  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;
  estado_recepcion: string;

  archivo_nombre: string;
  archivo_tamano_bytes: number;
  archivo_sha256: string;
  encoding: string;
  delimitador: string;

  total_registros: number;
  columnas_detectadas: string[];

  sucursal_archivo: string;
  sucursal_normalizada: string;
  identificador_esperado: string;
  identificador_esperado_normalizado: string;
}

export interface InventarioCargaRegistroResponse {
  registrado: boolean;
  carga_id: number;

  qa_ciclo_id: number;
  ciclo: string;
  qa_ciclo_sucursal_id: number;

  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;

  cargado_por_user_id: number;
  cargado_por_username: string;

  version: number;
  es_actual: boolean;
  reemplaza_carga_id: number | null;

  estado: string;
  estado_recepcion: string;

  archivo_nombre: string;
  archivo_tamano_bytes: number;
  archivo_sha256: string;

  total_registros: number;
  registros_validos: number;
  registros_invalidos: number;

  recibido_at: string;
}

export interface InventarioProcesamientoResponse {
  procesado: boolean;
  carga_id: number;

  qa_ciclo_id: number;
  ciclo: string;
  qa_ciclo_sucursal_id: number;

  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;

  version: number;
  es_actual: boolean;
  estado: string;
  estado_recepcion: string;

  total_registros: number;
  registros_validos: number;
  registros_invalidos: number;
  detalles_insertados: number;

  archivo_nombre: string;
  archivo_sha256: string;
  procesado_at: string;
}
