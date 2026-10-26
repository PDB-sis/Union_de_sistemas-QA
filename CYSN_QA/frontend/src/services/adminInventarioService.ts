import {
  apiRequest,
  obtenerMensajeError,
} from "./apiClient";

export interface AdminCicloQa {
  id: number;
  nombre: string;
  descripcion?: string | null;
  fecha_inicio: string;
  fecha_fin?: string | null;
  estado: string;
  creado_por_user_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdminSucursalCatalogo {
  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;
  identificador_inventario?: string | null;
  sucursal_activa: boolean;
  empresa_activa: boolean;
}

export interface InventarioValidacionResultado {
  validado: boolean;
  qa_ciclo_id: number;
  ciclo: string;
  sucursal_id: number;
  sucursal: string;
  empresa_id: number;
  empresa: string;
  estado_recepcion: string;
  total_registros: number;
  [key: string]: unknown;
}

export interface InventarioRegistroResultado {
  registrado: boolean;
  carga_id: number;
  qa_ciclo_id: number;
  sucursal_id: number;
  version: number;
  estado: string;
  total_registros: number;
  [key: string]: unknown;
}

export interface InventarioProcesamientoResultado {
  procesado: boolean;
  carga_id: number;
  qa_ciclo_id: number;
  sucursal_id: number;
  version: number;
  estado: string;
  estado_recepcion: string;
  total_registros: number;
  registros_validos: number;
  registros_invalidos: number;
  detalles_insertados: number;
  [key: string]: unknown;
}


export type EstadoComparacionInventario =
  | "IGUAL"
  | "DIFERENCIA"
  | "NO_EN_CREACION";

export type ValorComparacion = string | number | null;

export interface ComparacionInventarioFila {
  inventario_detalle_id: number;
  codigo_barra: string;

  registro_id_creacion: number | null;
  codigo_barra_creacion: string | null;

  referencia_inventario: ValorComparacion;
  referencia_creacion: ValorComparacion;

  precio_detal_inventario: ValorComparacion;
  precio_detal_creacion: ValorComparacion;

  tasa_cambio_inventario: ValorComparacion;
  tasa_cambio_creacion: ValorComparacion;

  codigo_marca_inventario: ValorComparacion;
  codigo_marca_creacion: ValorComparacion;

  codigo_categoria_inventario: ValorComparacion;
  codigo_categoria_creacion: ValorComparacion;

  precio_promocion_inventario: ValorComparacion;
  precio_promocion_creacion: ValorComparacion;

  costo_inicial_inventario: ValorComparacion;
  costo_inicial_creacion: ValorComparacion;

  costo_dolar_inventario: ValorComparacion;
  costo_dolar_creacion: ValorComparacion;

  diferencia_referencia: boolean;
  diferencia_precio_detal: boolean;
  diferencia_tasa_cambio: boolean;
  diferencia_codigo_marca: boolean;
  diferencia_codigo_categoria: boolean;
  diferencia_precio_promocion: boolean;
  diferencia_costo_inicial: boolean;
  diferencia_costo_dolar: boolean;

  estado_comparacion: EstadoComparacionInventario;
}

export interface ComparacionInventarioRespuesta {
  ciclo_id: number;
  ciclo: string;

  empresa_id: number;
  empresa: string;

  sucursal_id: number;
  sucursal: string;

  carga: {
    id: number;
    version: number;
    estado: string;
    archivo_nombre?: string | null;
    total_registros: number;
    registros_validos: number;
    registros_invalidos: number;
    recibido_at?: string | null;
    procesado_at?: string | null;
  };

  resumen: {
    total_inventario: number;
    encontrados_creacion: number;
    no_en_creacion: number;
    iguales: number;
    diferencias: number;
  };

  filtros: {
    buscar?: string | null;
    estado?: string | null;
  };

  pagina: number;
  tamano_pagina: number;
  total_registros: number;
  total_paginas: number;
  resultados: ComparacionInventarioFila[];
}

export interface ComparacionInventarioParametros {
  pagina?: number;
  tamanoPagina?: number;
  buscar?: string;
  estado?: EstadoComparacionInventario | "";
}

async function apiJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await apiRequest(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(
      await obtenerMensajeError(
        response,
        `No se pudo completar la operación. Error HTTP ${response.status}.`,
      ),
    );
  }

  return (await response.json()) as T;
}

export async function listarCiclosAdmin(): Promise<AdminCicloQa[]> {
  return apiJson<AdminCicloQa[]>("/api/admin/ciclos");
}

export async function listarSucursalesAdmin(): Promise<AdminSucursalCatalogo[]> {
  return apiJson<AdminSucursalCatalogo[]>("/api/admin/sucursales");
}

export async function activarRecepcionSimple(
  cicloId: number,
): Promise<AdminCicloQa> {
  return apiJson<AdminCicloQa>(
    `/api/admin/ciclos/${cicloId}/activar-recepcion`,
    { method: "POST" },
  );
}

export async function desactivarRecepcionSimple(
  cicloId: number,
): Promise<AdminCicloQa> {
  return apiJson<AdminCicloQa>(
    `/api/admin/ciclos/${cicloId}/desactivar-recepcion`,
    { method: "POST" },
  );
}

export async function asegurarSucursalEnCiclo(
  cicloId: number,
  sucursalId: number,
): Promise<void> {
  await apiJson(
    `/api/admin/ciclos/${cicloId}/sucursales`,
    {
      method: "POST",
      body: JSON.stringify({ sucursal_ids: [sucursalId] }),
    },
  );
}

function formDataArchivo(archivo: File): FormData {
  const form = new FormData();
  form.append("archivo", archivo);
  return form;
}

export async function validarInventarioAdmin(
  cicloId: number,
  sucursalId: number,
  archivo: File,
): Promise<InventarioValidacionResultado> {
  return apiJson<InventarioValidacionResultado>(
    `/api/ciclos/${cicloId}/sucursales/${sucursalId}/inventarios/validar`,
    {
      method: "POST",
      body: formDataArchivo(archivo),
    },
  );
}

export async function registrarInventarioAdmin(
  cicloId: number,
  sucursalId: number,
  archivo: File,
): Promise<InventarioRegistroResultado> {
  return apiJson<InventarioRegistroResultado>(
    `/api/ciclos/${cicloId}/sucursales/${sucursalId}/inventarios/registrar`,
    {
      method: "POST",
      body: formDataArchivo(archivo),
    },
  );
}

export async function procesarInventarioAdmin(
  cicloId: number,
  sucursalId: number,
  cargaId: number,
  archivo: File,
): Promise<InventarioProcesamientoResultado> {
  return apiJson<InventarioProcesamientoResultado>(
    `/api/ciclos/${cicloId}/sucursales/${sucursalId}/inventarios/${cargaId}/procesar`,
    {
      method: "POST",
      body: formDataArchivo(archivo),
    },
  );
}

export async function obtenerComparacionInventarioAdmin(
  cicloId: number,
  sucursalId: number,
  parametros: ComparacionInventarioParametros = {},
): Promise<ComparacionInventarioRespuesta> {
  const query = new URLSearchParams();

  query.set("ciclo_id", String(cicloId));
  query.set("sucursal_id", String(sucursalId));
  query.set("pagina", String(parametros.pagina ?? 1));
  query.set(
    "tamano_pagina",
    String(parametros.tamanoPagina ?? 50),
  );

  if (parametros.buscar?.trim()) {
    query.set(
      "buscar",
      parametros.buscar.trim(),
    );
  }

  if (parametros.estado) {
    query.set(
      "estado",
      parametros.estado,
    );
  }

  return apiJson<ComparacionInventarioRespuesta>(
    `/api/admin/inventarios/comparacion?${query.toString()}`,
  );
}

export interface EjecucionQaCicloResultado {
  ejecucion_id: number;
  qa_ciclo_id: number;
  estado: string;
  nombre: string;
  sucursales_procesadas: number;
  total_resultados: number;
  total_diferencias: number;
  estados: Record<string, number>;
  diferencias_por_tipo: Record<string, number>;
}

export async function ejecutarQaCicloAdmin(
  cicloId: number,
): Promise<EjecucionQaCicloResultado> {
  return apiJson<EjecucionQaCicloResultado>(
    `/api/admin/ciclos/${cicloId}/ejecutar-qa`,
    {
      method: "POST",
    },
  );
}
