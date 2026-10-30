import { useEffect } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { PdmcMark } from "@/components/brand/pdmc-mark";

/** Título de la pestaña, con el mismo formato que usaba Next.js ("Sección · PDMC"). */
export function useTitulo(titulo?: string) {
  useEffect(() => { document.title = titulo ? `${titulo} · PDMC` : "PDMC · Panel de Mejora Continua"; }, [titulo]);
}

export function Cargando() {
  return <main className="grid min-h-dvh place-items-center p-6">
    <div role="status" className="grid justify-items-center gap-4 text-sm text-muted-foreground">
      <PdmcMark className="size-12" />
      <span className="flex items-center gap-2"><LoaderCircle aria-hidden className="size-4 animate-spin" />Cargando PDMC…</span>
    </div>
  </main>;
}

export function ErrorDeCarga({ mensaje, reintentar }: { mensaje: string; reintentar: () => void }) {
  return <main className="grid min-h-dvh place-items-center p-6">
    <div role="alert" className="pdmc-surface grid max-w-sm justify-items-center gap-3 rounded-3xl border bg-card p-8 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-danger-100 text-danger-700 dark:bg-danger-950/50 dark:text-danger-300"><CircleAlert className="size-6" /></span>
      <p className="font-semibold">No se pudo abrir PDMC</p>
      <p className="text-sm text-muted-foreground">{mensaje}</p>
      <button type="button" onClick={reintentar} className="mt-2 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Reintentar</button>
    </div>
  </main>;
}
