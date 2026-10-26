import type {
    QAImportacionResultado,
    QAValidacionArchivo,
} from "../types/qa";


const API_URL = import.meta.env.VITE_API_URL;


// ============================================================
// VALIDAR ARCHIVO
// ============================================================

export async function validarArchivoQA(
    archivo: File
): Promise<QAValidacionArchivo> {

    const formData = new FormData();

formData.append(
    "archivo",
    archivo
);


const response = await fetch(
    `${API_URL}/api/qa/importar/validar`,
    {
        method: "POST",
        body: formData,
    }
);


if (!response.ok) {

    const error = await response.json();

    throw new Error(
        error.detail ??
        "No se pudo validar el archivo QA."
    );
}


    return response.json();
}


// ============================================================
// IMPORTAR ARCHIVO
// ============================================================

export interface QAImportacionDatos {
    nombre_ejecucion: string;
    fecha_referencia: string | null;
    descripcion: string | null;
}


export async function importarArchivoQA(
    archivo: File,
    datos: QAImportacionDatos
): Promise<QAImportacionResultado> {

    const formData = new FormData();


formData.append(
    "archivo",
    archivo
);


formData.append(
    "nombre_ejecucion",
    datos.nombre_ejecucion
);


if (datos.fecha_referencia) {

    formData.append(
        "fecha_referencia",
        datos.fecha_referencia
    );
}


    if (datos.descripcion) {

    formData.append(
        "descripcion",
        datos.descripcion
    );
}


const response = await fetch(
    `${API_URL}/api/qa/importar`,
    {
        method: "POST",
        body: formData,
    }
);


    if (!response.ok) {

    const error = await response.json();

    throw new Error(
        error.detail ??
        "No se pudo importar el archivo QA."
    );
}


    return response.json();
}