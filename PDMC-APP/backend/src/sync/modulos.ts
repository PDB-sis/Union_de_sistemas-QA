import type { PrismaClient } from "../../generated/prisma/client";
import { SystemAuthorization } from "../auth/authorization";
import { COLUMNAS_DEVOLUCIONES, ReturnsService } from "../devoluciones/service";
import { importBillerCatalog } from "../facturacion/catalogo";
import { InventoryService } from "../inventario/service";
import { importStoreCatalog } from "../tienda/catalogo";
import { COLUMNAS_TRANSFERENCIAS, TransferQueryService } from "../transferencias/consulta";
import type { TareaAgente } from "./agente";
import { numberEnv } from "./sqlserver";

export type ModuloId = "SUCURSALES" | "FACTURADORES" | "TRANSFERENCIAS" | "DEVOLUCIONES" | "INVENTARIO";

export type ResultadoImportacion = { sinCambios: boolean; resumen: unknown };

/** Opciones de una ejecución puntual (botón), no de la ejecución automática. */
export type OpcionesEjecucion = {
  /** Solo inventario: publica además la fotografía semanal de negativos (máximo 2 por semana). */
  publicarNegativos?: boolean;
  /** Fuente agente: bodega de la carga (su Ubicacion en el catálogo de sitios). */
  sitio?: { ubicacionId: string; dimIdTienda: number };
};

export type Modulo = {
  id: ModuloId;
  /**
   * De dónde salen los datos. Regla del proyecto: PDMC solo lee de PostgreSQL; los
   * datos de SQL Server llegan por los agentes de cada sitio. La única excepción es
   * el catálogo de sitios (BODEGA_DATOS), que se consulta en SQL Server.
   */
  fuente:
    /** Archivo en backend/sqlserver/consultas: copia de la consulta de consultaPDMC. */
    | { tipo: "SQLSERVER"; consulta: string }
    /** Lo que envían los agentes a agente_fila, convertido a CSV con estas columnas; una carga por bodega. */
    | { tipo: "AGENTE"; tarea: TareaAgente; columnas: readonly string[] }
    /** Inventario que envía el agente del sitio PDMC_INVENTARIO_DIM_ID (cysn_qa.inventario_agente_actual). */
    | { tipo: "AGENTE_INVENTARIO" };
  intervaloSegundos: () => number;
  /**
   * Duración del bloqueo que impide ejecutar el módulo dos veces a la vez. Si el
   * proceso se cierra de golpe, el módulo se reanuda cuando vence: debe superar
   * la ejecución más larga, sin ser excesivo.
   */
  bloqueoMinutos: number;
  /** Catálogos que otros módulos usan para vincular tiendas y facturadores: se ejecutan primero. */
  catalogo: boolean;
  /** Si el resultado es idéntico al último importado, no se vuelve a importar. */
  omitirSiIgual: boolean;
  importar: (db: PrismaClient, csv: string, opciones: OpcionesEjecucion) => Promise<ResultadoImportacion>;
};

const ORIGEN = "SQL_SERVER sincronizacion";
const ORIGEN_AGENTE = "AGENTE sincronizacion";

async function inventoryAuthorization(db: PrismaClient) {
  const email = process.env.PDMC_SYNC_USUARIO_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("Configura PDMC_SYNC_USUARIO_EMAIL: el inventario se importa a nombre de ese usuario.");
  const user = await db.usuario.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error("No existe el usuario " + email + " configurado en PDMC_SYNC_USUARIO_EMAIL.");
  return new SystemAuthorization(db, user.id);
}

export const modulos: readonly Modulo[] = [
  {
    id: "SUCURSALES",
    fuente: { tipo: "SQLSERVER", consulta: "sucursales.sql" },
    intervaloSegundos: () => numberEnv("PDMC_SYNC_SUCURSALES_SEGUNDOS", 3_600, 10, 86_400),
    bloqueoMinutos: 5,
    catalogo: true,
    omitirSiIgual: true,
    importar: async (db, csv) => {
      const resumen = await importStoreCatalog(db, csv, ORIGEN);
      // Los pendientes no cambian datos: se informan en el detalle de la ejecución.
      return { sinCambios: !resumen.creados && !resumen.enlazados && !resumen.actualizados && !resumen.desactivados, resumen };
    },
  },
  {
    id: "FACTURADORES",
    fuente: { tipo: "AGENTE", tarea: "usuarios", columnas: ["CodUsuario", "NombreUsuario"] },
    intervaloSegundos: () => numberEnv("PDMC_SYNC_FACTURADORES_SEGUNDOS", 3_600, 10, 86_400),
    bloqueoMinutos: 5,
    catalogo: true,
    omitirSiIgual: true,
    importar: async (db, csv) => {
      // Los facturadores siguen siendo globales: con una sola bodega no hay códigos repetidos.
      const resumen = await importBillerCatalog(db, csv, ORIGEN_AGENTE);
      return { sinCambios: !resumen.creados && !resumen.actualizados && !resumen.transferenciasVinculadas && !resumen.devolucionesVinculadas, resumen };
    },
  },
  {
    id: "TRANSFERENCIAS",
    fuente: { tipo: "AGENTE", tarea: "transferencias", columnas: COLUMNAS_TRANSFERENCIAS },
    intervaloSegundos: () => numberEnv("PDMC_SYNC_TRANSFERENCIAS_SEGUNDOS", 60, 10, 86_400),
    bloqueoMinutos: 5,
    catalogo: false,
    omitirSiIgual: true,
    importar: async (db, csv, opciones) => {
      const result = await new TransferQueryService(db).import(`agente-transferencias-${opciones.sitio?.dimIdTienda}.csv`, csv, { origen: ORIGEN_AGENTE, reaplicar: true, sitio: opciones.sitio });
      return { sinCambios: result.repetida, resumen: result.resumen };
    },
  },
  {
    id: "DEVOLUCIONES",
    fuente: { tipo: "AGENTE", tarea: "devoluciones", columnas: COLUMNAS_DEVOLUCIONES },
    intervaloSegundos: () => numberEnv("PDMC_SYNC_DEVOLUCIONES_SEGUNDOS", 60, 10, 86_400),
    bloqueoMinutos: 5,
    catalogo: false,
    omitirSiIgual: true,
    importar: async (db, csv, opciones) => {
      const result = await new ReturnsService(db).import(`agente-devoluciones-${opciones.sitio?.dimIdTienda}.csv`, csv, { origen: ORIGEN_AGENTE, reaplicar: true, sitio: opciones.sitio });
      return { sinCambios: result.repetida, resumen: result.resumen };
    },
  },
  {
    id: "INVENTARIO",
    // Fase 2b-1: un solo inventario, el del sitio PDMC_INVENTARIO_DIM_ID; por cada sitio será la 2b-2.
    fuente: { tipo: "AGENTE_INVENTARIO" },
    intervaloSegundos: () => numberEnv("PDMC_SYNC_INVENTARIO_SEGUNDOS", 900, 60, 86_400),
    // Consulta (hasta 5 min) + importación (hasta 10 min).
    bloqueoMinutos: 20,
    catalogo: false,
    // La fotografía de negativos es manual (botón), así que la carga automática
    // puede omitirse cuando el inventario no cambió.
    omitirSiIgual: true,
    importar: async (db, csv, opciones) => {
      const service = new InventoryService(db, await inventoryAuthorization(db));
      const result = await service.import({
        nombreArchivo: `agente-inventario-${opciones.sitio?.dimIdTienda ?? "sqlserver"}.csv`,
        fechaConsulta: new Date().toISOString(),
        contenido: csv,
        publicarNegativos: opciones.publicarNegativos === true,
      });
      return { sinCambios: result.repetida && !opciones.publicarNegativos, resumen: result.resumen };
    },
  },
];

/** Módulos activos según PDMC_SYNC_MODULOS (por defecto, todos). */
export function modulosActivos(): Modulo[] {
  const raw = process.env.PDMC_SYNC_MODULOS?.trim();
  if (!raw) return [...modulos];
  const ids = raw.split(",").map(value => value.trim().toUpperCase()).filter(Boolean);
  const unknown = ids.filter(id => !modulos.some(modulo => modulo.id === id));
  if (unknown.length) throw new Error("PDMC_SYNC_MODULOS contiene modulos desconocidos: " + unknown.join(", ") + ".");
  return modulos.filter(modulo => ids.includes(modulo.id));
}
