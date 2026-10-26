import {
  type FormEvent,
  useState,
} from "react";

import { useAuth } from "../auth/AuthContext";

export function LoginView() {
  const { iniciar } = useAuth();

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [enviando, setEnviando] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  async function manejarSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const usuarioLimpio =
      username.trim();

    if (
      !usuarioLimpio
      || !password
    ) {
      setError(
        "Ingresa el usuario y la contraseña."
      );

      return;
    }

    try {
      setEnviando(true);
      setError(null);

      await iniciar(
        usuarioLimpio,
        password
      );
    } catch (error) {
      if (error instanceof Error) {
        setError(
          error.message
        );
      } else {
        setError(
          "No se pudo iniciar sesión."
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="nexo-login-page">
      <div className="nexo-login-shell">
        <section className="nexo-login-brand-panel">
          <div className="nexo-login-brand-mark">
            NQ
          </div>

          <div>
            <span className="nexo-login-eyebrow">
              NEXO QA
            </span>

            <h1>
              Inspección de Diferencias.
            </h1>

            <p>
              Accede al Visor QA de Precio Detal con tu usuario asignado.
            </p>
          </div>
        </section>

        <section className="nexo-login-form-panel">
          <div className="nexo-login-form-header">
            <span className="nexo-login-mobile-logo">
              NQ
            </span>

            <div>
              <h2>
                Iniciar sesión
              </h2>

              <p>
                Ingresa tus credenciales para continuar.
              </p>
            </div>
          </div>

          <form
            className="nexo-login-form"
            onSubmit={manejarSubmit}
          >
            <div className="nexo-login-field">
              <label htmlFor="nexo-login-username">
                Usuario
              </label>

              <input
                id="nexo-login-username"
                type="text"
                value={username}
                onChange={(event) =>
                  setUsername(
                    event.target.value
                  )
                }
                autoComplete="username"
                autoFocus
                disabled={enviando}
                placeholder="Ingresa tu usuario"
              />
            </div>

            <div className="nexo-login-field">
              <label htmlFor="nexo-login-password">
                Contraseña
              </label>

              <input
                id="nexo-login-password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value
                  )
                }
                autoComplete="current-password"
                disabled={enviando}
                placeholder="Ingresa tu contraseña"
              />
            </div>

            {error && (
              <div
                className="nexo-login-error"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="nexo-login-submit"
              disabled={enviando}
            >
              {enviando
                ? "Ingresando..."
                : "Iniciar sesión"}
            </button>
          </form>

          <p className="nexo-login-help">
            El acceso y las funciones disponibles dependen del rol asignado a tu usuario.
          </p>
        </section>
      </div>
    </div>
  );
}

export function AuthLoadingView() {
  return (
    <div className="nexo-auth-loading">
      <div className="nexo-auth-loading-mark">
        NQ
      </div>

      <span>
        Validando sesión...
      </span>
    </div>
  );
}
