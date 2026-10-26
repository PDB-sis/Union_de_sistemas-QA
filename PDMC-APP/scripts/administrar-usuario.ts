import { loadEnvConfig } from "@next/env";
import { getDb } from "../backend/src/db";
import { administerUser } from "../backend/src/auth/provisioning";
import { AuthError } from "../backend/src/auth/service";
loadEnvConfig(process.cwd());
async function main() {
  const db=getDb();
  try {await administerUser(db,process.env);console.info("Operación administrativa registrada. Sesiones anteriores revocadas. No se muestran secretos.");}
  finally {await db.$disconnect();}
}
main().catch(e=>{console.error(e instanceof AuthError?e.message:"Operación no aplicada. Revise variables de entorno y conexión. No se muestran detalles sensibles.");process.exitCode=1;});
