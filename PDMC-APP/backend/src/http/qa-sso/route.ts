import {createHmac,randomUUID} from "node:crypto";

import {requireApiSession} from "@backend/auth/http";

const allowed=new Set(["ADMINISTRADOR","MEJORA_CONTINUA"]),lifetime=60;
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
function configuration(){const secret=process.env.PDMC_QA_SSO_SECRET;if(!secret||secret.length<32)throw new Error("PDMC_QA_SSO_SECRET no esta configurado.");const destination=new URL(process.env.PDMC_QA_SSO_DESTINATION??"http://localhost:5173");if(destination.username||destination.password||destination.pathname!=="/"||destination.search||destination.hash)throw new Error("PDMC_QA_SSO_DESTINATION debe ser un origen sin ruta.");return {secret,destination};}
export async function GET(request:Request){try{const user=(await requireApiSession(request)).usuario;if(!allowed.has(user.rol))return Response.json({detail:"Su rol no tiene acceso a QA."},{status:403});const {secret,destination}=configuration(),issuedAt=Math.floor(Date.now()/1000),header=encode({alg:"HS256",typ:"JWT"}),payload=encode({iss:"pdmc-app",aud:"cysn-qa",typ:"pdmc_sso",sub:user.id,email:user.email,nombre:user.nombre,rol:user.rol,jti:randomUUID(),iat:issuedAt,exp:issuedAt+lifetime}),signature=createHmac("sha256",secret).update(`${header}.${payload}`).digest("base64url"),redirect=new URL(destination);redirect.searchParams.set("sso",`${header}.${payload}.${signature}`);return Response.redirect(redirect.toString(),307);}catch{return Response.json({detail:"No se pudo iniciar el acceso único a QA."},{status:401});}}
