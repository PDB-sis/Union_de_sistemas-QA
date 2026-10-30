export const estados = {
  NUEVO: "Nuevo", EN_INVESTIGACION: "En investigación", ESPERANDO_CONTEO: "Esperando conteo físico",
  ESPERANDO_DECISION: "Esperando decisión", AJUSTE_AUTORIZADO: "Ajuste autorizado", AJUSTE_REALIZADO: "Ajuste realizado",
  PENDIENTE_VERIFICAR: "Pendiente de verificar", CERRADO_SIN_AJUSTE: "Cerrado sin ajuste", SOLUCIONADO: "Solucionado", REABIERTO: "Reabierto",
} as const;
export type Estado = keyof typeof estados;
// Group the operational view without rewriting historical states or snapshots.
export const gruposEstado = {
  EN_INVESTIGACION: { label: "En investigación", estados: ["NUEVO", "EN_INVESTIGACION", "ESPERANDO_CONTEO", "ESPERANDO_DECISION", "PENDIENTE_VERIFICAR", "REABIERTO"] },
  AJUSTE_AUTORIZADO: { label: "Aprobado para ajuste", estados: ["AJUSTE_AUTORIZADO", "AJUSTE_REALIZADO"] },
  SOLUCIONADO: { label: "Solucionado", estados: ["SOLUCIONADO", "CERRADO_SIN_AJUSTE"] },
} as const satisfies Record<string, {label: string; estados: readonly Estado[]}>;
export type GrupoEstado = keyof typeof gruposEstado;
export function grupoEstado(estado: Estado): GrupoEstado {
  return (Object.keys(gruposEstado) as GrupoEstado[]).find(key => (gruposEstado[key].estados as readonly Estado[]).includes(estado))!;
}
export const ordenesNegativos = {
  cantidad_desc: "Mayor negativo primero", cantidad_asc: "Menor negativo primero",
  codigo_asc: "Código: A → Z", codigo_desc: "Código: Z → A",
  fecha_desc: "Detección más reciente", fecha_asc: "Detección más antigua",
} as const;
export const legacyKeys = ["mc-seguimiento-negativos", "mc-negativos-importados", "mc-negativos-importacion-meta", "mc-negativos-importacion-historial", "mc-negativos-historial-snapshots"] as const;
export type LegacyPacket = { fuentes: Record<string, string | null>; base: unknown[] };
