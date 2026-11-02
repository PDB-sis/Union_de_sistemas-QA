import type { PrismaClient } from "../../generated/prisma/client";
import { SystemAuthorization } from "../auth/authorization";

export type CuentaSitio =
  | { acceso: SystemAuthorization; cuenta: string; region: string }
  | { aviso: string };

/**
 * Cuenta con la que se carga un sitio (bodega): la cuenta de sincronización de su región,
 * creada en Administración → Sincronización. Si la región aún no tiene una, se usa la cuenta
 * de transición PDMC_SYNC_USUARIO_EMAIL; sin ninguna de las dos, el sitio no se carga y se avisa.
 */
export async function cuentaDelSitio(db: PrismaClient, ubicacionId: string): Promise<CuentaSitio> {
  const sitio = await db.ubicacion.findUnique({ where: { id: ubicacionId }, select: { id: true, nombre: true, regionId: true, region: { select: { nombre: true } } } });
  if (!sitio) return { aviso: "El sitio no está en el catálogo de PDMC: sincronice SUCURSALES." };
  const recurso = { id: sitio.id, regionId: sitio.regionId };
  const region = sitio.region?.nombre ?? "sin región";
  const propia = sitio.regionId
    ? await db.asignacionAcceso.findFirst({ where: { rol: "SINCRONIZACION", ubicacionId: sitio.regionId }, select: { usuario: { select: { id: true, email: true } } } })
    : null;
  if (propia) return { acceso: new SystemAuthorization(db, propia.usuario.id, recurso), cuenta: propia.usuario.email, region };
  const email = process.env.PDMC_SYNC_USUARIO_EMAIL?.trim().toLowerCase();
  const transicion = email ? await db.usuario.findUnique({ where: { email }, select: { id: true } }) : null;
  if (transicion) return { acceso: new SystemAuthorization(db, transicion.id, recurso), cuenta: email!, region };
  return { aviso: `La región ${region} no tiene cuenta de sincronización: créela en Administración → Sincronización.` };
}
