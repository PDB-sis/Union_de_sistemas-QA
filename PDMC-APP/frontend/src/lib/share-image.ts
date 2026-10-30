/* Branded PNG for sharing open transfers and returns with stores. Shared by both modules so they stay identical. */

export type ShareImageItem={codigoBarra:string;cantidad:number;referencia:string|null;descripcion:string|null};
export type ShareImage={kicker:string;title:string;subtitle:string;metrics:[string,string][];note?:{label:string;text:string};items:ShareImageItem[];fileName:string};

const SANS='"Manrope Variable", "Segoe UI", system-ui, sans-serif';
const MONO='"JetBrains Mono Variable", ui-monospace, Consolas, monospace';
const BRAND={deep:"#18296a",ocean:"#2a45a8",glow:"#87bad7",mist:"#b8d5e8",light:"#edecda"};
const width=1440,rowHeight=60,footer=96;

function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function fit(ctx:CanvasRenderingContext2D,value:string,max:number){if(ctx.measureText(value).width<=max)return value;let text=value;while(text.length>1&&ctx.measureText(`${text}…`).width>max)text=text.slice(0,-1);return `${text}…`;}

/* Same geometry as public/favicon.svg, drawn natively so the canvas never gets tainted. */
function drawMark(ctx:CanvasRenderingContext2D,x:number,y:number,size:number){
  ctx.save();ctx.translate(x,y);ctx.scale(size/48,size/48);
  const bg=ctx.createLinearGradient(6,2,42,46);bg.addColorStop(0,"#436bdc");bg.addColorStop(1,BRAND.deep);
  ctx.fillStyle=bg;rounded(ctx,0,0,48,48,13);
  ctx.strokeStyle="rgba(255,255,255,.14)";ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(.75,.75,46.5,46.5,12.25);ctx.stroke();
  ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=BRAND.glow;
  ctx.lineWidth=4.2;ctx.stroke(new Path2D("M31.71 14.81A12 12 0 1 1 21.92 12.18"));
  ctx.lineWidth=3.6;ctx.stroke(new Path2D("M20.3 8.6L24.6 11.7L21.5 16"));
  ctx.strokeStyle="#ffffff";ctx.stroke(new Path2D("M18.6 24.6L22.4 28.4L29.6 20.8"));
  ctx.restore();
}

export async function downloadShareImage(image:ShareImage){
  await Promise.all([`800 61px ${SANS}`,`650 21px ${MONO}`].map(font=>document.fonts.load(font).catch(()=>[])));
  const tableTop=image.note?585:445,height=Math.max(900,tableTop+55+image.items.length*rowHeight+footer);
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("El navegador no permite generar la imagen.");
  const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,"#142254");gradient.addColorStop(.5,BRAND.ocean);gradient.addColorStop(1,"#18296a");
  ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  ctx.globalAlpha=.08;ctx.fillStyle="#ffffff";ctx.beginPath();ctx.arc(1330,-20,330,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;

  drawMark(ctx,90,58,58);
  ctx.fillStyle=BRAND.glow;ctx.font=`800 24px ${SANS}`;ctx.fillText(image.kicker,166,86);
  ctx.fillStyle="rgba(255,255,255,.55)";ctx.font=`700 17px ${SANS}`;ctx.fillText("PDMC · PANEL DE MEJORA CONTINUA",166,112);
  ctx.fillStyle="#ffffff";ctx.font=`800 61px ${SANS}`;ctx.fillText(fit(ctx,image.title,1260),90,198);
  ctx.fillStyle="rgba(255,255,255,.78)";ctx.font=`650 29px ${SANS}`;ctx.fillText(fit(ctx,image.subtitle,1260),90,245);

  ctx.fillStyle="rgba(255,255,255,.095)";rounded(ctx,90,285,1260,115,24);
  ctx.fillStyle="rgba(135,186,215,.22)";rounded(ctx,500,310,2,65,1);rounded(ctx,920,310,2,65,1);
  image.metrics.forEach(([label,value],index)=>{const x=145+index*420;ctx.fillStyle=BRAND.mist;ctx.font=`700 18px ${SANS}`;ctx.fillText(label,x,325);ctx.fillStyle="#ffffff";ctx.font=`800 33px ${SANS}`;ctx.fillText(fit(ctx,value,330),x,372);});

  if(image.note){
    ctx.fillStyle="rgba(255,255,255,.07)";rounded(ctx,90,430,1260,105,22);
    ctx.fillStyle=BRAND.mist;ctx.font=`700 17px ${SANS}`;ctx.fillText(image.note.label,125,467);
    ctx.fillStyle="#ffffff";ctx.font=`600 22px ${SANS}`;ctx.fillText(fit(ctx,image.note.text,1170),125,507);
  }

  ctx.fillStyle=BRAND.glow;ctx.font=`700 19px ${SANS}`;ctx.fillText("CÓDIGO DE BARRA",110,tableTop);ctx.fillText("REFERENCIA / PRODUCTO",470,tableTop);ctx.textAlign="right";ctx.fillText("CANT.",1325,tableTop);ctx.textAlign="left";
  image.items.forEach((item,index)=>{
    const y=tableTop+36+index*rowHeight;
    if(index%2===0){ctx.fillStyle="rgba(255,255,255,.075)";rounded(ctx,88,y-34,1264,rowHeight-4,11);}
    ctx.fillStyle="#ffffff";ctx.font=`650 21px ${MONO}`;ctx.fillText(fit(ctx,item.codigoBarra,320),110,y);
    ctx.font=`600 20px ${SANS}`;ctx.fillText(fit(ctx,[item.referencia,item.descripcion].filter(Boolean).join(" · ")||"Producto sin descripción",700),470,y);
    ctx.fillStyle=BRAND.light;ctx.font=`800 24px ${SANS}`;ctx.textAlign="right";ctx.fillText(item.cantidad.toLocaleString("es-VE"),1325,y);ctx.textAlign="left";
  });

  ctx.fillStyle="rgba(255,255,255,.12)";ctx.fillRect(90,height-footer+18,1260,1);
  ctx.fillStyle="rgba(255,255,255,.55)";ctx.font=`600 17px ${SANS}`;
  ctx.fillText(`Generado el ${new Date().toLocaleString("es-VE",{dateStyle:"short",timeStyle:"short"})}`,90,height-footer+60);
  ctx.textAlign="right";ctx.fillText(`${image.items.length.toLocaleString("es-VE")} líneas de producto`,1350,height-footer+60);ctx.textAlign="left";

  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
  if(!blob)throw new Error("No se pudo generar la imagen.");
  const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=image.fileName;anchor.click();URL.revokeObjectURL(url);
}
