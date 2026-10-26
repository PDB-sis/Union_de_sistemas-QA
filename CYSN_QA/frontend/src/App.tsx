import { useAuth } from "./auth/AuthContext";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { useNexoQaController } from "./hooks/useNexoQaController";
import { ConsultaGeneralView } from "./views/ConsultaGeneralView";
import { DashboardView } from "./views/DashboardView";
import { DiferenciasView } from "./views/DiferenciasView";
import { HistorialView } from "./views/HistorialView";
import {
  AuthLoadingView,
  LoginView,
} from "./views/LoginView";
import { MetricasView } from "./views/MetricasView";
import { PerfilView } from "./views/PerfilView";
import { SucursalWorkspace } from "./views/SucursalWorkspace";
import { UsuariosAdminView } from "./views/UsuariosAdminView";
import { AdminInventariosView } from "./views/AdminInventariosView";
import "./nexo.css";
import "./auth.css";
import "./admin-inventarios.css";

function NexoQaWorkspace() {
  const controller = useNexoQaController();

  return (
    <div
      className={
        controller.sidebarContraido
          ? "nexo-app is-collapsed"
          : "nexo-app"
      }
    >
      <Sidebar controller={controller} />

      <div className="nexo-workspace">
        <Topbar controller={controller} />

        <main className="nexo-content">

          {controller.esVistaDiferencias && (
            <section id="seccion-principal">
              <DiferenciasView controller={controller} />
            </section>
          )}

          {controller.menuActivo === "consulta" && (
            <section id="seccion-principal">
              <ConsultaGeneralView controller={controller} />
            </section>
          )}

          {controller.menuActivo === "metricas" && (
            <section id="seccion-principal">
              <MetricasView controller={controller} />
            </section>
          )}

          {controller.menuActivo === "dashboard" && (
            <section id="seccion-principal">
              <DashboardView controller={controller} />
            </section>
          )}

          {controller.menuActivo === "historial" && (
            <HistorialView controller={controller} />
          )}

          {controller.menuActivo === "inventarios" && (
            <AdminInventariosView />
          )}

          {controller.menuActivo === "usuarios" && (
            <UsuariosAdminView />
          )}

          {controller.menuActivo === "perfil" && (
            <PerfilView />
          )}
        </main>
      </div>
    </div>
  );
}

function RolNoSoportadoView() {
  const { usuario, cerrar } = useAuth();

  return (
    <div className="nexo-role-denied-page">
      <div className="nexo-role-denied-card">
        <div className="nexo-role-denied-mark">NQ</div>

        <h1>Rol sin acceso configurado</h1>

        <p>
          El usuario <strong>{usuario?.username}</strong> tiene el rol
          {" "}<strong>{usuario?.rol}</strong>, pero ese rol todavía no tiene
          una interfaz asignada en NEXO QA.
        </p>

        <button
          type="button"
          className="nexo-role-denied-button"
          onClick={cerrar}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

function AuthenticatedWorkspace() {
  const { usuario } = useAuth();

  if (!usuario) {
    return null;
  }

  if (usuario.rol === "ADMINISTRADOR") {
    return <NexoQaWorkspace />;
  }

  if (usuario.rol === "SUCURSAL") {
    return <SucursalWorkspace />;
  }

  return <RolNoSoportadoView />;
}

function App() {
  const {
    autenticado,
    cargandoSesion,
  } = useAuth();

  if (cargandoSesion) {
    return <AuthLoadingView />;
  }

  if (!autenticado) {
    return <LoginView />;
  }

  return <AuthenticatedWorkspace />;
}

export default App;