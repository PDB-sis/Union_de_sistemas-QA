import { useAuth } from "../auth/AuthContext";
import type { NexoQaController } from "../hooks/useNexoQaController";

interface TopbarProps {
  controller: NexoQaController;
}

export function Topbar({ controller }: TopbarProps) {
  const {
    sidebarContraido,
    setSidebarContraido,
    estadoSistema,
  } = controller;

  const {
    usuario,
    cerrar,
  } = useAuth();

  return (
    <header className="nexo-topbar">
      <div className="nexo-topbar-left">
        <button
          type="button"
          className="nexo-menu-symbol"
          onClick={() =>
            setSidebarContraido(
              (valor) => !valor
            )
          }
          aria-label={
            sidebarContraido
              ? "Expandir menú lateral"
              : "Contraer menú lateral"
          }
          title={
            sidebarContraido
              ? "Expandir menú lateral"
              : "Contraer menú lateral"
          }
        >
          ☰
        </button>

        <div>
          <h1>
            NEXO QA
          </h1>

          <p>
            Visor QA de Precio Detal
          </p>
        </div>
      </div>

      <div className="nexo-topbar-right">
        <div className="nexo-topbar-status">
          <div className="nexo-status-item">
            <span
              className="nexo-status-dot is-online"
            />

            Frontend
          </div>

          <div className="nexo-status-item">
            <span
              className={
                estadoSistema?.backend
                === "connected"
                  ? "nexo-status-dot is-online"
                  : "nexo-status-dot"
              }
            />

            API
          </div>

          <div className="nexo-status-item">
            <span
              className={
                estadoSistema?.database
                === "connected"
                  ? "nexo-status-dot is-online"
                  : "nexo-status-dot"
              }
            />

            PostgreSQL
          </div>
        </div>

        <div className="nexo-topbar-auth">
          {usuario && (
            <div className="nexo-topbar-user">
              <strong title={usuario.nombre}>
                {usuario.nombre}
              </strong>

              <span>
                {usuario.rol}
              </span>
            </div>
          )}

          <button
            type="button"
            className="nexo-logout-button"
            onClick={cerrar}
            title="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
