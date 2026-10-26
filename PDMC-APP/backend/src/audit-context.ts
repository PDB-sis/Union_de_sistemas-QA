import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
export const auditContext = new AsyncLocalStorage<{usuarioId?:string;origen:string}>();
export function auditActor(usuarioId?:string,origen?:string) {
  const ctx=auditContext.getStore();
  return {usuarioId:usuarioId??ctx?.usuarioId,origen:origen??ctx?.origen??"SERVIDOR"};
}
