import {loadEnvConfig} from "@next/env";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "../../generated/prisma/client";

loadEnvConfig(process.cwd());

const sourceUrl=process.env.PDMC_SOURCE_DATABASE_URL?.trim();
const destinationUrl=process.env.DATABASE_URL?.trim();
const adminEmail=process.env.PDMC_MIGRATION_ADMIN_EMAIL?.trim().toLowerCase();
if(!sourceUrl||!destinationUrl||!adminEmail)throw new Error("Configure PDMC_SOURCE_DATABASE_URL, DATABASE_URL y PDMC_MIGRATION_ADMIN_EMAIL.");
if(sourceUrl===destinationUrl)throw new Error("La base de origen y la base de destino deben ser diferentes.");

const client=(url:string)=>new PrismaClient({adapter:new PrismaPg({connectionString:url,connectionTimeoutMillis:10_000}),log:[]});
const source=client(sourceUrl),destination=client(destinationUrl);
const AUDITORIA_TECNICA_MIGRACION="RETIRAR_FLUJO_NEGATIVOS_LEGACY";

async function verificarDestinoLimpio(){
  const tablas=await destination.$queryRaw<Array<{tablename:string}>>`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;
  for(const {tablename} of tablas){
    const nombreSeguro=`"${tablename.replaceAll('"','""')}"`;
    const filtro=tablename==="Auditoria"
      ? ` WHERE "accion" <> '${AUDITORIA_TECNICA_MIGRACION}' OR "entidad" <> 'Arquitectura'`
      : "";
    const [{total}]=await destination.$queryRawUnsafe<Array<{total:bigint}>>(
      `SELECT COUNT(*) AS total FROM ${nombreSeguro}${filtro}`,
    );
    if(total!==BigInt(0))throw new Error(`La base de destino contiene datos en ${tablename}. Use una base nueva con unicamente las migraciones aplicadas.`);
  }
  const auditoriasTecnicas=await destination.auditoria.count({
    where:{entidad:"Arquitectura",accion:AUDITORIA_TECNICA_MIGRACION},
  });
  if(auditoriasTecnicas!==1)throw new Error("La base de destino no coincide con una instalacion nueva de PDMC.");
}

async function main(){
  const admin=await source.usuario.findFirst({
    where:{email:{equals:adminEmail,mode:"insensitive"},activo:true,estado:"ACTIVO",passwordHash:{not:null},asignaciones:{some:{rol:"ADMINISTRADOR",ubicacionId:null}}},
    select:{id:true,email:true,nombre:true,activo:true,estado:true,rol:true,passwordHash:true,debeCambiarPassword:true,passwordTemporalHasta:true,passwordChangedAt:true,createdAt:true},
  });
  if(!admin)throw new Error("No existe un administrador activo con contrasena y alcance nacional en la base de origen.");

  await verificarDestinoLimpio();
  await destination.$transaction(async tx=>{
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(210001)::text`;
    await tx.$executeRawUnsafe('TRUNCATE TABLE "Auditoria"');
    await tx.usuario.create({data:{...admin,passwordHash:admin.passwordHash!,asignaciones:{create:{rol:"ADMINISTRADOR",ubicacionId:null}}}});
  },{isolationLevel:"Serializable",timeout:30_000});
  console.info(`Migracion limpia completada. Administrador conservado: ${admin.email}.`);
}

main().catch(error=>{
  console.error(error instanceof Error?error.message:"No se pudo migrar el administrador.");
  process.exitCode=1;
}).finally(async()=>{await Promise.allSettled([source.$disconnect(),destination.$disconnect()]);});
