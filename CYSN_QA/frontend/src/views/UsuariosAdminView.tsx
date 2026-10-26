import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  actualizarSucursalesUsuarioAdmin,
  actualizarUsuarioAdmin,
  crearUsuarioAdmin,
  obtenerRolesAdmin,
  obtenerSucursalesAdmin,
  obtenerUsuarioAdmin,
  obtenerUsuariosAdmin,
  resetearPasswordUsuarioAdmin,
} from "../services/usuarioAdminService";

import type {
  RolAdmin,
  SucursalAdminCatalogo,
  UsuarioAdmin,
} from "../types/usuarioAdmin";

import "./usuariosAdmin.css";

type EstadoFiltro = "TODOS" | "ACTIVOS" | "INACTIVOS";

interface FormularioNuevoUsuario {
  rol: string;
  username: string;
  nombre: string;
  email: string;
  password: string;
  activo: boolean;
  sucursalIds: number[];
}

const NUEVO_USUARIO_INICIAL: FormularioNuevoUsuario = {
  rol: "SUCURSAL",
  username: "",
  nombre: "",
  email: "",
  password: "",
  activo: true,
  sucursalIds: [],
};

function formatearFecha(valor: string | null): string {
  if (!valor) {
    return "—";
  }

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return valor;
  }

  return fecha.toLocaleString("es-VE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function obtenerMensaje(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado.";
}

export function UsuariosAdminView() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [roles, setRoles] = useState<RolAdmin[]>([]);
  const [sucursales, setSucursales] = useState<SucursalAdminCatalogo[]>([]);

  const [usuarioSeleccionadoId, setUsuarioSeleccionadoId] = useState<number | null>(null);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<UsuarioAdmin | null>(null);

  const [buscar, setBuscar] = useState("");
  const [rolFiltro, setRolFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("TODOS");

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState<FormularioNuevoUsuario>({
    ...NUEVO_USUARIO_INICIAL,
  });

  const [nombreEdicion, setNombreEdicion] = useState("");
  const [emailEdicion, setEmailEdicion] = useState("");
  const [activoEdicion, setActivoEdicion] = useState(true);
  const [sucursalesEdicion, setSucursalesEdicion] = useState<number[]>([]);
  const [buscarSucursal, setBuscarSucursal] = useState("");
  const [nuevaPassword, setNuevaPassword] = useState("");

  const cargarCatalogos = useCallback(async () => {
    const [rolesResultado, sucursalesResultado] = await Promise.all([
      obtenerRolesAdmin(),
      obtenerSucursalesAdmin(),
    ]);

    setRoles(rolesResultado.filter((rol) => rol.activo));
    setSucursales(sucursalesResultado);
  }, []);

  const cargarUsuarios = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const activo = estadoFiltro === "TODOS"
        ? null
        : estadoFiltro === "ACTIVOS";

      const resultado = await obtenerUsuariosAdmin({
        buscar,
        rol: rolFiltro,
        activo,
      });

      setUsuarios(resultado);

      if (
        usuarioSeleccionadoId !== null
        && !resultado.some((usuario) => usuario.user_id === usuarioSeleccionadoId)
      ) {
        setUsuarioSeleccionadoId(null);
        setUsuarioSeleccionado(null);
      }
    } catch (err) {
      setError(obtenerMensaje(err));
    } finally {
      setCargando(false);
    }
  }, [buscar, estadoFiltro, rolFiltro, usuarioSeleccionadoId]);

  const cargarUsuarioDetalle = useCallback(async (usuarioId: number) => {
    setError(null);

    try {
      const usuario = await obtenerUsuarioAdmin(usuarioId);

      setUsuarioSeleccionado(usuario);
      setUsuarioSeleccionadoId(usuario.user_id);
      setNombreEdicion(usuario.nombre);
      setEmailEdicion(usuario.email ?? "");
      setActivoEdicion(usuario.activo);
      setSucursalesEdicion(
        usuario.sucursales.map((sucursal) => sucursal.sucursal_id)
      );
      setNuevaPassword("");
      setBuscarSucursal("");
    } catch (err) {
      setError(obtenerMensaje(err));
    }
  }, []);

  useEffect(() => {
    async function iniciar() {
      try {
        await cargarCatalogos();
      } catch (err) {
        setError(obtenerMensaje(err));
      }
    }

    void iniciar();
  }, [cargarCatalogos]);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      void cargarUsuarios();
    }, 250);

    return () => {
      window.clearTimeout(temporizador);
    };
  }, [cargarUsuarios]);

  const sucursalesFiltradas = useMemo(() => {
    const termino = buscarSucursal.trim().toLowerCase();

    if (!termino) {
      return sucursales;
    }

    return sucursales.filter((sucursal) => {
      return (
        sucursal.sucursal.toLowerCase().includes(termino)
        || sucursal.empresa.toLowerCase().includes(termino)
        || (sucursal.identificador_inventario ?? "").toLowerCase().includes(termino)
      );
    });
  }, [buscarSucursal, sucursales]);

  const sucursalesPorEmpresa = useMemo(() => {
    const grupos = new Map<string, SucursalAdminCatalogo[]>();

    for (const sucursal of sucursalesFiltradas) {
      const existentes = grupos.get(sucursal.empresa) ?? [];
      existentes.push(sucursal);
      grupos.set(sucursal.empresa, existentes);
    }

    return Array.from(grupos.entries());
  }, [sucursalesFiltradas]);

  async function manejarCrearUsuario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      nuevoUsuario.rol === "SUCURSAL"
      && nuevoUsuario.sucursalIds.length === 0
    ) {
      setError("Un usuario SUCURSAL debe tener al menos una sucursal asignada.");
      return;
    }

    setGuardando(true);
    setError(null);
    setMensaje(null);

    try {
      const creado = await crearUsuarioAdmin({
        rol: nuevoUsuario.rol,
        username: nuevoUsuario.username.trim(),
        nombre: nuevoUsuario.nombre.trim(),
        email: nuevoUsuario.email.trim() || null,
        password: nuevoUsuario.password,
        activo: nuevoUsuario.activo,
        sucursal_ids: nuevoUsuario.rol === "SUCURSAL"
          ? nuevoUsuario.sucursalIds
          : [],
      });

      setMostrarNuevo(false);
      setNuevoUsuario({
        ...NUEVO_USUARIO_INICIAL,
      });
      setMensaje(`Usuario ${creado.username} creado correctamente.`);
      await cargarUsuarios();
      await cargarUsuarioDetalle(creado.user_id);
    } catch (err) {
      setError(obtenerMensaje(err));
    } finally {
      setGuardando(false);
    }
  }

  async function manejarGuardarDatos() {
    if (!usuarioSeleccionado) {
      return;
    }

    setGuardando(true);
    setError(null);
    setMensaje(null);

    try {
      const actualizado = await actualizarUsuarioAdmin(
        usuarioSeleccionado.user_id,
        {
          nombre: nombreEdicion.trim(),
          email: emailEdicion.trim() || null,
          activo: activoEdicion,
        }
      );

      setUsuarioSeleccionado(actualizado);
      setMensaje("Datos del usuario actualizados correctamente.");
      await cargarUsuarios();
    } catch (err) {
      setError(obtenerMensaje(err));
    } finally {
      setGuardando(false);
    }
  }

  async function manejarGuardarSucursales() {
    if (!usuarioSeleccionado || usuarioSeleccionado.rol !== "SUCURSAL") {
      return;
    }

    if (sucursalesEdicion.length === 0) {
      setError("Un usuario SUCURSAL debe conservar al menos una sucursal asignada.");
      return;
    }

    setGuardando(true);
    setError(null);
    setMensaje(null);

    try {
      const actualizado = await actualizarSucursalesUsuarioAdmin(
        usuarioSeleccionado.user_id,
        sucursalesEdicion
      );

      setUsuarioSeleccionado(actualizado);
      setSucursalesEdicion(
        actualizado.sucursales.map((sucursal) => sucursal.sucursal_id)
      );
      setMensaje("Sucursales asignadas actualizadas correctamente.");
      await cargarUsuarios();
    } catch (err) {
      setError(obtenerMensaje(err));
    } finally {
      setGuardando(false);
    }
  }

  async function manejarResetPassword() {
    if (!usuarioSeleccionado) {
      return;
    }

    if (nuevaPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setGuardando(true);
    setError(null);
    setMensaje(null);

    try {
      const resultado = await resetearPasswordUsuarioAdmin(
        usuarioSeleccionado.user_id,
        nuevaPassword
      );

      setNuevaPassword("");
      setMensaje(resultado.mensaje);
    } catch (err) {
      setError(obtenerMensaje(err));
    } finally {
      setGuardando(false);
    }
  }

  function alternarSucursalEdicion(sucursalId: number) {
    setSucursalesEdicion((actuales) => {
      return actuales.includes(sucursalId)
        ? actuales.filter((id) => id !== sucursalId)
        : [...actuales, sucursalId];
    });
  }

  function alternarSucursalNuevo(sucursalId: number) {
    setNuevoUsuario((actual) => ({
      ...actual,
      sucursalIds: actual.sucursalIds.includes(sucursalId)
        ? actual.sucursalIds.filter((id) => id !== sucursalId)
        : [...actual.sucursalIds, sucursalId],
    }));
  }

  return (
    <section className="nexo-users-admin-page">
      <div className="nexo-users-admin-header">
        <div>
          <p className="nexo-users-admin-eyebrow">ADMINISTRACIÓN</p>
          <h2>Usuarios</h2>
          <p>
            Gestiona accesos, estado, sucursales asignadas y contraseñas.
          </p>
        </div>

        <button
          type="button"
          className="nexo-users-primary-button"
          onClick={() => {
            setMostrarNuevo((valor) => !valor);
            setError(null);
            setMensaje(null);
          }}
        >
          {mostrarNuevo ? "Cancelar" : "+ Nuevo usuario"}
        </button>
      </div>

      {error && (
        <div className="nexo-users-alert is-error">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="nexo-users-alert is-success">
          {mensaje}
        </div>
      )}

      {mostrarNuevo && (
        <form
          className="nexo-users-create-card"
          onSubmit={manejarCrearUsuario}
        >
          <div className="nexo-users-section-title">
            <div>
              <h3>Crear usuario</h3>
              <p>El username y el rol se definen al crear la cuenta.</p>
            </div>
          </div>

          <div className="nexo-users-form-grid">
            <label>
              <span>Rol</span>
              <select
                value={nuevoUsuario.rol}
                onChange={(event) => {
                  const rol = event.target.value;
                  setNuevoUsuario((actual) => ({
                    ...actual,
                    rol,
                    sucursalIds: rol === "SUCURSAL"
                      ? actual.sucursalIds
                      : [],
                  }));
                }}
              >
                {roles.map((rol) => (
                  <option key={rol.id} value={rol.nombre}>
                    {rol.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Usuario</span>
              <input
                value={nuevoUsuario.username}
                onChange={(event) => {
                  setNuevoUsuario((actual) => ({
                    ...actual,
                    username: event.target.value,
                  }));
                }}
                required
                maxLength={100}
                autoComplete="off"
              />
            </label>

            <label>
              <span>Nombre</span>
              <input
                value={nuevoUsuario.nombre}
                onChange={(event) => {
                  setNuevoUsuario((actual) => ({
                    ...actual,
                    nombre: event.target.value,
                  }));
                }}
                required
                maxLength={180}
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={nuevoUsuario.email}
                onChange={(event) => {
                  setNuevoUsuario((actual) => ({
                    ...actual,
                    email: event.target.value,
                  }));
                }}
                maxLength={180}
              />
            </label>

            <label>
              <span>Contraseña inicial</span>
              <input
                type="password"
                value={nuevoUsuario.password}
                onChange={(event) => {
                  setNuevoUsuario((actual) => ({
                    ...actual,
                    password: event.target.value,
                  }));
                }}
                required
                minLength={8}
                maxLength={255}
                autoComplete="new-password"
              />
            </label>

            <label className="nexo-users-toggle-field">
              <span>Estado</span>
              <span className="nexo-users-checkbox-line">
                <input
                  type="checkbox"
                  checked={nuevoUsuario.activo}
                  onChange={(event) => {
                    setNuevoUsuario((actual) => ({
                      ...actual,
                      activo: event.target.checked,
                    }));
                  }}
                />
                Usuario activo
              </span>
            </label>
          </div>

          {nuevoUsuario.rol === "SUCURSAL" && (
            <div className="nexo-users-branch-box">
              <div className="nexo-users-branch-box-header">
                <div>
                  <strong>Sucursales asignadas</strong>
                  <span>{nuevoUsuario.sucursalIds.length} seleccionada(s)</span>
                </div>
              </div>

              <div className="nexo-users-branch-list compact">
                {sucursales.map((sucursal) => (
                  <label key={sucursal.sucursal_id}>
                    <input
                      type="checkbox"
                      checked={nuevoUsuario.sucursalIds.includes(sucursal.sucursal_id)}
                      onChange={() => alternarSucursalNuevo(sucursal.sucursal_id)}
                    />
                    <span>
                      <strong>{sucursal.sucursal}</strong>
                      <small>{sucursal.empresa}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="nexo-users-actions">
            <button
              type="submit"
              className="nexo-users-primary-button"
              disabled={guardando}
            >
              {guardando ? "Creando..." : "Crear usuario"}
            </button>
          </div>
        </form>
      )}

      <div className="nexo-users-layout">
        <div className="nexo-users-list-card">
          <div className="nexo-users-filter-row">
            <input
              type="search"
              placeholder="Buscar usuario, nombre o email..."
              value={buscar}
              onChange={(event) => setBuscar(event.target.value)}
            />

            <select
              value={rolFiltro}
              onChange={(event) => setRolFiltro(event.target.value)}
            >
              <option value="">Todos los roles</option>
              {roles.map((rol) => (
                <option key={rol.id} value={rol.nombre}>
                  {rol.nombre}
                </option>
              ))}
            </select>

            <select
              value={estadoFiltro}
              onChange={(event) => setEstadoFiltro(event.target.value as EstadoFiltro)}
            >
              <option value="TODOS">Todos los estados</option>
              <option value="ACTIVOS">Activos</option>
              <option value="INACTIVOS">Inactivos</option>
            </select>

            <button
              type="button"
              className="nexo-users-secondary-button"
              onClick={() => void cargarUsuarios()}
              disabled={cargando}
            >
              Actualizar
            </button>
          </div>

          <div className="nexo-users-list-summary">
            <strong>{usuarios.length}</strong>
            <span>usuario(s)</span>
          </div>

          {cargando ? (
            <div className="nexo-users-empty-state">Cargando usuarios...</div>
          ) : usuarios.length === 0 ? (
            <div className="nexo-users-empty-state">No hay usuarios para los filtros seleccionados.</div>
          ) : (
            <div className="nexo-users-table-wrap">
              <table className="nexo-users-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Sucursales</th>
                    <th>Último acceso</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => (
                    <tr
                      key={usuario.user_id}
                      className={usuarioSeleccionadoId === usuario.user_id ? "is-selected" : ""}
                      onClick={() => void cargarUsuarioDetalle(usuario.user_id)}
                    >
                      <td>
                        <strong>{usuario.username}</strong>
                        <span>{usuario.nombre}</span>
                      </td>
                      <td>
                        <span className={`nexo-users-role-badge is-${usuario.rol.toLowerCase()}`}>
                          {usuario.rol}
                        </span>
                      </td>
                      <td>
                        <span className={usuario.activo ? "nexo-users-status is-active" : "nexo-users-status is-inactive"}>
                          {usuario.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>{usuario.total_sucursales}</td>
                      <td>{formatearFecha(usuario.ultimo_login_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="nexo-users-detail-card">
          {!usuarioSeleccionado ? (
            <div className="nexo-users-empty-detail">
              <div className="nexo-users-empty-icon">U</div>
              <h3>Selecciona un usuario</h3>
              <p>Podrás editar sus datos, asignaciones y contraseña.</p>
            </div>
          ) : (
            <>
              <div className="nexo-users-detail-heading">
                <div>
                  <span>USUARIO #{usuarioSeleccionado.user_id}</span>
                  <h3>{usuarioSeleccionado.username}</h3>
                  <p>{usuarioSeleccionado.rol}</p>
                </div>

                <span className={usuarioSeleccionado.activo ? "nexo-users-status is-active" : "nexo-users-status is-inactive"}>
                  {usuarioSeleccionado.activo ? "Activo" : "Inactivo"}
                </span>
              </div>

              <div className="nexo-users-detail-section">
                <h4>Datos generales</h4>

                <label>
                  <span>Nombre</span>
                  <input
                    value={nombreEdicion}
                    onChange={(event) => setNombreEdicion(event.target.value)}
                    maxLength={180}
                  />
                </label>

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={emailEdicion}
                    onChange={(event) => setEmailEdicion(event.target.value)}
                    maxLength={180}
                  />
                </label>

                <label className="nexo-users-checkbox-line">
                  <input
                    type="checkbox"
                    checked={activoEdicion}
                    onChange={(event) => setActivoEdicion(event.target.checked)}
                  />
                  Usuario activo
                </label>

                <button
                  type="button"
                  className="nexo-users-primary-button is-full"
                  disabled={guardando}
                  onClick={() => void manejarGuardarDatos()}
                >
                  Guardar datos
                </button>
              </div>

              {usuarioSeleccionado.rol === "SUCURSAL" && (
                <div className="nexo-users-detail-section">
                  <div className="nexo-users-section-title inline">
                    <div>
                      <h4>Sucursales</h4>
                      <p>{sucursalesEdicion.length} asignada(s)</p>
                    </div>
                  </div>

                  <input
                    type="search"
                    placeholder="Buscar sucursal o empresa..."
                    value={buscarSucursal}
                    onChange={(event) => setBuscarSucursal(event.target.value)}
                  />

                  <div className="nexo-users-branch-list">
                    {sucursalesPorEmpresa.map(([empresa, items]) => (
                      <div className="nexo-users-company-group" key={empresa}>
                        <strong>{empresa}</strong>

                        {items.map((sucursal) => (
                          <label key={sucursal.sucursal_id}>
                            <input
                              type="checkbox"
                              checked={sucursalesEdicion.includes(sucursal.sucursal_id)}
                              onChange={() => alternarSucursalEdicion(sucursal.sucursal_id)}
                            />
                            <span>
                              {sucursal.sucursal}
                              <small>{sucursal.identificador_inventario ?? "Sin identificador"}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="nexo-users-primary-button is-full"
                    disabled={guardando}
                    onClick={() => void manejarGuardarSucursales()}
                  >
                    Guardar sucursales
                  </button>
                </div>
              )}

              <div className="nexo-users-detail-section">
                <h4>Restablecer contraseña</h4>
                <p className="nexo-users-help-text">
                  La nueva contraseña debe tener al menos 8 caracteres.
                </p>

                <input
                  type="password"
                  placeholder="Nueva contraseña"
                  value={nuevaPassword}
                  onChange={(event) => setNuevaPassword(event.target.value)}
                  minLength={8}
                  maxLength={255}
                  autoComplete="new-password"
                />

                <button
                  type="button"
                  className="nexo-users-secondary-button is-full"
                  disabled={guardando || nuevaPassword.length < 8}
                  onClick={() => void manejarResetPassword()}
                >
                  Restablecer contraseña
                </button>
              </div>

              <div className="nexo-users-detail-meta">
                <span>Creado: {formatearFecha(usuarioSeleccionado.created_at)}</span>
                <span>Actualizado: {formatearFecha(usuarioSeleccionado.updated_at)}</span>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
