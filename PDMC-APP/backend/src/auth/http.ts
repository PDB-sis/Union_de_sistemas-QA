import "server-only";
import { getDb } from "../db";
import { AuthError, AuthService } from "./service";

export function authConfig() {
  const origin = new URL(process.env.PDMC_AUTH_ORIGIN || "http://localhost:3000");
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(origin.hostname))))
    throw new AuthError(503,"CONFIGURACION","Configure un origen HTTPS para acceder desde la red.");
  const secure = origin.protocol === "https:";
  const allowedOrigins = [origin.origin];
  for (const value of (process.env.PDMC_AUTH_ADDITIONAL_ORIGINS || "").split(",").map(value=>value.trim()).filter(Boolean)) {
    let additional: URL;
    try { additional = new URL(value); } catch { throw new AuthError(503,"CONFIGURACION","Revise los orígenes HTTPS adicionales de PDMC."); }
    if (additional.protocol !== "https:" || additional.username || additional.password || additional.pathname !== "/" || additional.search || additional.hash || additional.origin !== value)
      throw new AuthError(503,"CONFIGURACION","Revise los orígenes HTTPS adicionales de PDMC.");
    allowedOrigins.push(additional.origin);
  }
  return {origin:origin.origin,allowedOrigins,secure,cookie:secure?"__Host-pdmc-session":"pdmc-session-local"};
}
export function requireOrigin(request:Request) {
  const {allowedOrigins} = authConfig();
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
    ((request.method !== "GET" || request.headers.has("origin")) && !allowedOrigins.includes(request.headers.get("origin") ?? "")))
    throw new AuthError(403,"ORIGEN","Abra PDMC desde su dirección configurada y vuelva a intentar.");
}
export function requestToken(request:Request) {
  const name = authConfig().cookie;
  const values = (request.headers.get("cookie") ?? "").split(";").map(s=>s.trim()).filter(s=>s.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length+1) : undefined;
}
export function sessionCookie(token:string,seconds:number) {
  const c=authConfig();
  return `${c.cookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${c.secure?"; Secure":""}`;
}
export async function requireApiSession(request:Request,allowTemporary=false) {
  const session = await new AuthService(getDb()).session(requestToken(request));
  if (!session) throw new AuthError(401,"SESION","Inicie sesión para continuar.");
  if (!allowTemporary && session.usuario.debeCambiarPassword) throw new AuthError(403,"CAMBIO_PASSWORD","Debe cambiar su contraseña antes de acceder al panel.");
  return session;
}
