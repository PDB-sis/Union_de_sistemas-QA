export function clearProjectStorage(){
  try{for(const storage of [window.localStorage,window.sessionStorage])for(const key of Object.keys(storage))if(/^(mc-|pdmc|PDMC)/.test(key))storage.removeItem(key);}catch{/* Almacenamiento bloqueado: no impedir el acceso. */}
}
export function syncProjectStorage(resetId:string|null){
  if(!resetId)return;
  try{if(window.localStorage.getItem("pdmc:restablecimiento")!==resetId){clearProjectStorage();window.localStorage.setItem("pdmc:restablecimiento",resetId);}}catch{}
}
