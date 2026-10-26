import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  iniciarSesion,
  iniciarSesionDesdePDMC,
  obtenerSucursalesUsuarioActual,
  obtenerUsuarioActual,
} from "../services/authService";

import {
  eliminarToken,
  guardarToken,
  obtenerToken,
} from "../services/apiClient";

import type {
  AuthUser,
  SucursalAsignada,
} from "../types/auth";

interface AuthContextValue {
  usuario: AuthUser | null;
  sucursales: SucursalAsignada[];
  autenticado: boolean;
  cargandoSesion: boolean;
  iniciar: (
    username: string,
    password: string
  ) => Promise<void>;
  cerrar: () => void;
}

const AuthContext =
  createContext<AuthContextValue | null>(
    null
  );

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [usuario, setUsuario] =
    useState<AuthUser | null>(null);

  const [sucursales, setSucursales] =
    useState<SucursalAsignada[]>([]);

  const [cargandoSesion, setCargandoSesion] =
    useState(true);

  const limpiarSesion = useCallback(() => {
    eliminarToken();
    setUsuario(null);
    setSucursales([]);
  }, []);

  const cargarContextoUsuario = useCallback(
    async (): Promise<AuthUser> => {
      const usuarioActual =
        await obtenerUsuarioActual();

      let sucursalesAsignadas:
        SucursalAsignada[] = [];

      if (
        usuarioActual.rol === "SUCURSAL"
      ) {
        sucursalesAsignadas =
          await obtenerSucursalesUsuarioActual();
      }

      setUsuario(
        usuarioActual
      );

      setSucursales(
        sucursalesAsignadas
      );

      return usuarioActual;
    },
    []
  );

  useEffect(() => {
    let activo = true;

    async function restaurarSesion() {
      const assertion = new URLSearchParams(
        window.location.search
      ).get("sso");

      try {
        if (assertion) {
          const resultado = await iniciarSesionDesdePDMC(assertion);
          guardarToken(resultado.access_token);
          window.history.replaceState({}, "", window.location.pathname);
        } else if (!obtenerToken()) {
          return;
        }

        await cargarContextoUsuario();
      } catch {
        if (activo) {
          limpiarSesion();
        }
      } finally {
        if (activo) {
          setCargandoSesion(false);
        }
      }
    }

    restaurarSesion();

    return () => {
      activo = false;
    };
  }, [
    cargarContextoUsuario,
    limpiarSesion,
  ]);

  useEffect(() => {
    function manejarSesionExpirada() {
      limpiarSesion();
    }

    window.addEventListener(
      "nexo-auth-expired",
      manejarSesionExpirada
    );

    return () => {
      window.removeEventListener(
        "nexo-auth-expired",
        manejarSesionExpirada
      );
    };
  }, [limpiarSesion]);

  const iniciar = useCallback(
    async (
      username: string,
      password: string
    ) => {
      const resultado =
        await iniciarSesion(
          username,
          password
        );

      guardarToken(
        resultado.access_token
      );

      try {
        await cargarContextoUsuario();
      } catch (error) {
        limpiarSesion();
        throw error;
      }
    },
    [
      cargarContextoUsuario,
      limpiarSesion,
    ]
  );

  const cerrar = useCallback(() => {
    limpiarSesion();
  }, [limpiarSesion]);

  return (
    <AuthContext.Provider
      value={{
        usuario,
        sucursales,
        autenticado: usuario !== null,
        cargandoSesion,
        iniciar,
        cerrar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(
    AuthContext
  );

  if (!context) {
    throw new Error(
      "useAuth debe utilizarse dentro de AuthProvider."
    );
  }

  return context;
}
