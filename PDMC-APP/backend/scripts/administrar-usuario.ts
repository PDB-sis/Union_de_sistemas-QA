import { loadEnv } from "../src/env";
import { getDb } from "../src/db";
import { administerUser } from "../src/auth/provisioning";
import { AuthError } from "../src/auth/service";
loadEnv();
async function main() {
  const db=getDb();
  try {await administerUser(db,process.env);console.info("Operación administrativa registrada. Sesiones anteriores revocadas. No se muestran secretos.");}
  finally {await db.$disconnect();}
}
main().catch(e=>{console.error(e instanceof AuthError?e.message:"Operación no aplicada. Revise variables de entorno y conexión. No se muestran detalles sensibles.");process.exitCode=1;});
