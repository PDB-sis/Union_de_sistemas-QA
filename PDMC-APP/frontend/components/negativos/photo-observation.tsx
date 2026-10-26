import {Badge} from "@frontend/components/ui/badge";
import type {NegativeListing} from "@shared/negativos/contracts";
const amount=(value:string)=>Number(value).toLocaleString("es-VE",{maximumFractionDigits:4});
export function PhotoObservation({value}:{value:NegativeListing["items"][number]["comparacionFoto"]}){
  const increased=value.estado==="Empeoró",decreased=value.estado==="Mejoró",isNew=value.estado==="Nuevo";
  const label=isNew?"Nuevo en esta fotografía":increased?"Aumentó el negativo":decreased?"Disminuyó el negativo":value.estado;
  const tone=increased?"border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200":decreased?"border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200":isNew?"border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200":"border-border bg-muted/40 text-muted-foreground";
  return <div className="min-w-48 space-y-1.5"><Badge variant="outline" className={tone}>{label}</Badge>{value.variacionUnidades!==null&&(increased||decreased)&&<p className="text-xs font-semibold">{amount(String(Math.abs(Number(value.variacionUnidades))))} unidades {increased?"más":"menos"} en negativo</p>}{value.estado!=="Sin fotografía"&&<p className="text-xs text-muted-foreground">Anterior: {value.estado==="Primera fotografía"?"Sin referencia":value.anterior===null?"No aparecía":amount(value.anterior)}<br/>Actual: {value.actual===null?"No aparece":amount(value.actual)}</p>}</div>;
}
