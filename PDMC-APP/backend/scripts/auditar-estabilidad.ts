import {loadEnvConfig} from "@next/env";
import {getDb} from "../src/db";

loadEnvConfig(process.cwd());
const db=getDb();
const count=async(sql:TemplateStringsArray,...values:unknown[])=>Number((await db.$queryRawUnsafe<{total:bigint}[]>(String.raw(sql,...values)))[0]?.total??0);

async function main(){
  const critical={
    usuariosFacturacionSinPerfil:await count`SELECT count(*) AS total FROM "Usuario" u WHERE EXISTS (SELECT 1 FROM "AsignacionAcceso" a WHERE a."usuarioId"=u.id AND a.rol='FACTURACION') AND NOT EXISTS (SELECT 1 FROM "VinculoOperativo" v JOIN "PerfilLaboral" p ON p.id=v."perfilId" WHERE v."usuarioId"=u.id AND p.tipo='FACTURACION')`,
    perfilesFacturacionConVariasCuentas:await count`SELECT count(*) AS total FROM (SELECT v."perfilId" FROM "VinculoOperativo" v JOIN "PerfilLaboral" p ON p.id=v."perfilId" WHERE p.tipo='FACTURACION' GROUP BY v."perfilId" HAVING count(DISTINCT v."usuarioId")>1) x`,
    transferenciasConCodigoDistintoAlPerfil:await count`SELECT count(*) AS total FROM "TransferenciaConsulta" t JOIN "PerfilLaboral" p ON p.id=t."facturadorId" WHERE upper(trim(t."codigoFacturador"))<>upper(trim(p.codigo))`,
    transferenciasConTiendaDistintaAlCodigo:await count`SELECT count(*) AS total FROM "TransferenciaConsulta" t JOIN "Ubicacion" u ON u.id=t."tiendaId" WHERE upper(trim(t."codigoTiendaConsulta"))<>upper(trim(u.codigo))`,
    devolucionesConCodigoDistintoAlResponsable:await count`SELECT count(*) AS total FROM "DevolucionConsulta" d JOIN "PerfilLaboral" p ON p.id=d."responsableId" WHERE upper(trim(d."codigoResponsable"))<>upper(trim(p.codigo))`,
    ubicacionesFueraDeSuRegion:await count`SELECT count(*) AS total FROM "Ubicacion" WHERE (tipo='REGION' AND "regionId" IS NOT NULL) OR (tipo IN ('TIENDA','BODEGA') AND "regionId" IS NULL)`
  };
  const warnings={
    transferenciasSinFacturador:await db.transferenciaConsulta.count({where:{facturadorId:null}}),
    transferenciasSinFacturadorPeroEnlazables:await count`SELECT count(*) AS total FROM "TransferenciaConsulta" t JOIN "PerfilLaboral" p ON p.tipo='FACTURACION' AND upper(trim(p.codigo))=upper(trim(t."codigoFacturador")) WHERE t."facturadorId" IS NULL`,
    transferenciasSinTienda:await db.transferenciaConsulta.count({where:{tiendaId:null}}),
    transferenciasSinTiendaPeroEnlazables:await count`SELECT count(*) AS total FROM "TransferenciaConsulta" t JOIN "Ubicacion" u ON u.tipo='TIENDA' AND upper(trim(u.codigo))=upper(trim(t."codigoTiendaConsulta")) WHERE t."tiendaId" IS NULL`,
    detallesTransferenciaSinProducto:await db.transferenciaConsultaDetalle.count({where:{productoId:null}}),
    devolucionesSinResponsable:await db.devolucionConsulta.count({where:{responsableId:null}}),
    devolucionesSinResponsablePeroEnlazables:await count`SELECT count(*) AS total FROM "DevolucionConsulta" d JOIN "PerfilLaboral" p ON p.tipo='FACTURACION' AND upper(trim(p.codigo))=upper(trim(d."codigoResponsable")) WHERE d."responsableId" IS NULL`,
    devolucionesSinTienda:await db.devolucionConsulta.count({where:{tiendaId:null}}),
    devolucionesSinTiendaPeroEnlazables:await count`SELECT count(*) AS total FROM "DevolucionConsulta" d JOIN "Ubicacion" u ON u.tipo='TIENDA' AND upper(trim(u.codigo))=upper(trim(d."codigoTiendaConsulta")) WHERE d."tiendaId" IS NULL`,
    detallesDevolucionSinProducto:await db.devolucionConsultaDetalle.count({where:{productoId:null}})
  };
  const totals={usuarios:await db.usuario.count(),facturadores:await db.perfilLaboral.count({where:{tipo:"FACTURACION"}}),transferencias:await db.transferenciaConsulta.count(),devoluciones:await db.devolucionConsulta.count(),productos:await db.producto.count(),tiendas:await db.ubicacion.count({where:{tipo:"TIENDA"}})};
  const stable=Object.values(critical).every(value=>value===0);
  console.info(JSON.stringify({estable:stable,criticos:critical,advertenciasDatos: warnings,totales:totals},null,2));
  if(!stable)process.exitCode=1;
}

main().catch(error=>{console.error(error instanceof Error?error.message:"No se pudo auditar la estabilidad.");process.exitCode=1}).finally(()=>db.$disconnect());
