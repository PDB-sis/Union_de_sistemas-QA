export function updateInconsistencySelection<T extends {id:string;tipoError:string;resuelto:boolean}>(previous:Record<string,T>,page:readonly T[],checked:boolean,max=50):Record<string,T>{
  const next={...previous};
  if(!checked){for(const row of page)delete next[row.id];return next;}
  const type=Object.values(next)[0]?.tipoError??page.find(row=>!row.resuelto)?.tipoError;
  for(const row of page){
    if(row.resuelto||row.tipoError!==type)continue;
    if(!next[row.id]&&Object.keys(next).length>=max)break;
    next[row.id]=row;
  }
  return next;
}
