"use client";
import { useEffect, useState } from "react";
export class ApiError extends Error {
  constructor(message: string, public details?: unknown, public status?: number) { super(message); }
}
export async function api<T>(path: string, body?: unknown, method = "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/operacion/negativos/${path}`, {
    method: body === undefined ? "GET" : method, cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const contentType=response.headers.get("content-type")??"";
  let result:{ok?:boolean;data?:T;error?:{message?:string;details?:unknown}};
  try {
    result=contentType.includes("application/json")?await response.json():{};
  } catch {
    throw new ApiError("El servidor no devolvió una respuesta válida. Reintente en unos instantes.",undefined,response.status);
  }
  if(!contentType.includes("application/json"))throw new ApiError(response.status>=500?"El servidor no está disponible en este momento. Reintente en unos instantes.":"No se recibió una respuesta válida del servidor.",undefined,response.status);
  if (!response.ok || !result.ok) throw new ApiError(result.error?.message ?? "No se pudo completar la operación", result.error?.details, response.status);
  if(body!==undefined&&!path.endsWith("/previa"))window.dispatchEvent(new Event("pdmc:negativos-changed"));
  return result.data as T;
}
export function useApi<T>(key: string | null) {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer=window.setTimeout(()=>{api<T>(key.split("#")[0], undefined, "GET", controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message }); });},180);
    return () => { window.clearTimeout(timer);controller.abort(); };
  }, [key]);
  return { data: result?.key === key ? result.data : undefined, error: result?.key === key ? result.error : undefined, loading: Boolean(key && result?.key !== key) };
}
export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
export const localDateTime = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,19);
export const isoDateTime = (value: string) => new Date(value).toISOString();
