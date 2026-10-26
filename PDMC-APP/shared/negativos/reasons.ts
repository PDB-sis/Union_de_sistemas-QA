export const motivosNegativo = [
  { value: "FACTURACION", label: "Facturación" },
  { value: "ERROR POR INVENTARIO INICIAL", label: "Error por inventario inicial" },
  { value: "MAL AJUSTADO ANTERIORMENTE", label: "Mal ajustado anteriormente" },
  { value: "CRUCE", label: "Cruce" },
  { value: "MERCANCIA DE MAS EN BULTO", label: "Mercancía de más en bulto" },
  { value: "ROTACION", label: "Rotación" },
] as const;

export type MotivoNegativo = (typeof motivosNegativo)[number]["value"];

export const detallePorMotivo: Partial<Record<MotivoNegativo, { label: string; placeholder: string }>> = {
  FACTURACION: { label: "Número de transferencia", placeholder: "Ej. 81880" },
  "MAL AJUSTADO ANTERIORMENTE": { label: "Número del ajuste anterior", placeholder: "Ingrese el ajuste que originó el error" },
  CRUCE: { label: "Código de barra con el que se cruzó", placeholder: "Escanee o escriba el código de barra" },
};

export function esMotivoNegativo(value: string): value is MotivoNegativo {
  return motivosNegativo.some((item) => item.value === value);
}

export function validarMotivoNegativo(motivo: string, detalle: string, motivoAnterior = "") {
  if (!motivo) return null;
  if (!esMotivoNegativo(motivo)) {
    return motivo === motivoAnterior ? null : "Seleccione uno de los motivos disponibles.";
  }
  const requerido = detallePorMotivo[motivo];
  if (requerido && !detalle.trim()) return `${requerido.label} es obligatorio para este motivo.`;
  if (!requerido && detalle.trim()) return "Este motivo no requiere un documento relacionado.";
  return null;
}
