export interface CicloAdminInventario {
  id: number;
  nombre: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: string;
  creado_por_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SucursalCicloAdminInventario {
  id: number;
  qa_ciclo_id: number;
  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;
  identificador_inventario: string | null;
  estado_recepcion: string;
  recibido_at: string | null;
  validado_at: string | null;
  observacion: string | null;
}
