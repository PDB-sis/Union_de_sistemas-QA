export const TIPOS_ERROR=["Faltante físico","Sobrante físico","Código no registrado","Cruce de mercancía","Producto dañado","Producto vencido","Otro"] as const;

export const MOTIVOS=[
  "Diferencia de conteo confirmada",
  "Error de empaque de origen",
  "Producto cruzado o código incorrecto",
  "Mercancía no incluida en la transferencia",
  "Mercancía facturada no recibida",
  "Daño o condición no conforme",
  "No se encontró diferencia",
  "Otro motivo confirmado",
] as const;

export const RESPONSABLES=["SIN_DETERMINAR","FACTURACION","BODEGA","TIENDA","TRANSPORTE","SISTEMA"] as const;
export const RESPONSABLE_LABELS:Record<(typeof RESPONSABLES)[number],string>={SIN_DETERMINAR:"Sin determinar",FACTURACION:"Facturación",BODEGA:"Bodega",TIENDA:"Tienda",TRANSPORTE:"Transporte",SISTEMA:"Sistema / inventario"};

export const FORMAS_CORRECCION=[
  "Ajuste de inventario",
  "Envío de mercancía faltante",
  "Devolución de mercancía sobrante",
  "Corrección de transferencia",
  "Reubicación de mercancía cruzada",
  "Sin corrección: inventario correcto",
  "Pendiente de acción externa",
] as const;

export const TIPOS_AJUSTE=["Positivo","Negativo"] as const;
export const VEREDICTOS=[
  "AJUSTE POSITIVO POR SOBRANTE FÍSICO CONFIRMADO",
  "AJUSTE NEGATIVO POR FALTANTE FÍSICO CONFIRMADO",
] as const;

export const INCONSISTENCY_OPTIONS={tiposError:TIPOS_ERROR,motivos:MOTIVOS,responsables:RESPONSABLES,formasCorreccion:FORMAS_CORRECCION,tiposAjuste:TIPOS_AJUSTE,veredictos:VEREDICTOS};
