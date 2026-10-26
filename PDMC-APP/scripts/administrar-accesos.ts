import { loadEnvConfig } from "@next/env";
import { getDb } from "../backend/src/db";
import { manageAccess, manageLocation } from "../backend/src/auth/access-management";
import { AuthError } from "../backend/src/auth/service";
loadEnvConfig(process.cwd());
async function main() {
  const db=getDb();
  try {
    if(Boolean(process.env.PDMC_UBICACION)===Boolean(process.env.PDMC_ACCESO_ASIGNACIONES))throw new AuthError(422,"OPERACION","Configure una ubicación o asignaciones, una operación a la vez.");
    const result=process.env.PDMC_UBICACION?await manageLocation(db,process.env):await manageAccess(db,process.env);
    console.info("Operación completada:",result);
  } finally {await db.$disconnect();}
}
main().catch(e=>{console.error(e instanceof AuthError?e.message:"Operación no aplicada. Revise el JSON, las variables y la conexión.");process.exitCode=1;});
