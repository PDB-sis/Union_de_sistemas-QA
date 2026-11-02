export type TransferType="NORMAL"|"CORRECCION"|"ROTACION";
/** review: motivo para revisar el tipo a mano; null cuando las señales coinciden. */
export type TransferClassification={type:TransferType;review:string|null};

/** Quienes normalmente registran correcciones y rotaciones (CodUsuario del sistema corporativo). */
export const defaultSpecialAuthors:readonly string[]=["NOREIMA","AUXILIAR4"];

const normalized=(value:string|null|undefined)=>String(value??"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();

// Forma fonética: sin letras repetidas y con c/z/x/cs que suenan a "s" unificadas, para que
// "correcion", "coreccion", "correcsion" o "rotasion" lleguen a la misma palabra.
const phonetic=(word:string)=>word.replace(/(.)\1+/g,"$1").replace(/cs|x|z|c(?=[ei])/g,"s").replace(/(.)\1+/g,"$1");

/** Distancia de edición con transposición (Damerau-Levenshtein restringida). */
function distance(a:string,b:string){
  const d=Array.from({length:a.length+1},(_,i)=>Array.from({length:b.length+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }
  return d[a.length][b.length];
}

// Cada tipo exige el inicio de la palabra ("cor", "rota"): así "colección", "dotación", "rotulación"
// o "cajas rotas" no se confunden. En el resto se aceptan hasta dos letras erradas.
const isCorrection=(w:string)=>w.startsWith("cor")&&(w.startsWith("coreg")||w.startsWith("corig")||w==="corec"||(w.length>=6&&distance(w,"coresion")<=2));
const isRotation=(w:string)=>w.startsWith("rota")&&(["rotar","rotado","rotada","rotados","rotadas"].includes(w)||(w.length>=6&&distance(w,"rotasion")<=2));

// "no es corrección", "sin rotación" o "ni rotación" no indican el tipo.
const negation=new Set(["no","sin","ni"]),link=new Set(["es","fue","era","hay","un","una","de"]);
const negated=(words:readonly string[],i:number)=>negation.has(words[i-1])||(link.has(words[i-1])&&negation.has(words[i-2]))||(link.has(words[i-1])&&link.has(words[i-2])&&negation.has(words[i-3]));

function mentions(description:string|null|undefined){
  const words=normalized(description).split(/[^a-z]+/).filter(Boolean).map(phonetic);
  let correction=false,rotation=false;
  words.forEach((w,i)=>{if(negated(words,i))return;if(isCorrection(w))correction=true;else if(isRotation(w))rotation=true;});
  return {correction,rotation};
}

export function transferType(description:string|null|undefined):TransferType{
  return classifyTransfer(description,null).type;
}

/**
 * Tipo según la observación (tolerante a errores de escritura) y, como segunda señal, quién la
 * registró: si las señales no coinciden, el tipo queda marcado para revisión en lugar de adivinarse.
 */
export function classifyTransfer(description:string|null|undefined,author:string|null|undefined,specialAuthors:readonly string[]=defaultSpecialAuthors):TransferClassification{
  const {correction,rotation}=mentions(description),code=String(author??"").trim().toUpperCase();
  const special=code!==""&&specialAuthors.some(a=>a.trim().toUpperCase()===code);
  if(correction&&rotation)return {type:"CORRECCION",review:"La observación menciona corrección y rotación."};
  if(correction)return {type:"CORRECCION",review:null};
  if(rotation)return {type:"ROTACION",review:null};
  return {type:"NORMAL",review:special?`Registrada por ${code}, que normalmente hace correcciones y rotaciones, pero la observación no indica el tipo.`:null};
}

export const transferTypeLabel:Record<TransferType,string>={NORMAL:"Transferencia normal",CORRECCION:"Corrección",ROTACION:"Rotación de mercancía"};
