import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { AuthService } from "./service";
import { authConfig } from "./http";
export async function pageSession(allowTemporary=false) {
  const token = (await cookies()).get(authConfig().cookie)?.value;
  const session = await new AuthService(getDb()).session(token);
  if (!session) redirect("/login");
  if (!allowTemporary && session.usuario.debeCambiarPassword) redirect("/cambiar-contrasena");
  return session.usuario;
}
