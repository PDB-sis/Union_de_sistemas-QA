export const STORE_REPORT_REASONS = [
  ["FALTANTE", "Faltante"],
  ["SOBRANTE", "Sobrante"],
  ["CRUCE", "Cruce de producto"],
  ["DANADO", "Dañado"],
  ["VENCIDO", "Vencido"],
  ["OTRO", "Otro"],
] as const;

export type StoreReportReason = typeof STORE_REPORT_REASONS[number][0];
export const STORE_REPORT_SUBREASONS = {
  SOBRANTE: [["UNIDADES_MAS_PAQUETE","Unidad(es) de más en paquete"],["NO_ESTA_TRANSFERENCIA","No está en la transferencia (sí en físico)"]],
  FALTANTE: [["UNIDADES_MENOS_PAQUETE","Unidad(es) de menos en paquete"],["NO_ESTA_FISICO","No está en físico (sí en transferencia)"]],
} as const;
export type StoreReportSubreason = typeof STORE_REPORT_SUBREASONS[keyof typeof STORE_REPORT_SUBREASONS][number][0];
export const UNKNOWN_BARCODE_REASONS = [
  ["CODIGO_MEZCLADO_PAQUETE","Código de barra mezclado en el paquete"],
  ["OTRA_PRENDA","Es otra prenda"],
  ["OTRO","Otro"],
] as const;
export type UnknownBarcodeReason = typeof UNKNOWN_BARCODE_REASONS[number][0];
export type TransferDeadlineStatus = "VENCIDA"|"HOY"|"MANANA"|"A_TIEMPO";

export function canonicalStoreName(value:string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s*\([^)]*\)\s*$/, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
}

export function parseOperationalDate(value:string) {
  const text=String(value??"").trim();
  const iso=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const local=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  let year:number,month:number,day:number;
  if(iso){year=Number(iso[1]);month=Number(iso[2]);day=Number(iso[3]);}
  else if(local){const first=Number(local[1]),second=Number(local[2]);year=Number(local[3]);if(first>12){day=first;month=second;}else{month=first;day=second;}}
  else return null;
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date:null;
}

export function addBusinessDays(start:Date,days:number) {
  const result=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate()));
  let remaining=days;
  while(remaining>0){result.setUTCDate(result.getUTCDate()+1);const weekday=result.getUTCDay();if(weekday!==0&&weekday!==6)remaining--;}
  return result;
}

export function businessDaysBetween(from:Date,to:Date) {
  const start=new Date(Date.UTC(from.getUTCFullYear(),from.getUTCMonth(),from.getUTCDate()));
  const end=new Date(Date.UTC(to.getUTCFullYear(),to.getUTCMonth(),to.getUTCDate()));
  if(start.getTime()===end.getTime())return 0;
  const direction=start<end?1:-1;let count=0;
  while(start.getTime()!==end.getTime()){start.setUTCDate(start.getUTCDate()+direction);const weekday=start.getUTCDay();if(weekday!==0&&weekday!==6)count+=direction;}
  return count;
}

export function transferDeadline(exportDate:string,today=new Date()) {
  const exported=parseOperationalDate(exportDate);if(!exported)return null;
  const deadline=addBusinessDays(exported,5);
  const current=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
  const remaining=businessDaysBetween(current,deadline);
  const status:TransferDeadlineStatus=remaining<0?"VENCIDA":remaining===0?"HOY":remaining===1?"MANANA":"A_TIEMPO";
  return {deadline,remaining,status};
}
