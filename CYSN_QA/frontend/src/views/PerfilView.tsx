import {
  type FormEvent,
  useState,
} from "react";

import { useAuth } from "../auth/AuthContext";
import { cambiarPasswordUsuarioActual } from "../services/authService";
import "./perfil.css";

export function PerfilView() {
  const {
    usuario,
    sucursales,
  } = useAuth();

  const [passwordActual, setPasswordActual] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (!usuario) {
    return null;
  }

  const manejarCambioPassword = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    setError(null);
    setMensaje(null);

    if (!passwordActual) {
      setError("Ingresa tu contraseña actual.");
      return;
    }

    if (nuevaPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    setGuardando(true);

    try {
      const resultado = await cambiarPasswordUsuarioActual(
        passwordActual,
        nuevaPassword
      );

      setPasswordActual("");
      setNuevaPassword("");
      setConfirmarPassword("");
      setMensaje(resultado.mensaje);
    } catch (errorCambio) {
      setError(
        errorCambio instanceof Error
          ? errorCambio.message
          : "No se pudo cambiar la contraseña."
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="nexo-profile-page">
      <div className="nexo-profile-heading">
        <div>
          <span className="nexo-profile-eyebrow">MI CUENTA</span>
          <h2>Mi perfil</h2>
          <p>
            Consulta los datos de tu cuenta y administra tu contraseña de acceso.
          </p>
        </div>

        <span className="nexo-profile-role-badge">
          {usuario.rol}
        </span>
      </div>

      <div className="nexo-profile-grid">
        <article className="nexo-profile-card">
          <div className="nexo-profile-card-header">
            <div>
              <span>CUENTA</span>
              <h3>Información del usuario</h3>
            </div>
          </div>

          <dl className="nexo-profile-data-list">
            <div>
              <dt>Nombre</dt>
              <dd>{usuario.nombre}</dd>
            </div>

            <div>
              <dt>Usuario</dt>
              <dd>{usuario.username}</dd>
            </div>

            <div>
              <dt>Correo</dt>
              <dd>{usuario.email || "No registrado"}</dd>
            </div>

            <div>
              <dt>Rol</dt>
              <dd>{usuario.rol}</dd>
            </div>

            <div>
              <dt>Estado</dt>
              <dd>{usuario.activo ? "Activo" : "Inactivo"}</dd>
            </div>
          </dl>

          {usuario.rol === "SUCURSAL" && (
            <div className="nexo-profile-branches">
              <div className="nexo-profile-section-title">
                Sucursales asignadas
              </div>

              {sucursales.length === 0 ? (
                <p className="nexo-profile-empty">
                  No tienes sucursales asignadas.
                </p>
              ) : (
                <div className="nexo-profile-branch-list">
                  {sucursales.map((sucursal) => (
                    <div
                      key={sucursal.sucursal_id}
                      className="nexo-profile-branch-item"
                    >
                      <strong>{sucursal.sucursal}</strong>
                      <span>{sucursal.empresa}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </article>

        <article className="nexo-profile-card">
          <div className="nexo-profile-card-header">
            <div>
              <span>SEGURIDAD</span>
              <h3>Cambiar contraseña</h3>
            </div>
          </div>

          <form
            className="nexo-profile-password-form"
            onSubmit={manejarCambioPassword}
          >
            <label>
              <span>Contraseña actual</span>
              <input
                type="password"
                autoComplete="current-password"
                value={passwordActual}
                onChange={(event) => setPasswordActual(event.target.value)}
                disabled={guardando}
              />
            </label>

            <label>
              <span>Nueva contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={nuevaPassword}
                onChange={(event) => setNuevaPassword(event.target.value)}
                disabled={guardando}
                minLength={8}
              />
            </label>

            <label>
              <span>Confirmar nueva contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmarPassword}
                onChange={(event) => setConfirmarPassword(event.target.value)}
                disabled={guardando}
                minLength={8}
              />
            </label>

            <p className="nexo-profile-password-help">
              La nueva contraseña debe tener al menos 8 caracteres y ser diferente de la actual.
            </p>

            {error && (
              <div className="nexo-profile-message is-error">
                {error}
              </div>
            )}

            {mensaje && (
              <div className="nexo-profile-message is-success">
                {mensaje}
              </div>
            )}

            <div className="nexo-profile-actions">
              <button
                type="submit"
                className="nexo-profile-primary-button"
                disabled={
                  guardando
                  || !passwordActual
                  || !nuevaPassword
                  || !confirmarPassword
                }
              >
                {guardando
                  ? "Guardando..."
                  : "Cambiar contraseña"}
              </button>
            </div>
          </form>
        </article>
      </div>
    </section>
  );
}
