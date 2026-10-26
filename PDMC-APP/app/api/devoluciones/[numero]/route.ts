// Adaptador Next.js: la implementación HTTP pertenece al backend.
export const runtime="nodejs";
export const dynamic="force-dynamic";
export {GET} from "@backend-http/devoluciones/[numero]/route";
