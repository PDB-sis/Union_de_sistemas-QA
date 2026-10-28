import type { SVGProps } from "react";

// Íconos propios de los módulos de PDMC. Siguen el lenguaje del logotipo: trazo redondeado
// de 1.8 y una zona rellena en tono suave (duotono) con el color del texto.
export type ModuleIcon = (props: SVGProps<SVGSVGElement>) => React.JSX.Element;

const svg = (props: SVGProps<SVGSVGElement>) => ({
  width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...props,
});
const tono = { fill: "currentColor", stroke: "none", opacity: 0.22 };

/** Mi día: hoja de la jornada con el sol saliendo. */
export const IconoMiDia: ModuleIcon = props => <svg {...svg(props)}>
  <path {...tono} d="M4 15h16v2a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
  <rect x="4" y="5" width="16" height="15" rx="3" />
  <path d="M8.5 3v3.5M15.5 3v3.5M4 15h16M9 15a3 3 0 0 1 6 0M12 9.6v.9M8.2 11.3l.6.6M15.8 11.3l-.6.6" />
</svg>;

/** Métricas: barras con el ciclo de mejora encima. */
export const IconoMetricas: ModuleIcon = props => <svg {...svg(props)}>
  <path {...tono} d="M10.4 20v-7.5a1.6 1.6 0 0 1 3.2 0V20z" />
  <path d="M3.5 20.5h17M6.5 20v-4M12 20v-7.5M17.5 20v-5.5" strokeWidth={2.4} />
  <path d="M5.2 9.2A7 7 0 0 1 17 5.6M17.4 2.9l.2 2.9-2.9.3" />
</svg>;

/** QA: lupa de inspección con la marca de aprobado. */
export const IconoQA: ModuleIcon = props => <svg {...svg(props)}>
  <circle {...tono} cx="10.5" cy="10.5" r="6.5" />
  <circle cx="10.5" cy="10.5" r="6.5" />
  <path d="M7.8 10.6l1.9 1.9 3.6-3.8M15.4 15.4 20 20" />
  <path d="M15.4 15.4 20 20" strokeWidth={2.6} />
</svg>;

/** Transferencias: de la caja de bodega a la tienda. */
export const IconoTransferencias: ModuleIcon = props => <svg {...svg(props)}>
  <rect {...tono} x="3" y="12" width="8" height="8" rx="1.5" />
  <rect x="3" y="12" width="8" height="8" rx="1.5" />
  <path d="M7 12v2.6M14 20v-4.6l3.5-3 3.5 3V20zM16.3 20v-2.4h2.4V20" />
  <path d="M7 10V8.5a4 4 0 0 1 4-4h2.5a4 4 0 0 1 4 4V9.6M15.6 7.8l1.9 1.9 1.9-1.9" />
</svg>;

/** Devoluciones: la caja vuelve a la bodega. */
export const IconoDevoluciones: ModuleIcon = props => <svg {...svg(props)}>
  <rect {...tono} x="3.5" y="11" width="10" height="9" rx="1.6" />
  <rect x="3.5" y="11" width="10" height="9" rx="1.6" />
  <path d="M3.5 14.2h10M8.5 11v3.2" />
  <path d="M20.5 15V9.5a4 4 0 0 0-4-4H8.8M11 3.2 8.7 5.5 11 7.8" />
</svg>;

/** Inconsistencias: código de barras con una barra que no cuadra. */
export const IconoInconsistencias: ModuleIcon = props => <svg {...svg(props)}>
  <path {...tono} d="M18 12.2 21.6 16 18 19.8 14.4 16z" />
  <path d="M3.5 5v14M6.5 5v14M9.5 5v7.5M9.5 15v4M12.5 5v6" strokeWidth={1.9} />
  <path d="M18 12.2 21.6 16 18 19.8 14.4 16zM18 14.6v1.6M18 17.9h.01M15.5 5H17a1.5 1.5 0 0 1 1.5 1.5V9" />
</svg>;

/** Negativos: exhibidor de existencias que marca un número negativo. */
export const IconoNegativos: ModuleIcon = props => <svg {...svg(props)}>
  <rect {...tono} x="3" y="4" width="18" height="11" rx="2.5" />
  <rect x="3" y="4" width="18" height="11" rx="2.5" />
  <path d="M7 9.5h4M15.2 7.3l1.3-1v6.4" strokeWidth={2} />
  <path d="M6.5 15v4.5M17.5 15v4.5M4 19.5h16" />
</svg>;

/** Facturación: factura con borde dentado y renglón observado. */
export const IconoFacturacion: ModuleIcon = props => <svg {...svg(props)}>
  <path {...tono} d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
  <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
  <path d="M9 7.5h6M9 11h3.5M9 14.5h6" />
  <circle cx="15" cy="11" r=".9" fill="currentColor" stroke="none" />
</svg>;

/** Carga de inventario: cajas sobre la tarima con la flecha de entrada. */
export const IconoInventario: ModuleIcon = props => <svg {...svg(props)}>
  <rect {...tono} x="3.5" y="12.5" width="7.5" height="6.5" rx="1.3" />
  <rect x="3.5" y="12.5" width="7.5" height="6.5" rx="1.3" />
  <rect x="13" y="12.5" width="7.5" height="6.5" rx="1.3" />
  <path d="M2.5 21.5h19M12 2.8v6.4M9.4 6.8 12 9.4l2.6-2.6" />
</svg>;

/** Proyectos: bandera de meta al final de un recorrido. */
export const IconoProyectos: ModuleIcon = props => <svg {...svg(props)}>
  <path {...tono} d="M7 4h10.5l-2 3.5 2 3.5H7z" />
  <path d="M7 21V3.5M7 4h10.5l-2 3.5 2 3.5H7" />
  <path d="M11 18.5h.01M14.5 17h.01M18 15h.01" strokeWidth={2.4} />
</svg>;

/** Auditoría: sello de revisión. */
export const IconoAuditoria: ModuleIcon = props => <svg {...svg(props)}>
  <path {...tono} d="M5 13.5h14v3.2H5z" />
  <path d="M9.8 4.8a2.2 2.2 0 1 1 4.4 0c0 2.2-1.2 3.4-1.2 5.7h-2c0-2.3-1.2-3.5-1.2-5.7zM6.5 10.5h11A1.5 1.5 0 0 1 19 12v4.7H5V12a1.5 1.5 0 0 1 1.5-1.5zM5 20.5h14" />
</svg>;

/** Inicio de administración: el ciclo del logotipo. */
export const IconoInicio: ModuleIcon = props => <svg {...svg(props)}>
  <circle {...tono} cx="12" cy="12.5" r="7.5" />
  <path d="M17.6 7.4A7.5 7.5 0 1 1 11 5.1M10.1 2.7l2.4 2.1-2.1 2.4M8.9 12.6l2.2 2.2 4.2-4.4" />
</svg>;

/** Usuarios: credencial con foto. */
export const IconoUsuarios: ModuleIcon = props => <svg {...svg(props)}>
  <path {...tono} d="M4.5 15h15v3a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3z" />
  <rect x="4.5" y="3.5" width="15" height="17.5" rx="3" />
  <path d="M10 3.5v2h4v-2" />
  <circle cx="12" cy="10.5" r="2.4" />
  <path d="M8 17a4 4 0 0 1 8 0" />
</svg>;

/** Regiones y entidades: tiendas y bodegas conectadas en la red. */
export const IconoRegiones: ModuleIcon = props => <svg {...svg(props)}>
  <circle {...tono} cx="12" cy="18" r="3" />
  <circle cx="6" cy="6.5" r="2.5" />
  <circle cx="18" cy="6.5" r="2.5" />
  <circle cx="12" cy="18" r="3" />
  <path d="M8.5 6.5h7M7.3 8.7l3.4 6.6M16.7 8.7l-3.4 6.6" />
</svg>;

/** Restablecer: base de datos con el ciclo de recuperación. */
export const IconoRestablecer: ModuleIcon = props => <svg {...svg(props)}>
  <ellipse {...tono} cx="11" cy="6" rx="7" ry="3" />
  <ellipse cx="11" cy="6" rx="7" ry="3" />
  <path d="M4 6v6c0 1.5 2.6 2.8 6 3M18 6v3.5M4 12v5c0 1.5 2.6 2.8 6 3" />
  <path d="M20.5 16a3.5 3.5 0 1 1-1-2.5M19.8 11.2v2.6h-2.6" />
</svg>;

/** Mi cuenta: persona dentro del círculo de la sesión. */
export const IconoCuenta: ModuleIcon = props => <svg {...svg(props)}>
  <circle {...tono} cx="12" cy="12" r="9" />
  <circle cx="12" cy="12" r="9" />
  <circle cx="12" cy="10" r="3" />
  <path d="M6.6 18.2a6 6 0 0 1 10.8 0" />
</svg>;
