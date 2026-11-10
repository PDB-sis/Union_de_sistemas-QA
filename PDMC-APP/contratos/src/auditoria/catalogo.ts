// Auditoría en lenguaje claro. Los registros se guardan con códigos estables (accion, entidad,
// origen y valores en JSON); aquí se traducen para que cualquier persona entienda qué pasó, sobre
// qué, desde dónde y qué cambió. Un código nuevo sin traducción se muestra legible igualmente.
import { estados as estadosNegativo } from "../negativos/model";
import { RESPONSABLE_LABELS } from "../inconsistencias/options";
import { roles } from "../auth/model";

export type TonoAuditoria = "acceso" | "creacion" | "cambio" | "carga" | "alerta" | "sistema";
type Accion = { texto: string; tono: TonoAuditoria };

const acciones: Record<string, Accion> = {
  LOGIN_EXITOSO: { texto: "Inició sesión", tono: "acceso" },
  LOGIN_FALLIDO: { texto: "Intento de inicio de sesión fallido", tono: "alerta" },
  LOGOUT: { texto: "Cerró sesión", tono: "acceso" },
  PASSWORD_CAMBIADO: { texto: "Cambió su contraseña", tono: "acceso" },
  PASSWORD_FALLIDO: { texto: "Intento fallido de cambio de contraseña", tono: "alerta" },
  PASSWORD_RESTABLECIDO: { texto: "Restableció la contraseña de un usuario", tono: "cambio" },
  CAMBIO_PASSWORD: { texto: "Cambio de contraseña", tono: "acceso" },
  USUARIO_CREADO: { texto: "Creó un usuario", tono: "creacion" },
  USUARIO_EDITADO: { texto: "Editó un usuario", tono: "cambio" },
  USUARIO_INICIAL_CREADO: { texto: "Creó el usuario inicial", tono: "creacion" },
  ESTADO_USUARIO_CAMBIADO: { texto: "Cambió el estado de un usuario", tono: "cambio" },
  ACCESOS_REEMPLAZADOS: { texto: "Cambió los accesos de un usuario", tono: "cambio" },
  USUARIOS_VINCULADOS: { texto: "Vinculó usuarios a una ubicación", tono: "cambio" },
  USUARIO_SINCRONIZACION_CREADO: { texto: "Creó la cuenta de sincronización", tono: "creacion" },
  USUARIO_SINCRONIZACION_ACTUALIZADO: { texto: "Actualizó la cuenta de sincronización", tono: "cambio" },
  CUENTA_SINCRONIZACION_CREADA: { texto: "Creó la cuenta de sincronización de una región", tono: "creacion" },
  RETIRAR_ALCANCE_NACIONAL: { texto: "Retiró un acceso de alcance nacional", tono: "cambio" },
  UBICACION_CREADA: { texto: "Creó una región, tienda o bodega", tono: "creacion" },
  UBICACION_EDITADA: { texto: "Editó una región, tienda o bodega", tono: "cambio" },
  UBICACION_ELIMINADA: { texto: "Eliminó una región, tienda o bodega", tono: "alerta" },
  REGION_ASIGNADA_MASIVO: { texto: "Asignó tiendas a una región", tono: "cambio" },
  SITIO_CREADO: { texto: "Registró un sitio desde SQL Server", tono: "carga" },
  SITIO_ENLAZADO: { texto: "Enlazó un sitio con SQL Server", tono: "carga" },
  SITIO_ACTUALIZADO: { texto: "Actualizó un sitio desde SQL Server", tono: "carga" },
  SITIO_DESACTIVADO: { texto: "Desactivó un sitio que ya no está en SQL Server", tono: "carga" },
  FACTURADOR_IMPORTADO: { texto: "Registró un facturador", tono: "carga" },
  FACTURADOR_ACTUALIZADO: { texto: "Actualizó un facturador", tono: "carga" },
  IMPORTAR_CONSULTA_TRANSFERENCIAS: { texto: "Actualizó las transferencias", tono: "carga" },
  IMPORTAR_CONSULTA_DEVOLUCIONES: { texto: "Actualizó las devoluciones", tono: "carga" },
  IMPORTAR_INVENTARIO: { texto: "Actualizó el inventario", tono: "carga" },
  TRANSFERENCIA_SIN_INCIDENCIAS: { texto: "Confirmó una transferencia sin incidencias", tono: "creacion" },
  TRANSFERENCIA_CON_INCIDENCIAS: { texto: "Reportó una transferencia con incidencias", tono: "alerta" },
  REPORTAR_INCONSISTENCIA_TIENDA: { texto: "Reportó una inconsistencia", tono: "alerta" },
  REPORTAR_CODIGO_NO_INVENTARIO: { texto: "Reportó un código que no está en el inventario", tono: "alerta" },
  REGISTRAR_CONTEO_FISICO: { texto: "Registró un conteo físico", tono: "cambio" },
  EDITAR_SEGUIMIENTO: { texto: "Actualizó el seguimiento", tono: "cambio" },
  EDITAR_SEGUIMIENTO_MASIVO: { texto: "Actualizó el seguimiento de varios casos", tono: "cambio" },
  ACTUALIZAR_DESDE_INVENTARIO: { texto: "Detectado en la fotografía de inventario", tono: "sistema" },
  DESAPARECER_DEL_INVENTARIO: { texto: "Dejó de aparecer en el inventario", tono: "sistema" },
  ANULAR_CASO: { texto: "Anuló un caso", tono: "alerta" },
  CASOS_REASIGNADOS: { texto: "Reasignó casos", tono: "cambio" },
  RESPONSABLE_TRANSFERIDO: { texto: "Cambió el responsable", tono: "cambio" },
  CREAR_BODEGA_PRODUCTO: { texto: "Creó una bodega física", tono: "creacion" },
  ASIGNAR_BODEGA_LINEA: { texto: "Asignó una bodega física a una línea", tono: "cambio" },
  BODEGA_POR_LINEA: { texto: "Bodega física asignada por línea", tono: "sistema" },
  EXCEPCION_BODEGA_PRODUCTO: { texto: "Asignó una bodega física a un producto", tono: "cambio" },
  ASIGNAR_EXCEPCION_BODEGA: { texto: "Asignó una bodega física a un producto", tono: "cambio" },
  QUITAR_EXCEPCION_BODEGA: { texto: "Quitó la bodega física de un producto", tono: "cambio" },
  CREAR_OBSERVACION_MEJORA: { texto: "Envió una observación a un facturador", tono: "creacion" },
  ACTUALIZAR_OBSERVACION_MEJORA: { texto: "Actualizó una observación de mejora", tono: "cambio" },
  PEDIDO_ENVIADO: { texto: "Envió un pedido de mercancía", tono: "creacion" },
  RESTABLECER_PROYECTO: { texto: "Restableció el proyecto desde cero", tono: "alerta" },
};

const entidades: Record<string, string> = {
  Autenticacion: "Sesión", Usuario: "Usuario", AsignacionAcceso: "Acceso", Ubicacion: "Región, tienda o bodega",
  Negativo: "Negativo", Inconsistencia: "Inconsistencia", ReporteTransferenciaTienda: "Reporte de tienda",
  TransferenciaConsultaImport: "Carga de transferencias", DevolucionConsultaImport: "Carga de devoluciones",
  ConsultaInventario: "Carga de inventario", FotoNegativos: "Fotografía de negativos", PerfilLaboral: "Facturador",
  ObservacionFacturador: "Observación de mejora", BodegaProducto: "Bodega física", LineaInventario: "Línea de inventario",
  ExcepcionBodegaProducto: "Bodega física de un producto", RestablecimientoProyecto: "Restablecimiento", Pedido: "Pedido",
  SincronizacionEstado: "Sincronización",
};

const campos: Record<string, string> = {
  estado: "Estado", conteoFisico: "Conteo físico", existenciaSistemaConteo: "Existencia en sistema al contar", existencia: "Existencia",
  motivo: "Motivo", veredicto: "Veredicto", numeroAjuste: "Número de ajuste", observaciones: "Observaciones",
  documentoRelacionado: "Documento relacionado", bodegaProductoId: "Bodega física", responsable: "Responsable",
  resuelto: "Resuelto", comentarioAdmin: "Comentario de seguimiento", unidadesSinResolver: "Unidades sin resolver",
  cantidadErrada: "Cantidad reportada", tipoError: "Tipo de error", accionCorrectiva: "Acción correctiva",
  nombre: "Nombre", email: "Correo", rol: "Rol", activo: "Activa", codigo: "Código", tipo: "Tipo",
  asignaciones: "Accesos", ubicacionId: "Ubicación", regionId: "Región", titulo: "Título", detalle: "Detalle",
  prioridad: "Prioridad", transferencia: "Transferencia", sinIncidencias: "Sin incidencias",
  total: "Total", insertadas: "Nuevas", actualizadas: "Actualizadas", bajas: "Retiradas", sinCambios: "Sin cambios",
  filasDetalle: "Líneas de detalle", abiertas: "Abiertas", aprobadas: "Aprobadas", exportadas: "Exportadas",
  sinTienda: "Sin tienda", sinFacturador: "Sin facturador", sinProducto: "Sin producto", desde: "Desde",
  anterioresAlRestablecimiento: "Anteriores al restablecimiento", respaldo: "Respaldo", motivoReporte: "Motivo de la tienda",
  submotivoReporte: "Detalle de la tienda", detalleOtro: "Explicación", codigoBarra: "Código de barra", referencia: "Referencia",
};
// Datos internos que no ayudan a entender el cambio (identificadores, huellas, versiones).
const ocultos = /^(id|version|updatedAt|createdAt|hash\w*|sha256|tokenHash|passwordHash|consultaId|ultimaImportacionId|fusionadoEnId)$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fechaIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "EDITAR_SEGUIMIENTO" → "Editar seguimiento", "TransferenciaConsulta" → "Transferencia consulta". */
const legible = (codigo: string) => {
  const texto = codigo.includes("_") || codigo === codigo.toUpperCase() ? codigo.toLowerCase().replaceAll("_", " ") : codigo.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

export const accionAuditoria = (codigo: string): Accion => acciones[codigo] ?? { texto: legible(codigo), tono: "cambio" };
export const entidadAuditoria = (codigo: string) => entidades[codigo] ?? legible(codigo);
export const campoAuditoria = (clave: string) => campos[clave] ?? legible(clave);

const modulos: [RegExp, string][] = [
  [/\/api\/auth/, "Inicio de sesión"], [/\/api\/operacion\/negativos/, "Negativos"], [/\/api\/inconsistencias/, "Inconsistencias"],
  [/\/api\/tienda/, "Portal de tienda"], [/\/api\/admin\/usuarios/, "Administración · Usuarios"], [/\/api\/admin\/entidades/, "Administración · Regiones y entidades"],
  [/\/api\/admin\/sincronizacion/, "Administración · Sincronización"], [/\/api\/admin\/restablecer/, "Administración · Restablecer"], [/\/api\/admin/, "Administración"],
  [/\/api\/facturacion/, "Facturación"], [/\/api\/inventario/, "Inventario"], [/\/api\/sincronizacion/, "Botón Actualizar ahora"],
  [/\/api\/transferencias/, "Transferencias"], [/\/api\/devoluciones/, "Devoluciones"],
];
/** De dónde vino la acción, sin rutas técnicas: "Web · Negativos", "Sincronización automática". */
export function origenAuditoria(origen: string | null | undefined) {
  const valor = String(origen ?? "").trim();
  if (!valor) return "Sin origen registrado";
  if (/^AGENTE/i.test(valor)) return "Sincronización automática (agente de la bodega)";
  if (/SQLSERVER|SINCRONIZACION/i.test(valor)) return "Sincronización automática (SQL Server)";
  if (/^WEB\b/i.test(valor)) { const modulo = modulos.find(([patron]) => patron.test(valor)); return modulo ? `Web · ${modulo[1]}` : "Web"; }
  if (/SCRIPT|CLI|SEED/i.test(valor)) return "Proceso del servidor";
  return legible(valor);
}

const estadoTexto = (valor: string) => (estadosNegativo as Record<string, string>)[valor] ?? (RESPONSABLE_LABELS as Record<string, string>)[valor] ?? (roles as Record<string, string>)[valor] ?? null;
/** Un valor guardado, como lo leería una persona. */
export function valorAuditoria(clave: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (typeof valor === "number") return valor.toLocaleString("es-VE");
  if (typeof valor === "string") {
    if (uuid.test(valor)) return clave.endsWith("Id") ? "Registro vinculado" : "Identificador interno";
    if (fechaIso.test(valor)) { const fecha = new Date(valor); if (!Number.isNaN(fecha.getTime())) return fecha.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" }); }
    if (/^-?\d+(\.\d+)?$/.test(valor)) return Number(valor).toLocaleString("es-VE", { maximumFractionDigits: 4 });
    const estado = /estado|responsable|rol/i.test(clave) ? estadoTexto(valor) : null;
    return estado ?? (/^[A-Z][A-Z_]+$/.test(valor) ? legible(valor) : valor);
  }
  if (Array.isArray(valor)) return valor.length ? valor.map(item => typeof item === "object" && item ? Object.values(item).filter(v => typeof v === "string" && !uuid.test(v)).join(" ") || "Elemento" : valorAuditoria(clave, item)).join(", ") : "Ninguno";
  return "Datos agrupados";
}

export type CambioAuditoria = { clave: string; campo: string; antes: string; despues: string; cambio: boolean };
const aplanar = (valor: unknown, prefijo = ""): Record<string, unknown> => {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return prefijo ? { [prefijo]: valor } : {};
  return Object.fromEntries(Object.entries(valor as Record<string, unknown>).flatMap(([clave, dato]) =>
    dato && typeof dato === "object" && !Array.isArray(dato) ? Object.entries(aplanar(dato, clave)) : [[prefijo ? `${prefijo}.${clave}` : clave, dato]]));
};

/**
 * Qué cambió: campo por campo, el antes y el después en lenguaje claro. Sin valor anterior
 * (una creación o una carga) se listan los datos registrados. Se omiten los datos internos.
 */
export function cambiosAuditoria(antes: unknown, despues: unknown): CambioAuditoria[] {
  const a = aplanar(antes), d = aplanar(despues);
  const claves = [...new Set([...Object.keys(a), ...Object.keys(d)])].filter(clave => !ocultos.test(clave.split(".").pop()!));
  const hayAntes = Object.keys(a).length > 0;
  return claves.map(clave => {
    const ultimo = clave.split(".").pop()!, va = valorAuditoria(ultimo, a[clave]), vd = valorAuditoria(ultimo, d[clave]);
    return { clave, campo: clave.split(".").map(campoAuditoria).join(" · "), antes: hayAntes ? va : "", despues: vd, cambio: !hayAntes || JSON.stringify(a[clave] ?? null) !== JSON.stringify(d[clave] ?? null) };
  }).filter(item => item.cambio && !(item.antes === "—" && item.despues === "—"));
}

/** Acciones conocidas para el filtro de la auditoría, en orden alfabético de su texto. */
export const accionesAuditoria = Object.entries(acciones).map(([codigo, accion]) => ({ codigo, texto: accion.texto })).sort((x, y) => x.texto.localeCompare(y.texto, "es"));
/** Tipos de registro conocidos para el filtro. */
export const entidadesAuditoria = Object.entries(entidades).map(([codigo, texto]) => ({ codigo, texto })).sort((x, y) => x.texto.localeCompare(y.texto, "es"));
