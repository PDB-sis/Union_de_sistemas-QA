"use client";

import { ArrowRight, Bot, LogIn, PencilLine, PlusCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { accionAuditoria, cambiosAuditoria, entidadAuditoria, origenAuditoria, type TonoAuditoria } from "@pdmc/contratos/auditoria/catalogo";

export type RegistroAuditoria = {
  id: string; createdAt: string; accion: string; entidad?: string; entidadId?: string; motivo: string; origen?: string | null;
  usuario?: { nombre: string; email?: string } | null; valorAnterior: unknown; valorNuevo: unknown;
};

const tonos: Record<TonoAuditoria, { clase: string; icono: typeof LogIn }> = {
  acceso: { clase: "bg-info-100 text-info-800 dark:bg-info-950/50 dark:text-info-200", icono: LogIn },
  creacion: { clase: "bg-success-100 text-success-800 dark:bg-success-950/50 dark:text-success-200", icono: PlusCircle },
  cambio: { clase: "bg-brand-100 text-brand-800 dark:bg-brand-950/50 dark:text-brand-200", icono: PencilLine },
  carga: { clase: "bg-muted text-muted-foreground", icono: RefreshCw },
  alerta: { clase: "bg-danger-100 text-danger-800 dark:bg-danger-950/50 dark:text-danger-200", icono: TriangleAlert },
  sistema: { clase: "bg-muted text-muted-foreground", icono: Bot },
};

export const fechaAuditoria = (valor: string) => new Date(valor).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" });
/** Quién lo hizo: la persona, o la sincronización o el sistema si no hubo usuario. */
export const autorAuditoria = (registro: RegistroAuditoria) => registro.usuario?.nombre ?? (/^AGENTE|SQLSERVER|SINCRONIZACION/i.test(registro.origen ?? "") ? "Sincronización automática" : "Sistema");

export function IconoAccion({ accion }: { accion: string }) {
  const tono = tonos[accionAuditoria(accion).tono], Icono = tono.icono;
  return <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-xl ${tono.clase}`}><Icono className="size-4" /></span>;
}

/** Lo que cambió, campo por campo: antes → después. */
export function CambiosAuditoria({ antes, despues, compacto = false }: { antes: unknown; despues: unknown; compacto?: boolean }) {
  const cambios = cambiosAuditoria(antes, despues), conAntes = cambios.some(item => item.antes !== "");
  if (!cambios.length) return compacto ? null : <p className="text-sm text-muted-foreground">No hay cambios de datos para mostrar en este registro.</p>;
  if (compacto) return <ul className="mt-1.5 grid gap-1 text-xs">{cambios.slice(0, 6).map(item => <li key={item.clave} className="flex flex-wrap items-center gap-1"><span className="font-semibold">{item.campo}:</span>{conAntes && <><span className="text-muted-foreground line-through decoration-muted-foreground/50">{item.antes}</span><ArrowRight aria-label="cambió a" className="size-3 text-muted-foreground" /></>}<span className="font-medium">{item.despues}</span></li>)}{cambios.length > 6 && <li className="text-muted-foreground">y {cambios.length - 6} dato(s) más</li>}</ul>;
  return <div className="overflow-hidden rounded-xl border">
    <div className={`hidden gap-3 bg-muted/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid ${conAntes ? "sm:grid-cols-[minmax(9rem,1fr)_1fr_1fr]" : "sm:grid-cols-[minmax(9rem,1fr)_2fr]"}`}><span>Dato</span>{conAntes && <span>Antes</span>}<span>{conAntes ? "Después" : "Valor registrado"}</span></div>
    <dl className="divide-y">{cambios.map(item => <div key={item.clave} className={`grid gap-1 px-4 py-2.5 text-sm sm:gap-3 ${conAntes ? "sm:grid-cols-[minmax(9rem,1fr)_1fr_1fr]" : "sm:grid-cols-[minmax(9rem,1fr)_2fr]"}`}>
      <dt className="font-semibold">{item.campo}</dt>
      {conAntes && <dd className="min-w-0 break-words text-muted-foreground"><span className="text-xs font-medium sm:hidden">Antes: </span>{item.antes}</dd>}
      <dd className="min-w-0 break-words font-medium"><span className="text-xs font-normal text-muted-foreground sm:hidden">{conAntes ? "Después: " : ""}</span>{item.despues}</dd>
    </div>)}</dl>
  </div>;
}

/** Detalle completo de un registro: qué pasó, quién, cuándo, desde dónde, por qué y qué cambió. */
export function DetalleAuditoria({ registro }: { registro: RegistroAuditoria }) {
  const accion = accionAuditoria(registro.accion);
  const datos: [string, string][] = [
    ["Quién", autorAuditoria(registro) + (registro.usuario?.email ? ` · ${registro.usuario.email}` : "")],
    ["Cuándo", fechaAuditoria(registro.createdAt)],
    ...(registro.entidad ? [["Sobre", `${entidadAuditoria(registro.entidad)}${registro.entidadId ? ` · ref. ${registro.entidadId.slice(0, 8)}` : ""}`] as [string, string]] : []),
    ["Desde", origenAuditoria(registro.origen)],
  ];
  return <div className="grid gap-5">
    <div className="flex items-start gap-3"><IconoAccion accion={registro.accion} /><div className="min-w-0"><p className="text-lg font-bold leading-6">{accion.texto}</p>{registro.motivo && <p className="mt-1 text-sm text-muted-foreground">{registro.motivo}</p>}</div></div>
    <dl className="grid gap-3 rounded-xl bg-muted/40 p-4 text-sm sm:grid-cols-2">{datos.map(([etiqueta, valor]) => <div key={etiqueta} className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{etiqueta}</dt><dd className="mt-0.5 break-words font-medium">{valor}</dd></div>)}</dl>
    <section className="grid gap-2"><h4 className="font-semibold">Qué cambió</h4><CambiosAuditoria antes={registro.valorAnterior} despues={registro.valorNuevo} /></section>
    <details className="rounded-xl border px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold text-muted-foreground">Datos técnicos (para soporte)</summary>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{registro.accion} · {registro.entidad} · {registro.entidadId}</p>
      <p className="font-mono text-xs text-muted-foreground">{registro.origen}</p>
      <div className="mt-2 grid gap-3 md:grid-cols-2">{([["Antes", registro.valorAnterior], ["Después", registro.valorNuevo]] as const).map(([etiqueta, valor]) => <pre key={etiqueta} className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs"><b>{etiqueta}</b>{"\n"}{JSON.stringify(valor, null, 2)}</pre>)}</div>
    </details>
  </div>;
}

/** Una línea de historial clara (para el historial de un caso). */
export function LineaAuditoria({ registro }: { registro: RegistroAuditoria }) {
  return <li className="flex gap-3 py-3"><IconoAccion accion={registro.accion} /><div className="min-w-0 flex-1">
    <p className="text-sm font-semibold leading-5">{accionAuditoria(registro.accion).texto}</p>
    <p className="text-xs text-muted-foreground">{autorAuditoria(registro)} · {fechaAuditoria(registro.createdAt)}</p>
    {registro.motivo && <p className="mt-1 text-xs leading-5">{registro.motivo}</p>}
    <CambiosAuditoria antes={registro.valorAnterior} despues={registro.valorNuevo} compacto />
  </div></li>;
}
