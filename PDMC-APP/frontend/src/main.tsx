import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "@/styles/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Cargando, useTitulo } from "@/pages/estado-carga";

// Cada espacio se carga aparte: entrar a la tienda no descarga el panel de administración.
const Inicio = lazy(() => import("@/pages/inicio"));
const Tienda = lazy(() => import("@/pages/tienda"));
const Administracion = lazy(() => import("@/pages/administracion"));
const Login = lazy(() => import("@/pages/login"));
const CambiarContrasena = lazy(() => import("@/pages/cambiar-contrasena"));

function NoEncontrada() {
  useTitulo("Página no encontrada");
  return <main className="grid min-h-dvh place-items-center p-6 text-center">
    <div className="grid gap-3"><p className="text-lg font-bold">Esta página no existe</p><Link to="/" className="font-semibold text-primary">Volver al panel</Link></div>
  </main>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<Cargando />}>
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/tienda" element={<Tienda />} />
            <Route path="/administracion" element={<Administracion />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cambiar-contrasena" element={<CambiarContrasena />} />
            <Route path="*" element={<NoEncontrada />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
