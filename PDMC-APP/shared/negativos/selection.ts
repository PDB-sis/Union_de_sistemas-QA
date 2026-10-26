export type NegativeSelection = Record<string,number>;

export function updatePageSelection(
  previous: NegativeSelection,
  page: readonly {id:string;version:number}[],
  checked: boolean,
): NegativeSelection {
  const next={...previous};
  let count=Object.keys(next).length;
  for(const item of page){
    if(checked){
      if(next[item.id]===undefined&&count>=100)break;
      if(next[item.id]===undefined)count++;
      next[item.id]=item.version;
    }else if(next[item.id]!==undefined){delete next[item.id];count--;}
  }
  return next;
}
