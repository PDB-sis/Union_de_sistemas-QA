export function monthKey(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Caracas",year:"numeric",month:"2-digit"}).formatToParts(date);
  const year=parts.find(part=>part.type==="year")?.value,month=parts.find(part=>part.type==="month")?.value;
  if(!year||!month)throw new Error("No se pudo determinar el periodo actual.");
  return `${year}-${month}`;
}
export const currentMonth=()=>monthKey();
export function monthRange(value:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw new Error("Mes inválido.");const [year,month]=value.split("-").map(Number);return {gte:new Date(Date.UTC(year,month-1,1)),lt:new Date(Date.UTC(year,month,1))};}
export function monthLabel(value:string){const [year,month]=value.split("-").map(Number);return new Intl.DateTimeFormat("es-VE",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(year,month-1,1)));}
