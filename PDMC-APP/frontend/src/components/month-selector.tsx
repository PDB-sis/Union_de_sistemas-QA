"use client";
import {useState} from "react";
import {CalendarDays,ChevronDown,ChevronLeft,ChevronRight} from "lucide-react";
import {Popover,PopoverContent,PopoverTrigger} from "@/components/ui/popover";
import {currentMonth,monthLabel} from "@pdmc/contratos/month";

const move=(value:string,amount:number)=>{const [year,month]=value.split("-").map(Number),date=new Date(Date.UTC(year,month-1+amount,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`};
const key=(year:number,month:number)=>`${year}-${String(month).padStart(2,"0")}`;
const name=(month:number,format:"long"|"short")=>new Intl.DateTimeFormat("es-VE",{month:format,timeZone:"UTC"}).format(new Date(Date.UTC(2020,month-1,1))).replace(".","").slice(0,format==="short"?3:undefined);
// Hasta cinco años hacia atrás; los meses futuros no se pueden elegir.
const YEARS_BACK=5;

export function MonthSelector({value,onChange,variant="surface"}:{value:string;onChange:(value:string)=>void;variant?:"surface"|"hero"}){
  const latest=currentMonth(),hero=variant==="hero";
  const [selectedYear,selectedMonth]=value.split("-").map(Number),latestYear=Number(latest.slice(0,4));
  const [open,setOpen]=useState(false),[year,setYear]=useState(selectedYear);
  const prev=move(value,-1),next=move(value,1),canNext=next<=latest,canPrev=Number(prev.slice(0,4))>=latestYear-YEARS_BACK;
  const arrow=`grid size-9 shrink-0 place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 ${hero?"text-white hover:bg-white/15 focus-visible:outline-white":"text-foreground hover:bg-muted focus-visible:outline-ring"}`;
  const pick=(month:string)=>{onChange(month);setOpen(false);};
  return <div className={`flex w-full min-w-0 items-center gap-1 rounded-full border p-1 ${hero?"border-white/25 bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18)]":"border-border bg-card text-foreground shadow-sm"}`}>
    <button type="button" className={arrow} aria-label="Mes anterior" disabled={!canPrev} onClick={()=>onChange(prev)}><ChevronLeft className="size-4"/></button>
    <Popover open={open} onOpenChange={value=>{setOpen(value);if(value)setYear(selectedYear);}}>
      <PopoverTrigger asChild><button type="button" aria-label={`Periodo: ${monthLabel(value)}. Cambiar mes`} className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-3.5 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${hero?"bg-white/14 hover:bg-white/22 focus-visible:outline-white":"bg-muted/70 hover:bg-muted focus-visible:outline-ring"}`}>
        <CalendarDays className={`size-4 shrink-0 ${hero?"text-white/80":"text-primary"}`}/>
        <span className="min-w-0 flex-1 truncate leading-tight"><span className="text-[15px] font-semibold capitalize">{name(selectedMonth,"long")}</span> <span className={`text-sm tabular-nums ${hero?"text-white/75":"text-muted-foreground"}`}>{selectedYear}</span></span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open?"rotate-180":""} ${hero?"text-white/75":"text-muted-foreground"}`}/>
      </button></PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-3">
        <div className="flex items-center justify-between pb-2">
          <button type="button" className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-35" aria-label="Año anterior" disabled={year<=latestYear-YEARS_BACK} onClick={()=>setYear(y=>y-1)}><ChevronLeft className="size-4"/></button>
          <p className="text-sm font-semibold tabular-nums" aria-live="polite">{year}</p>
          <button type="button" className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-35" aria-label="Año siguiente" disabled={year>=latestYear} onClick={()=>setYear(y=>y+1)}><ChevronRight className="size-4"/></button>
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={`Meses de ${year}`}>
          {Array.from({length:12},(_,index)=>{const month=index+1,id=key(year,month),selected=id===value,future=id>latest,current=id===latest;
            return <button key={id} type="button" disabled={future} aria-pressed={selected} aria-label={monthLabel(id)} onClick={()=>pick(id)}
              className={`relative h-10 rounded-xl text-sm font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${selected?"bg-primary text-primary-foreground shadow-sm":"hover:bg-muted"} ${current&&!selected?"ring-1 ring-inset ring-primary/45 text-primary":""}`}>{name(month,"short")}</button>;})}
        </div>
        {value!==latest&&<button type="button" className="mt-3 w-full rounded-xl border px-3 py-2 text-sm font-medium text-primary hover:bg-muted" onClick={()=>pick(latest)}>Ir al mes actual</button>}
      </PopoverContent>
    </Popover>
    <button type="button" className={arrow} aria-label="Mes siguiente" disabled={!canNext} onClick={()=>onChange(next)}><ChevronRight className="size-4"/></button>
  </div>;
}
