import "server-only";
import type { PrismaClient } from "../../../generated/prisma/client";
import { authAudit, emailSchema } from "../auth/service";

/**
 * Cuenta de sistema a cuyo nombre se registran las cargas automáticas de
 * inventario. No tiene contraseña, así que nadie puede iniciar sesión con ella,
 * y solo recibe el rol nacional de Mejora Continua (el que importa inventario).
 */
export async function ensureSyncUser(db: PrismaClient, rawEmail: string | undefined) {
  const email = emailSchema.parse(rawEmail);
  return db.$transaction(async tx => {
    const existing = await tx.usuario.findUnique({ where: { email } });
    if (existing?.passwordHash) {
      throw new Error("Ya existe una persona con el correo " + email + ". Use un correo exclusivo para la sincronizacion.");
    }
    const user = existing
      ? await tx.usuario.update({ where: { id: existing.id }, data: { activo: true, estado: "ACTIVO", debeCambiarPassword: false } })
      : await tx.usuario.create({
        data: { email, nombre: "Sincronizacion SQL Server", rol: "MEJORA_CONTINUA", passwordHash: null, estado: "ACTIVO", activo: true, debeCambiarPassword: false },
      });
    const grant = await tx.asignacionAcceso.findFirst({ where: { usuarioId: user.id, rol: "MEJORA_CONTINUA", ubicacionId: null } });
    if (!grant) await tx.asignacionAcceso.create({ data: { usuarioId: user.id, rol: "MEJORA_CONTINUA" } });
    if (!existing || !grant) {
      await authAudit(tx, existing ? "USUARIO_SINCRONIZACION_ACTUALIZADO" : "USUARIO_SINCRONIZACION_CREADO", user.id,
        "Cuenta de sistema sin contrasena para las cargas automaticas de inventario", { rol: "MEJORA_CONTINUA" });
    }
    return { email, creado: !existing };
  });
}
