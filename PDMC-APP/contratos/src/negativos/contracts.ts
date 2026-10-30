// Contrato HTTP de negativos: forma exacta de las respuestas JSON que el backend entrega al frontend.
// Es explícito (no se deduce del código del servidor) para que front y back sean independientes.
// El backend verifica en compilación que sus respuestas cumplen este contrato
// (backend/src/negativos/contracts.check.ts): si cambia una respuesta, hay que actualizarlo aquí.
import type { Estado } from "./model";
import type { VerificacionNegativo } from "./flujo";

/** Convierte un tipo del servidor en su forma JSON: fechas y decimales viajan como texto. */
export type Jsonified<T> = T extends Date | { toFixed(digits?: number): string; isNegative(): boolean } ? string :
  T extends (infer U)[] ? Jsonified<U>[] :
  T extends object ? { [K in keyof T]: Jsonified<T[K]> } : T;

export type ApiEnvelope<T> = { ok: true; data: T } | {
  ok: false; error: { code: string; message: string; details?: unknown };
};

/** Fechas ISO y decimales ("12.5000") llegan como texto. */
type Fecha = string;
type Decimal = string;

export type ProductoNegativo = {
  id: string; codigoBarra: string; referencia: string | null; descripcion: string | null; marca: string | null;
  codigoMarca: string | null; talla: string | null; categoria: string | null; linea: string | null;
  activo: boolean; createdAt: Fecha; updatedAt: Fecha;
};

export type Negativo = {
  id: string; productoId: string; bodegaId: string; responsableId: string | null; estado: Estado;
  conteoFisico: Decimal | null; existenciaSistemaConteo: Decimal | null; conteoRegistradoAt: Fecha | null;
  motivo: string | null; documentoRelacionado: string | null; veredicto: string | null; numeroAjuste: string | null;
  observaciones: string | null; bodegaProductoId: string | null; fusionadoEnId: string | null;
  primeraDeteccion: Fecha; ultimaDeteccion: Fecha; anuladoAt: Fecha | null; motivoAnulacion: string | null;
  version: number; createdAt: Fecha; updatedAt: Fecha;
};

export type ComparacionFoto = { estado: string; anterior: Decimal | null; actual: Decimal | null; variacionUnidades: Decimal | null };

export type NegativeItem = Negativo & {
  producto: ProductoNegativo;
  bodegaProducto: { id: string; nombre: string } | null;
  inconsistenciasActivas: number;
  verificacion: VerificacionNegativo | null;
  /** "conteo", "gestion", "aprobados" o "listos". */
  workflow: string;
  existenciaActual: Decimal | null;
  existenciaAnterior: Decimal | null;
  comparacionFoto: ComparacionFoto;
};

export type ConsultaInventario = {
  id: string; usuarioId: string; nombreArchivo: string; fechaConsulta: Fecha; fechaImportacion: Fecha; hashArchivo: string; totalFilas: number;
};

export type NegativeListing = {
  total: number; skip: number; take: number;
  /** "conteo", "gestion", "mixto", "aprobados", "listos" o "desaparecidos". */
  workflow: string;
  resumen: {
    actuales: number; pendientesVerificar: number; activos: number; resueltos: number; sinConteo: number; conConteo: number;
    aprobados: number; listosCerrar: number; totalCasosActivos: number; totalUnidadesActivas: Decimal; unidades: Decimal;
    grupos: { EN_INVESTIGACION: number; AJUSTE_AUTORIZADO: number; SOLUCIONADO: number };
  };
  ultimaConsulta: ConsultaInventario | null;
  corteNegativos: { fechaCorte: Fecha; tipoCorte: string } | null;
  fotografiaAnterior: { fechaCorte: Fecha } | null;
  items: NegativeItem[];
};

export type HistorialNegativo = {
  id: string; negativoId: string; usuarioId: string | null; accion: string; motivo: string;
  valorAnterior: unknown; valorNuevo: unknown; createdAt: Fecha;
};

export type NegativeDetail = {
  workflow: "conteo" | "gestion";
  negativo: Negativo & { producto: ProductoNegativo; bodegaProducto: { id: string; nombre: string } | null; verificacion: VerificacionNegativo | null };
  inconsistencias: { id: string; transferencia: string; sucursal: string; tipoError: string; cantidadErrada: number; fecha: Fecha | null }[];
  existenciaActual: Decimal | null;
  existenciaAnterior: Decimal | null;
  observacionesConsulta: unknown[];
  historial: { items: HistorialNegativo[]; total: number; skip: number; take: number };
};
