const API_URL =
  import.meta.env.VITE_API_URL
  ?? "http://127.0.0.1:8000";

const TOKEN_STORAGE_KEY =
  "nexo_qa_access_token";

export function obtenerToken(): string | null {
  return localStorage.getItem(
    TOKEN_STORAGE_KEY
  );
}

export function guardarToken(
  token: string
): void {
  localStorage.setItem(
    TOKEN_STORAGE_KEY,
    token
  );
}

export function eliminarToken(): void {
  localStorage.removeItem(
    TOKEN_STORAGE_KEY
  );
}

interface ApiRequestOptions
  extends RequestInit {
  auth?: boolean;
}

export async function apiRequest(
  path: string,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const {
    auth = true,
    headers: headersOriginales,
    ...requestInit
  } = options;

  const headers = new Headers(
    headersOriginales
  );

  if (auth) {
    const token = obtenerToken();

    if (token) {
      headers.set(
        "Authorization",
        `Bearer ${token}`
      );
    }
  }

  const url = path.startsWith("http")
    ? path
    : `${API_URL}${path}`;

  const response = await fetch(
    url,
    {
      ...requestInit,
      headers,
    }
  );

  if (
    auth
    && response.status === 401
  ) {
    window.dispatchEvent(
      new Event(
        "nexo-auth-expired"
      )
    );
  }

  return response;
}

export async function obtenerMensajeError(
  response: Response,
  mensajePredeterminado: string
): Promise<string> {
  try {
    const data = await response.json();

    if (
      data
      && typeof data.detail === "string"
    ) {
      return data.detail;
    }
  } catch {
    // La respuesta no contiene JSON utilizable.
  }

  return mensajePredeterminado;
}
