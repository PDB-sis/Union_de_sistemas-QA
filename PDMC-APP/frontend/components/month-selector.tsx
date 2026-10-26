"use client";
import {ChevronLeft,ChevronRight,RotateCcw} from "lucide-react";
import {Button} from "@frontend/components/ui/button";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@frontend/components/ui/select";
import {currentMonth,monthLabel} from "@shared/month";

const move=(value:string,amount:number)=>{const [year,month]=value.split("-").map(Number),date=new Date(Date.UTC(year,month-1+amount,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`};
const options=(latest:string,value:string)=>[...new Set([value,...Array.from({length:36},(_,index)=>move(latest,-index))])].filter(month=>month<=latest).sort((a,b)=>b.localeCompare(a));

export function MonthSelector({value,onChange,variant="surface"}:{value:string;onChange:(value:string)=>void;variant?:"surface"|"hero"}){
  const latest=currentMonth(),next=move(value,1),hero=variant==="hero",button=hero?"text-white hover:bg-white/15 hover:text-white":"text-foreground hover:bg-primary/10";
  return <div className={`min-w-0 rounded-2xl border p-1.5 shadow-sm ${hero?"border-white/20 bg-white/12 text-white backdrop-blur-md":"border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card text-foreground"}`}><div className="flex min-w-0 items-center gap-1">
    <Button type="button" size="icon" variant="ghost" className={`size-8 shrink-0 rounded-xl ${button}`} aria-label="Mes anterior" onClick={()=>onChange(move(value,-1))}><ChevronLeft className="size-4"/></Button>
    <Select value={value} onValueChange={onChange}><SelectTrigger aria-label="Seleccionar mes" title={monthLabel(value)} className={`h-11 min-w-0 flex-1 gap-1 overflow-hidden rounded-xl border-0 px-2 text-left shadow-none focus-visible:ring-1 ${hero?"!bg-white/10 !text-white hover:!bg-white/15 [&>svg]:!text-white":"bg-background/80"}`}><span className="min-w-0 flex-1 overflow-hidden"><span className={`block truncate text-[8px] font-bold uppercase tracking-[.12em] ${hero?"text-white/65":"text-muted-foreground"}`}>Periodo</span><SelectValue className="block truncate text-[13px] font-semibold capitalize leading-5"/></span></SelectTrigger><SelectContent align="center" className="max-h-80">{options(latest,value).map(month=><SelectItem key={month} value={month} className="capitalize">{monthLabel(month)}</SelectItem>)}</SelectContent></Select>
    <Button type="button" size="icon" variant="ghost" className={`size-8 shrink-0 rounded-xl ${button}`} aria-label="Mes siguiente" disabled={next>latest} onClick={()=>onChange(next)}><ChevronRight className="size-4"/></Button>
    {value!==latest&&<Button type="button" size="icon" variant="ghost" className={`size-8 shrink-0 rounded-xl ${button}`} aria-label="Volver al mes actual" title="Mes actual" onClick={()=>onChange(latest)}><RotateCcw className="size-4"/></Button>}
  </div></div>;
}
