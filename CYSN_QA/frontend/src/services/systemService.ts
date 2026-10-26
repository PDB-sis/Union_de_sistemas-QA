const API_URL = import.meta.env.VITE_API_URL;


export interface HealthResponse {
    status: string;
    application: string;
    backend: string;
    database: string;
}


export async function obtenerEstadoSistema(): Promise<HealthResponse> {
    const response = await fetch(`${API_URL}/api/health`);

    if (!response.ok) {
        throw new Error("No se pudo conectar con NEXO QA API");
    }

    return response.json();
}