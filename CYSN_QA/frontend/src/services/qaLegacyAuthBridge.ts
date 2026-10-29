import {
  obtenerToken,
} from "./apiClient";

const API_URL = (
  import.meta.env.VITE_API_URL
  ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

let instalado = false;

function obtenerUrlPeticion(
  input: RequestInfo | URL
): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function esEndpointQaLegacy(
  input: RequestInfo | URL
): boolean {
  try {
    const apiBase = new URL(
      API_URL,
      window.location.origin
    );

    const urlPeticion = new URL(
      obtenerUrlPeticion(input),
      window.location.origin
    );

    // La API puede publicarse bajo un prefijo (p. ej. https://apiqa.apipalacio.com/qa).
    const prefijo = apiBase.pathname.replace(/\/+$/, "");

    return (
      urlPeticion.origin === apiBase.origin
      && urlPeticion.pathname.startsWith(
        `${prefijo}/api/qa/`
      )
    );
  } catch {
    return false;
  }
}

export function instalarAutenticacionQaLegacy(): void {
  if (instalado) {
    return;
  }

  instalado = true;

  const fetchOriginal =
    window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    if (!esEndpointQaLegacy(input)) {
      return fetchOriginal(
        input,
        init
      );
    }

    const token = obtenerToken();

    if (!token) {
      return fetchOriginal(
        input,
        init
      );
    }

    const headers = new Headers(
      input instanceof Request
        ? input.headers
        : undefined
    );

    if (init?.headers) {
      new Headers(
        init.headers
      ).forEach(
        (valor, clave) => {
          headers.set(
            clave,
            valor
          );
        }
      );
    }

    if (!headers.has("Authorization")) {
      headers.set(
        "Authorization",
        `Bearer ${token}`
      );
    }

    if (input instanceof Request) {
      const requestAutenticado =
        new Request(
          input,
          {
            ...init,
            headers,
          }
        );

      return fetchOriginal(
        requestAutenticado
      );
    }

    return fetchOriginal(
      input,
      {
        ...init,
        headers,
      }
    );
  };
}
