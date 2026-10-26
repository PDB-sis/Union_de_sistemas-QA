// Adaptador Next.js: la implementación HTTP pertenece al backend.
export const runtime="nodejs";
export const dynamic="force-dynamic";
export {GET,POST,PATCH} from "@backend-http/inconsistencias/route";
