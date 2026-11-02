export const roles = {
  ADMINISTRADOR: "Administrador", MEJORA_CONTINUA: "Mejora Continua", TIENDA: "Cuenta de tienda",
  JEFE_BODEGA: "Jefe de Bodega", RECTIFICACION: "Rectificación", RECEPCION: "Recepción",
  AUDITORIA: "Auditoría", FACTURACION: "Facturación", SINCRONIZACION: "Sincronización",
} as const;
export type Rol = keyof typeof roles;
/**
 * Roles de cuentas de sistema, no de personas: no tienen contraseña ni se asignan en el
 * formulario de usuarios. La cuenta de sincronización de cada región se crea en
 * Administración → Sincronización y solo carga las bodegas de su región.
 */
export const rolesDeSistema: readonly Rol[] = ["SINCRONIZACION"];
export type UsuarioSesion = { id:string; email:string; nombre:string; rol:Rol; debeCambiarPassword:boolean };
