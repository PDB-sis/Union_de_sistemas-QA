import {Badge} from "@/components/ui/badge";
import type {NegativeListing} from "@pdmc/contratos/negativos/contracts";
const amount=(value:string)=>Number(value).toLocaleString("es-VE",{maximumFractionDigits:4});
export function PhotoObservation({value}:{value:NegativeListing["items"][number]["comparacionFoto"]}){
  const increased=value.estado==="Empeoró",decreased=value.estado==="Mejoró",isNew=value.estado==="Nuevo";
  const label=isNew?"Nuevo en esta fotografía":increased?"Aumentó el negativo":decreased?"Disminuyó el negativo":value.estado;
  const tone=increased?"border-danger-300 bg-danger-50 text-danger-800 dark:bg-danger-950/40 dark:text-danger-200 dark:border-danger-800":decreased?"border-success-300 bg-success-50 text-success-800 dark:bg-success-950/40 dark:text-success-200 dark:border-success-800":isNew?"border-info-300 bg-info-50 text-info-800 dark:bg-info-950/40 dark:text-info-200 dark:border-info-800":"border-border bg-muted/40 text-muted-foreground";
  return <div className="min-w-48 space-y-1.5"><Badge variant="outline" className={tone}>{label}</Badge>{value.variacionUnidades!==null&&(increased||decreased)&&<p className="text-xs font-semibold">{amount(String(Math.abs(Number(value.variacionUnidades))))} unidades {increased?"más":"menos"} en negativo</p>}{value.estado!=="Sin fotografía"&&<p className="text-xs text-muted-foreground">Anterior: {value.estado==="Primera fotografía"?"Sin referencia":value.anterior===null?"No aparecía":amount(value.anterior)}<br/>Actual: {value.actual===null?"No aparece":amount(value.actual)}</p>}</div>;
}
