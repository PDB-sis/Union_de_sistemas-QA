import { productCode } from "../../../shared/negativos/presentation";
import { z } from "zod";

export class NegativosError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const uuid = z.string().uuid();
export const importInput = z.object({
  bodegaId: uuid,
  nombreArchivo: z.string().trim().min(1).max(255).regex(/\.(csv|txt)$/i),
  fechaConsulta: z.string(),
  contenido: z.string().max(2_000_000),
}).strict();
export type ImportInput = z.infer<typeof importInput>;
export type RowError = { fila: number; campo: string; mensaje: string };
export type ValidRow = {
  fila: number; codigoBarra: string; existencia: string; originales: Record<string, string>;
  producto: { referencia: string; talla: string; marca: string; codigoMarca: string; descripcion: string; categoria: string; linea: string };
};
export type ValidationSummary = { aceptados: number; rechazados: number; importados: number; errores: RowError[] };

export function parseDate(value: string, now = new Date()): Date {
  // Fecha sin hora = medianoche UTC; con hora exige zona explícita.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})??(?:Z|[+-]\d{2}:\d{2}))??$/.test(value))
    throw new NegativosError(422, "FECHA_INVALIDA", "Use YYYY-MM-DD o fecha ISO con zona horaria.");
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  const result = new Date(value);
  if (year < 2020 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || !Number.isFinite(result.getTime()) || result > now || /T24:/.test(value))
    throw new NegativosError(422, "FECHA_INVALIDA", "Fecha inexistente, futura o anterior a 2020.");
  return result;
}

export const normalizeHeader = (s: string) => s.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalize = normalizeHeader;
const required = ["Estado", "CodigoBarra", "Referencia", "Talla", "NombreMarca", "CodigoMarca", "Descripcion", "Existencia", "CategoriaNombre", "Linea"];

export function parseDelimitedTable(text: string): { fila: number; cells: string[] }[] {
  const source = text.replace(/^\uFEFF/, "");
  const first = source.split(/\r??\n/, 1)[0];
  const delimiter = ["\t", ";", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: { fila: number; cells: string[] }[] = [];
  let cells: string[] = [], cell = "", quoted = false, excel = false, closed = false, structured = false, line = 1, start = 1;
  const fail = () => { throw new NegativosError(422, "CSV_INVALIDO", "Comillas mal formadas.", { fila: line }); };
  const pushCell = () => { cells.push(cell.trim()); cell = ""; closed = false; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; if(excel){cell+='"';excel=false;} }
      } else { cell += c; if (c === "\n") line++; }
    } else if (c === delimiter) { structured = true; pushCell(); }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      pushCell();
      if (structured || cells.some(Boolean)) rows.push({ fila: start, cells });
      cells = []; structured = false; line++; start = line;
    } else if (c === '"') {
      if (cell === "=" && !closed) { cell += '"'; excel = true; quoted = true; structured = true; }
      else if (!cell && !closed) { quoted = true; structured = true; }
      else if (closed) fail();
      else cell += '"';
    }
    else { cell += c; if (closed) closed = false; }
  }
  if (quoted) fail();
  pushCell();
  if (structured || cells.some(Boolean)) rows.push({ fila: start, cells });
  return rows;
}

export function validateFile(contenido: string, fechaConsulta: Date, now = new Date()) {
  if (Buffer.byteLength(contenido, "utf8") > 2_000_000) throw new NegativosError(413, "ARCHIVO_GRANDE", "Máximo 2 MB.");
  if (/[\u0000\uFFFD]/.test(contenido)) throw new NegativosError(422, "CODIFICACION", "El archivo debe ser texto UTF-8 válido.");
  const [header, ...records] = parseDelimitedTable(contenido);
  const headers = header?.cells.map(normalize) ?? [];
  if (new Set(headers).size !== headers.length || headers.some(h => !h) || required.some(h => !headers.includes(normalize(h))))
    throw new NegativosError(422, "ENCABEZADOS", `Encabezados únicos requeridos: ${required.join(", ")}.`);
  if (records.length > 5000) throw new NegativosError(413, "DEMASIADAS_FILAS", "Máximo 5000 filas por consulta.");
  const errors: RowError[] = [], valid: ValidRow[] = [], codes = new Map<string, number[]>();
  for (const { fila, cells } of records) {
    const original = Object.fromEntries(header.cells.map((h, i) => [h.trim(), cells[i] ?? ""]));
    const get = (key: string) => cells[headers.indexOf(normalize(key))] ?? "";
    const error = (campo: string, mensaje: string) => errors.push({ fila, campo, mensaje });
    if (cells.length !== headers.length) error("fila", "Número de columnas distinto al encabezado.");
    const code = productCode(get("CodigoBarra"));
    if (!code || code.length > 128 || /[\x00-\x1f]/.test(code)) error("CodigoBarra", "Código requerido, máximo 128 caracteres, sin controles.");
    const occurrences = codes.get(code) ?? [];
    occurrences.push(fila);
    codes.set(code, occurrences);
    const quantity = get("Existencia").replace(",", ".");
    if (!/^-\d{1,14}(?:\.\d{1,4})??$/.test(quantity) || !/[1-9]/.test(quantity)) error("Existencia", "Debe ser negativa: hasta 14 enteros y 4 decimales, sin miles ni exponentes.");
    for (const [key, max] of [["Referencia", 200], ["Talla", 80], ["NombreMarca", 200], ["CodigoMarca", 80], ["CategoriaNombre", 200], ["Linea", 200], ["Descripcion", 10000], ["Estado", 200]] as const)
      if (get(key).length > max) error(key, `Máximo ${max} caracteres.`);
    if (headers.includes("fechaconsulta")) {
      try { if (parseDate(get("FechaConsulta"), now).getTime() !== fechaConsulta.getTime()) error("FechaConsulta", "No coincide con la fecha de la consulta."); }
      catch { error("FechaConsulta", "Fecha inválida, futura o vacía."); }
    }
    valid.push({ fila, codigoBarra: code, existencia: quantity, originales: original, producto: {
      referencia: get("Referencia"), talla: get("Talla"), marca: get("NombreMarca"), codigoMarca: get("CodigoMarca"),
      descripcion: get("Descripcion"), categoria: get("CategoriaNombre"), linea: get("Linea"),
    } });
  }
  for (const filas of codes.values()) if (filas.length > 1) for (const fila of filas) errors.push({ fila, campo: "CodigoBarra", mensaje: `Código duplicado en filas ${filas.slice(0, 10).join(", ")}${filas.length > 10 ? `… (${filas.length} repeticiones)` : ""}.` });
  const rejected = new Set(errors.map(e => e.fila));
  const rows = valid.filter(r => !rejected.has(r.fila));
  const summary: ValidationSummary = { aceptados: rows.length, rechazados: rejected.size, importados: 0, errores: errors };
  return { rows, summary };
}
