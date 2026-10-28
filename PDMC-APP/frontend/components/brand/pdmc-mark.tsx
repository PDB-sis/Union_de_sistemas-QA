import { useId } from "react";
import { cn } from "@shared/utils";

/* PDMC mark: a continuous-improvement loop closing on a verified check. Mirrors public/favicon.svg.
   Colors come from the brand tokens, so the mark follows the palette chosen in Ajustes de cuenta. */
export function PdmcMark({className,title}:{className?:string;title?:string}) {
  const id=useId().replace(/[^a-zA-Z0-9_-]/g,"");
  return <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn("size-10 shrink-0",className)} role={title?"img":undefined} aria-hidden={title?undefined:true} aria-label={title}>
    <defs>
      <linearGradient id={`${id}-bg`} x1="6" y1="2" x2="42" y2="46" gradientUnits="userSpaceOnUse"><stop style={{stopColor:"var(--brand-ocean)"}}/><stop offset="1" style={{stopColor:"var(--brand-deep)"}}/></linearGradient>
      <radialGradient id={`${id}-shine`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(38 6) rotate(135) scale(30)"><stop style={{stopColor:"var(--brand-glow)"}} stopOpacity=".38"/><stop offset="1" style={{stopColor:"var(--brand-glow)"}} stopOpacity="0"/></radialGradient>
    </defs>
    <rect width="48" height="48" rx="13" fill={`url(#${id}-bg)`}/>
    <rect width="48" height="48" rx="13" fill={`url(#${id}-shine)`}/>
    <rect x=".75" y=".75" width="46.5" height="46.5" rx="12.25" stroke="#ffffff" strokeOpacity=".14" strokeWidth="1.5"/>
    <path d="M31.71 14.81A12 12 0 1 1 21.92 12.18" stroke="currentColor" className="text-brand-glow" strokeWidth="4.2" strokeLinecap="round"/>
    <path d="M20.3 8.6L24.6 11.7L21.5 16" stroke="currentColor" className="text-brand-glow" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M18.6 24.6L22.4 28.4L29.6 20.8" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

/* Mark plus wordmark. `onDark` is for the brand-colored sidebars and heroes. */
export function PdmcLogo({subtitle="Mejora Continua",onDark=false,className,markClassName}:{subtitle?:string;onDark?:boolean;className?:string;markClassName?:string}) {
  return <div className={cn("flex min-w-0 items-center gap-3",className)}>
    <PdmcMark className={cn("size-11 drop-shadow-[0_8px_18px_rgba(14,22,48,.35)]",markClassName)}/>
    <div className="min-w-0 leading-tight">
      <p className={cn("text-lg font-extrabold tracking-[-.02em]",onDark?"text-white":"text-foreground")}>PDMC</p>
      <p className={cn("truncate text-[10px] font-semibold uppercase tracking-[.16em]",onDark?"text-white/50":"text-muted-foreground")}>{subtitle}</p>
    </div>
  </div>;
}
