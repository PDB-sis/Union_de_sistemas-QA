"use client";
import { createContext, useContext } from "react";
import type { Permission } from "@shared/auth/permissions";
export type Capabilities = {available:Permission[];national:Permission[];warehouses:Record<string,Permission[]>};
export const PermissionContext=createContext<Capabilities>({available:[],national:[],warehouses:{}});
export function usePermission() {
  const value=useContext(PermissionContext);
  return (permission:Permission,id?:string)=>value.national.includes(permission) ||
    (id?Boolean(value.warehouses[id]?.includes(permission)):value.available.includes(permission));
}
