export type Comparison = "Nuevo" | "Sin cambio" | "Mejoró" | "Empeoró" | "Desapareció";
export type ComparisonSummary = Record<Comparison, number>;
export const emptyComparison = (): ComparisonSummary => ({ Nuevo: 0, "Sin cambio": 0, "Mejoró": 0, "Empeoró": 0, "Desapareció": 0 });
// DECIMAL(18,4) sin pérdida de precisión de Number.
const scaled = (value: string) => {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer) * BigInt(10000) - BigInt(fraction.padEnd(4, "0"));
};
export function compare(previous: string | null, current: string | null): Comparison {
  if (current === null) return "Desapareció";
  if (previous === null) return "Nuevo";
  const difference = scaled(current) - scaled(previous);
  return difference === BigInt(0) ? "Sin cambio" : difference > BigInt(0) ? "Mejoró" : "Empeoró";
}
