// La misma identidad se utiliza al importar y al mostrar; nunca convertir a número.
export const productCode = (value: string) => {
  const text=value.trim();
  return text.startsWith('="')&&text.endsWith('"')?text.slice(2,-1).replaceAll('""','"'):text;
};
export const quantityText = (value: string | number | null | undefined, empty = "—") =>
  value == null ? empty : Number(value).toLocaleString("es-VE", { maximumFractionDigits: 0, useGrouping: false });
