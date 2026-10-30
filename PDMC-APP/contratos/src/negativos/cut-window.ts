export type NegativeCutWindow={tipo:"LUNES"|"JUEVES";gte:Date;lt:Date};

export function negativeWeekRange(value:Date){
  const window=negativeCutWindow(value);
  const gte=window.tipo==="LUNES"?window.gte:new Date(window.gte.getTime()-3*86400000);
  const lt=new Date(gte.getTime()+7*86400000);
  return {gte,lt};
}

export function negativeCutWindow(value:Date):NegativeCutWindow{
  const date=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth(),value.getUTCDate()));
  const day=date.getUTCDay(),mondayOffset=day===0?-6:1-day;
  const monday=new Date(date);monday.setUTCDate(date.getUTCDate()+mondayOffset);
  const thursday=new Date(monday);thursday.setUTCDate(monday.getUTCDate()+3);
  const nextMonday=new Date(monday);nextMonday.setUTCDate(monday.getUTCDate()+7);
  return day>=1&&day<=3?{tipo:"LUNES",gte:monday,lt:thursday}:{tipo:"JUEVES",gte:thursday,lt:nextMonday};
}
