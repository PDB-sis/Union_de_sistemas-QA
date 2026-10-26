export const estiloEncabezadoTabla = {
  position: "sticky" as const,
  top: 0,
  zIndex: 2,
  background: "#f1f5f9",
  borderBottom: "2px solid #cbd5e1",
  borderRight: "1px solid #d7dee8",
  padding: "9px 10px",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
  fontWeight: 600,
};

export const estiloEncabezadoOrdenable = {
  ...estiloEncabezadoTabla,
  cursor: "pointer",
  userSelect: "none" as const,
};

export const estiloCeldaTabla = {
  borderBottom: "1px solid #e2e8f0",
  borderRight: "1px solid #e2e8f0",
  padding: "7px 10px",
  whiteSpace: "nowrap" as const,
};
