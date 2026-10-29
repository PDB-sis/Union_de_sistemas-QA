export const roles = {
  ADMINISTRADOR: "Administrador", MEJORA_CONTINUA: "Mejora Continua", TIENDA: "Cuenta de tienda",
  JEFE_BODEGA: "Jefe de Bodega", RECTIFICACION: "Rectificación", RECEPCION: "Recepción",
  AUDITORIA: "Auditoría", FACTURACION: "Facturación",
} as const;
export type Rol = keyof typeof roles;
/** Roles operativos que, además de una región, pueden tener alcance nacional (todas las regiones). */
export const rolesConAlcanceNacional: readonly Rol[] = ["MEJORA_CONTINUA"];
export type UsuarioSesion = { id:string; email:string; nombre:string; rol:Rol; debeCambiarPassword:boolean };
