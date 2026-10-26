import {createServer as httpServer} from "node:http";
import {createServer as httpsServer} from "node:https";
import {readFileSync} from "node:fs";
import nextEnv from "@next/env";
import next from "next";

nextEnv.loadEnvConfig(process.cwd());
async function main() {
  const port=Number(process.env.PORT??3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("PORT inválido.");
  const origin=new URL(process.env.PDMC_AUTH_ORIGIN||`http://localhost:${port}`);
  const secure=origin.protocol==="https:";
  if(origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash||Number(origin.port||(secure?443:80))!==port)throw new Error("PDMC_AUTH_ORIGIN debe coincidir con el puerto y no contener rutas ni credenciales.");
  if(!secure&&(origin.protocol!=="http:"||!["localhost","127.0.0.1"].includes(origin.hostname)))throw new Error("El acceso por red requiere HTTPS.");
  // Child Next server receives the exact public origin; no forwarded-header trust.
  process.env.PDMC_AUTH_ORIGIN=origin.origin;
  const app=next({dev:false,hostname:origin.hostname,port});
  await app.prepare();
  const handler=app.getRequestHandler();
  const server=secure?httpsServer({
    pfx:readFileSync(process.env.PDMC_TLS_PFX_FILE||".secrets/pdmc-lan.pfx"),
    passphrase:readFileSync(process.env.PDMC_TLS_PASSWORD_FILE||".secrets/pdmc-lan-password").toString().trim(),
    minVersion:"TLSv1.2",
  },handler):httpServer(handler);
  server.on("error",()=>{console.error("No se pudo abrir el puerto de PDMC.");process.exitCode=1;void app.close();});
  server.listen(port,secure?"0.0.0.0":"127.0.0.1",()=>console.info(`PDMC listo: ${origin.origin}`));
  const close=()=>server.close(()=>{void app.close().finally(()=>process.exit(0));});
  process.on("SIGINT",close);process.on("SIGTERM",close);
}
main().catch(()=>{console.error("No se pudo iniciar PDMC. Compruebe el build, el puerto, PDMC_AUTH_ORIGIN y los archivos TLS. No se muestran secretos.");process.exitCode=1;});
