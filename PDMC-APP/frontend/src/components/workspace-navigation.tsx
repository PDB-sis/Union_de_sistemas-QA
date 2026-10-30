"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ArrowUpRight, Grid2X2, Search } from "lucide-react";
import { PdmcLogo } from "@/components/brand/pdmc-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type WorkspaceDestination<T extends string> = {
  id: T;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
  count?: number | string;
  countLabel?: string;
  testId?: string;
};

export function WorkspaceHeader({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return <div className="workspace-masthead">
    <PdmcLogo subtitle={subtitle} markClassName="size-9 sm:size-10" />
    <div className="flex min-w-0 items-center gap-2 sm:gap-4">{children}</div>
  </div>;
}

export function WorkspaceNavigation<T extends string>({ items, value, onChange, label = "Secciones del panel" }: {
  items: WorkspaceDestination<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rail = useRef<HTMLElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const revealActive = () => {
      const active = rail.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (active && rail.current) {
        const bounds = rail.current.getBoundingClientRect();
        const item = active.getBoundingClientRect();
        if (item.left < bounds.left || item.right > bounds.right) {
          rail.current.scrollLeft += item.left - bounds.left - bounds.width / 2 + item.width / 2;
        }
      }
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    if (rail.current) observer.observe(rail.current);
    return () => observer.disconnect();
  }, [value]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
        event.preventDefault(); setQuery(""); setOpen(previous => !previous);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const choose = (id: T) => { onChange(id); setOpen(false); setQuery(""); };
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = items.filter(item => normalize(`${item.label} ${item.description ?? ""}`).includes(normalize(query.trim())));
  return <div className="workspace-navigation">
    <nav ref={rail} aria-label={label} className="workspace-navigation-rail">
      {items.map(({ id, label: name, icon: Icon, count, countLabel, testId }) => <button
        key={id} type="button" onClick={() => onChange(id)} aria-current={value === id ? "page" : undefined}
        className="workspace-tab">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{name}</span>
        {count !== undefined && <span className="workspace-tab-count" title={countLabel} data-testid={testId}>{typeof count === "number" ? count.toLocaleString("es-VE") : count}</span>}
      </button>)}
    </nav>
    <Button ref={launcher} variant="ghost" className="workspace-launcher shrink-0" aria-label="Explorar módulos" aria-haspopup="dialog" onClick={() => { setQuery(""); setOpen(true); }}>
      <Grid2X2 className="size-4" /><span className="hidden sm:inline">Explorar</span><kbd className="hidden text-[10px] text-muted-foreground xl:inline">Ctrl K</kbd>
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); launcher.current?.focus(); }} className="workspace-explorer max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle className="text-2xl">Tu espacio de trabajo</DialogTitle><DialogDescription>Encuentra un módulo y continúa con tu operación.</DialogDescription></DialogHeader>
        <div className="relative"><Search className="absolute left-3.5 top-3 size-4 text-muted-foreground" /><Input aria-label="Buscar módulo" placeholder="Buscar por nombre o actividad…" value={query} onChange={event => setQuery(event.target.value)} className="h-11 pl-10" /></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map(({ id, label: name, icon: Icon, description, count }) => <button key={id} type="button" className="workspace-destination" aria-current={value === id ? "page" : undefined} onClick={() => choose(id)}>
            <span className="workspace-destination-icon"><Icon className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{name}</span>{description && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>}{count !== undefined && <span className="mt-2 block text-xs font-semibold text-primary">{typeof count === "number" ? count.toLocaleString("es-VE") : count} registros</span>}</span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
          </button>)}
        </div>
        {filtered.length === 0 && <p role="status" className="py-8 text-center text-sm text-muted-foreground">No hay módulos que coincidan con tu búsqueda.</p>}
      </DialogContent>
    </Dialog>
  </div>;
}
