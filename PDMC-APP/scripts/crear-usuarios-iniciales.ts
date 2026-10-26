import { loadEnvConfig } from "@next/env";
import { getDb } from "../backend/src/db";
import { provisionUsers } from "../backend/src/auth/provisioning";
import { AuthError } from "../backend/src/auth/service";
loadEnvConfig(process.cwd());
async function main() {
  const db=getDb();
  try {
    const result=await provisionUsers(db,process.env);
    console.info(`Cuentas creadas: ${result.creados}. Cuentas existentes conservadas: ${result.existentes}.`);
    console.info("Las contraseñas temporales vencen en 48 horas y deben cambiarse al ingresar. No se muestran secretos.");
  } finally {await db.$disconnect();}
}
main().catch(e=>{console.error(e instanceof AuthError?e.message:"No se crearon cuentas. Revise las variables de entorno, sus formatos y la conexión; las contraseñas deben tener entre 12 y 128 caracteres.");process.exitCode=1;});
