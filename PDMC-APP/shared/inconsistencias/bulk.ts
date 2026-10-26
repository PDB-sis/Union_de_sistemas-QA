import {z} from "zod";
import {canonicalOption} from "./option-value";
import {FORMAS_CORRECCION,MOTIVOS,RESPONSABLES} from "./options";

const choice=<T extends readonly [string,...string[]]>(values:T)=>z.preprocess(value=>typeof value==="string"?canonicalOption(value,values):value,z.enum(values));
export const bulkInconsistencySchema=z.object({
  cases:z.array(z.object({id:z.string().uuid(),version:z.number().int().min(1),systemQuantity:z.number().nullable().optional()}).strict()).min(1).max(50),
  action:z.enum(["seguimiento","resolver","ajustar"]),
  motivo:choice(MOTIVOS).optional(),
  responsable:z.enum(RESPONSABLES).optional(),
  formaCorreccion:choice(FORMAS_CORRECCION).optional(),
  comentarioAdmin:z.string().trim().max(5000).optional(),
  numeroCorreccion:z.string().trim().max(100).optional(),
  numeroAjuste:z.string().trim().min(1).max(128).optional(),
}).strict().superRefine((value,ctx)=>{
  if(new Set(value.cases.map(item=>item.id)).size!==value.cases.length)ctx.addIssue({code:"custom",path:["cases"],message:"Hay casos repetidos."});
  if(value.action==="seguimiento"&&!value.motivo&&!value.formaCorreccion&&!value.comentarioAdmin&&!value.numeroCorreccion)ctx.addIssue({code:"custom",path:["action"],message:"Indique al menos un dato de seguimiento."});
  if(value.action==="resolver"&&!value.motivo&&!value.formaCorreccion)ctx.addIssue({code:"custom",path:["action"],message:"Para resolver indique el motivo o cómo se corrigió."});
  if(value.action==="ajustar"&&!value.numeroAjuste)ctx.addIssue({code:"custom",path:["numeroAjuste"],message:"Indique el número de ajuste."});
  if(value.action!=="ajustar"&&value.numeroAjuste)ctx.addIssue({code:"custom",path:["numeroAjuste"],message:"El número de ajuste solo corresponde a la opción de ajuste."});
});

export type BulkInconsistencyInput=z.infer<typeof bulkInconsistencySchema>;

export function adjustmentFromCount(count:number|null,system:number|null){
  if(count===null||system===null||!Number.isSafeInteger(count)||!Number.isSafeInteger(system))return null;
  const difference=count-system,quantity=Math.abs(difference);
  if(!Number.isSafeInteger(quantity)||quantity===0||quantity>10_000_000)return null;
  return {quantity,type:difference>0?"Positivo":"Negativo",verdict:difference>0?"AJUSTE POSITIVO POR SOBRANTE FÍSICO CONFIRMADO":"AJUSTE NEGATIVO POR FALTANTE FÍSICO CONFIRMADO"} as const;
}
