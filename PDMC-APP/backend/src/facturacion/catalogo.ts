import type {PrismaClient} from "../../generated/prisma/client";
import {normalizeHeader,parseDelimitedTable} from "../negativos/validation";

const code=(value:string)=>value.trim().replace(/^="(.*)"$/,"$1").toUpperCase();

// Catálogo de facturadores (CodUsuario, NombreUsuario) alimentado por la
// consulta "Usuarios Activos" de SQL Server. Crea o actualiza su perfil y
// vincula las transferencias que aún no tenían facturador.
export async function importBillerCatalog(db:PrismaClient,content:string,origen:string){
  const table=parseDelimitedTable(content);
  if(!table.length)throw new Error("La consulta de facturadores está vacía.");
  const headers=table[0].cells.map(normalizeHeader);if(headers.length!==2||headers[0]!=="codusuario"||headers[1]!=="nombreusuario")throw new Error("Encabezados requeridos: CodUsuario;NombreUsuario");
  const seen=new Set<string>(),rows=table.slice(1).filter(row=>row.cells.some(Boolean)).map(row=>{const codigo=code(row.cells[0]),nombre=row.cells[1].trim();if(!codigo||!nombre)throw new Error(`Fila ${row.fila}: código y nombre son obligatorios.`);if(seen.has(codigo))throw new Error(`Fila ${row.fila}: código duplicado ${codigo}.`);seen.add(codigo);return {codigo,nombre}});
  return db.$transaction(async tx=>{
    let creados=0,actualizados=0,sinCambios=0,transferenciasVinculadas=0,devolucionesVinculadas=0;
    for(const row of rows){
      const existing=await tx.perfilLaboral.findUnique({where:{codigo:row.codigo}});
      if(existing&&existing.tipo!=="FACTURACION")throw new Error(`El código ${row.codigo} pertenece a otro tipo de perfil.`);
      // Solo se escribe y se audita lo que cambió: la consulta se repite cada hora.
      const changed=!existing||existing.nombre!==row.nombre||!existing.activo;
      const profile=!existing?await tx.perfilLaboral.create({data:{codigo:row.codigo,nombre:row.nombre,tipo:"FACTURACION",activo:true}}):changed?await tx.perfilLaboral.update({where:{id:existing.id},data:{nombre:row.nombre,activo:true}}):existing;
      if(!existing)creados++;else if(changed)actualizados++;else sinCambios++;
      const linked=await tx.transferenciaConsulta.updateMany({where:{facturadorId:null,OR:[{codigoFacturador:{equals:row.codigo,mode:"insensitive"}},{codigoFacturador:{equals:row.nombre,mode:"insensitive"}}]},data:{facturadorId:profile.id,codigoFacturador:row.codigo}});
      transferenciasVinculadas+=linked.count;
      const returns=await tx.devolucionConsulta.updateMany({where:{responsableId:null,codigoResponsable:{equals:row.codigo,mode:"insensitive"}},data:{responsableId:profile.id}});
      devolucionesVinculadas+=returns.count;
      if(changed)await tx.auditoria.create({data:{entidad:"PerfilLaboral",entidadId:profile.id,accion:existing?"FACTURADOR_ACTUALIZADO":"FACTURADOR_IMPORTADO",origen,motivo:"Catálogo de facturadores desde SQL Server",valorAnterior:existing?{codigo:existing.codigo,nombre:existing.nombre,activo:existing.activo}:undefined,valorNuevo:{codigo:profile.codigo,nombre:profile.nombre,activo:profile.activo}}});
    }
    return {total:rows.length,creados,actualizados,sinCambios,transferenciasVinculadas,devolucionesVinculadas};
  },{timeout:120_000});
}
