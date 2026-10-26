export type TransferType="NORMAL"|"CORRECCION"|"ROTACION";

const normalized=(value:string|null|undefined)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

export function transferType(description:string|null|undefined):TransferType{
  const value=normalized(description);
  if(value.includes("correccion"))return "CORRECCION";
  if(value.includes("rotacion"))return "ROTACION";
  return "NORMAL";
}

export const transferTypeLabel:Record<TransferType,string>={NORMAL:"Transferencia normal",CORRECCION:"Corrección",ROTACION:"Rotación de mercancía"};
