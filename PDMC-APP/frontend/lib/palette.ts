// Paleta de acento de la interfaz. Es una preferencia del dispositivo (como el modo claro u oscuro):
// se guarda en el navegador y se aplica en <html data-palette> antes de pintar la página.
// Los colores de cada paleta viven en frontend/styles/globals.css; el ícono de la pestaña, en public/.
export const PALETTES=[
  {id:"real",nombre:"Azul real",descripcion:"La paleta predeterminada de PDMC.",icono:"/favicon.svg"},
  {id:"cielo",nombre:"Azul cielo",descripcion:"Más clara y serena.",icono:"/favicon-cielo.svg"},
  {id:"carmin",nombre:"Carmín",descripcion:"El rojo de la empresa como color principal.",icono:"/favicon-carmin.svg"},
] as const;
export type PaletteId=typeof PALETTES[number]["id"];
export const PALETTE_STORAGE_KEY="pdmc-paleta";
export const DEFAULT_PALETTE:PaletteId="real";

const isPalette=(value:unknown):value is PaletteId=>PALETTES.some(palette=>palette.id===value);

export function readPalette():PaletteId {
  try {const value=localStorage.getItem(PALETTE_STORAGE_KEY);return isPalette(value)?value:DEFAULT_PALETTE;}
  catch {return DEFAULT_PALETTE;}
}

// Ícono de la pestaña del navegador con los colores de la paleta.
function applyIcon(id:PaletteId) {
  const href=PALETTES.find(palette=>palette.id===id)!.icono;
  document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach(link=>{if(link.getAttribute("href")!==href)link.setAttribute("href",href);});
}

export function applyPalette(id:PaletteId) {
  if(id===DEFAULT_PALETTE)document.documentElement.removeAttribute("data-palette");
  else document.documentElement.setAttribute("data-palette",id);
  applyIcon(id);
  try {localStorage.setItem(PALETTE_STORAGE_KEY,id);} catch {}
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

const PALETTE_EVENT="pdmc-paleta";
/** Suscripción para useSyncExternalStore: cambios en esta pestaña y en otras. */
export function subscribePalette(onChange:()=>void) {
  window.addEventListener(PALETTE_EVENT,onChange);window.addEventListener("storage",onChange);
  return ()=>{window.removeEventListener(PALETTE_EVENT,onChange);window.removeEventListener("storage",onChange);};
}

/** Se ejecuta en <head> antes de pintar, para que la página no parpadee con la paleta predeterminada.
    El ícono se cambia cuando el documento termina de cargar, porque sus <link> pueden llegar después. */
const icons=Object.fromEntries(PALETTES.filter(palette=>palette.id!==DEFAULT_PALETTE).map(palette=>[palette.id,palette.icono]));
export const paletteBootScript=`try{var p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)}),i=${JSON.stringify(icons)}[p];if(i){document.documentElement.setAttribute("data-palette",p);document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll('link[rel~="icon"]').forEach(function(l){l.setAttribute("href",i);});});}}catch(e){}`;
