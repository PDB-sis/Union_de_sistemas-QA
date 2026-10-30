import type {Prisma,PrismaClient,TipoUbicacion} from "../../generated/prisma/client";
import {NegativosError,normalizeHeader,parseDelimitedTable} from "../negativos/validation";

// Catálogo de sitios (tiendas y bodegas) desde BODEGA_DATOS.tbDimTiendas.
// La identidad es dimID_Tienda; el Codigo corporativo puede repetirse entre sitios.
// Los sitios que dejan de llegar (la consulta filtra Status = 1) se desactivan.

export const REGION_PENDIENTE={codigo:"SIN-REGION",nombre:"Sin región (pendiente de asignar)"};

type Fila={dimId:number;codigo:string;nombre:string;tipo:TipoUbicacion;activo:boolean};
export type SitioPendiente={dimIdTienda:number;codigo:string;nombre:string;motivo:string};
export type ResumenSitios={total:number;creados:number;enlazados:number;actualizados:number;desactivados:number;pendientes:SitioPendiente[]};

const TIPOS:Record<string,TipoUbicacion>={"0":"BODEGA","1":"TIENDA"};

export function parseSiteCatalog(content:string):Fila[]{
  const [header,...records]=parseDelimitedTable(content);
  const columns=header?.cells.map(normalizeHeader)??[];
  const index=(name:string)=>{const i=columns.indexOf(normalizeHeader(name));if(i<0)throw new NegativosError(422,"ENCABEZADOS","La consulta de sucursales requiere dimID_Tienda, Codigo, Nombre, Status y Tipo.");return i;};
  const [dimIndex,codeIndex,nameIndex,statusIndex,typeIndex]=["dimID_Tienda","Codigo","Nombre","Status","Tipo"].map(index);
  const rows=records.filter(row=>row.cells.some(Boolean)).map(row=>{
    const cell=(i:number)=>row.cells[i]?.trim()??"";
    const dimId=Number(cell(dimIndex)),codigo=cell(codeIndex).toUpperCase(),nombre=cell(nameIndex).replace(/\s+/g," "),tipo=TIPOS[cell(typeIndex)];
    if(!Number.isInteger(dimId)||dimId<=0)throw new NegativosError(422,"FILA",`dimID_Tienda inválido en la fila ${row.fila}.`);
    if(!codigo||codigo.length>60)throw new NegativosError(422,"FILA",`Codigo inválido en la fila ${row.fila}.`);
    if(!nombre||nombre.length>200)throw new NegativosError(422,"FILA",`Nombre inválido en la fila ${row.fila}.`);
    if(!tipo)throw new NegativosError(422,"FILA",`Tipo inválido en la fila ${row.fila}; use 0 (bodega) o 1 (tienda).`);
    return {dimId,codigo,nombre,tipo,activo:cell(statusIndex)==="1"};
  });
  if(!rows.length)throw new NegativosError(422,"SIN_FILAS","La consulta de sucursales no devolvió sitios; no se desactiva el catálogo.");
  if(new Set(rows.map(row=>row.dimId)).size!==rows.length)throw new NegativosError(422,"DUPLICADO","La consulta de sucursales repite un dimID_Tienda.");
  return rows;
}

export async function importStoreCatalog(db:PrismaClient,content:string,origen:string):Promise<ResumenSitios>{
  const rows=parseSiteCatalog(content);
  const repeticiones=new Map<string,number>();for(const row of rows)repeticiones.set(row.codigo,(repeticiones.get(row.codigo)??0)+1);

  return db.$transaction(async tx=>{
    const resumen:ResumenSitios={total:rows.length,creados:0,enlazados:0,actualizados:0,desactivados:0,pendientes:[]};
    const auditar=(entidadId:string,accion:string,valorAnterior:Prisma.InputJsonValue|undefined,valorNuevo:Prisma.InputJsonValue)=>tx.auditoria.create({data:{entidad:"Ubicacion",entidadId,accion,origen,motivo:"Catálogo de sitios BODEGA_DATOS.tbDimTiendas",valorAnterior,valorNuevo}});
    const pendiente=(row:Fila,motivo:string)=>{resumen.pendientes.push({dimIdTienda:row.dimId,codigo:row.codigo,nombre:row.nombre,motivo});};

    const ubicaciones=await tx.ubicacion.findMany({where:{tipo:{in:["TIENDA","BODEGA"]}},include:{tienda:true,bodega:true}});
    const porDim=new Map(ubicaciones.filter(u=>u.dimIdTienda!==null).map(u=>[u.dimIdTienda!,u]));
    const porCodigo=new Map(ubicaciones.map(u=>[u.codigo.toUpperCase(),u]));
    let region=await tx.ubicacion.findUnique({where:{codigo:REGION_PENDIENTE.codigo}});

    for(const row of rows){
      let ubicacion=porDim.get(row.dimId);
      if(!ubicacion){
        const candidata=porCodigo.get(row.codigo);
        if(candidata&&candidata.dimIdTienda===null){
          // Enlace automático solo si el código es inequívoco y del mismo tipo.
          if(repeticiones.get(row.codigo)!==1){pendiente(row,`El código ${row.codigo} se repite en tbDimTiendas; enlazar a mano con "${candidata.nombre}" o crear aparte.`);continue;}
          if(candidata.tipo!==row.tipo){pendiente(row,`El código ${row.codigo} ya existe en PDMC como ${candidata.tipo} ("${candidata.nombre}") y en tbDimTiendas es ${row.tipo}.`);continue;}
          ubicacion=candidata;
        }
      }
      if(ubicacion&&ubicacion.tipo!==row.tipo){pendiente(row,`El sitio enlazado "${ubicacion.nombre}" es ${ubicacion.tipo} y en tbDimTiendas es ${row.tipo}.`);continue;}

      if(!region&&(!ubicacion||!ubicacion.regionId))region=await tx.ubicacion.create({data:{codigo:REGION_PENDIENTE.codigo,nombre:REGION_PENDIENTE.nombre,tipo:"REGION"}});
      const regionId=ubicacion?.regionId??region!.id;

      if(!ubicacion){
        const codigo=repeticiones.get(row.codigo)===1&&!porCodigo.has(row.codigo)?row.codigo:`${row.codigo}-${row.dimId}`;
        if(porCodigo.has(codigo)){pendiente(row,`No se pudo asignar un código PDMC libre (${codigo} ya existe).`);continue;}
        const creada=await tx.ubicacion.create({data:{codigo,nombre:row.nombre,tipo:row.tipo,regionId,dimIdTienda:row.dimId,codigoCorporativo:row.codigo}});
        if(row.tipo==="TIENDA")await tx.tienda.create({data:{codigo,nombre:row.nombre,activa:row.activo,ubicacionId:creada.id}});
        else await tx.bodega.create({data:{codigo,nombre:row.nombre,activa:row.activo,ubicacionId:creada.id}});
        porCodigo.set(codigo,{...creada,tienda:null,bodega:null});
        resumen.creados++;
        await auditar(creada.id,"SITIO_CREADO",undefined,{dimIdTienda:row.dimId,codigo,codigoCorporativo:row.codigo,nombre:row.nombre,tipo:row.tipo,activo:row.activo});
        continue;
      }

      const enlace=ubicacion.dimIdTienda===null;
      const activoAnterior=(row.tipo==="TIENDA"?ubicacion.tienda?.activa:ubicacion.bodega?.activa)??null;
      const cambia=enlace||ubicacion.nombre!==row.nombre||ubicacion.codigoCorporativo!==row.codigo||ubicacion.regionId!==regionId||activoAnterior!==row.activo;
      if(!cambia)continue;
      await tx.ubicacion.update({where:{id:ubicacion.id},data:{nombre:row.nombre,regionId,dimIdTienda:row.dimId,codigoCorporativo:row.codigo}});
      if(row.tipo==="TIENDA")await tx.tienda.upsert({where:{ubicacionId:ubicacion.id},create:{codigo:ubicacion.codigo,nombre:row.nombre,activa:row.activo,ubicacionId:ubicacion.id},update:{nombre:row.nombre,activa:row.activo}});
      else if(ubicacion.bodega)await tx.bodega.update({where:{id:ubicacion.bodega.id},data:{nombre:row.nombre,activa:row.activo}});
      else await tx.bodega.create({data:{codigo:ubicacion.codigo,nombre:row.nombre,activa:row.activo,ubicacionId:ubicacion.id}});
      if(enlace)resumen.enlazados++;else resumen.actualizados++;
      await auditar(ubicacion.id,enlace?"SITIO_ENLAZADO":"SITIO_ACTUALIZADO",{dimIdTienda:ubicacion.dimIdTienda,nombre:ubicacion.nombre,codigoCorporativo:ubicacion.codigoCorporativo,regionId:ubicacion.regionId,activo:activoAnterior},{dimIdTienda:row.dimId,nombre:row.nombre,codigoCorporativo:row.codigo,regionId,activo:row.activo});
    }

    // Sitios enlazados que ya no llegan: la consulta solo trae Status = 1, así que están inactivos.
    const recibidos=new Set(rows.map(row=>row.dimId));
    for(const ubicacion of porDim.values()){
      if(recibidos.has(ubicacion.dimIdTienda!))continue;
      const tienda=ubicacion.tienda?.activa?await tx.tienda.update({where:{id:ubicacion.tienda.id},data:{activa:false}}):null;
      const bodega=ubicacion.bodega?.activa?await tx.bodega.update({where:{id:ubicacion.bodega.id},data:{activa:false}}):null;
      if(!tienda&&!bodega)continue;
      resumen.desactivados++;
      await auditar(ubicacion.id,"SITIO_DESACTIVADO",{activo:true},{activo:false,dimIdTienda:ubicacion.dimIdTienda});
    }
    return resumen;
  },{timeout:120000});
}
