"""Agente de tienda: BD_SPDV local -> API central NEXO QA."""
from __future__ import annotations
import hashlib, json, logging, os, re, sqlite3, ssl, sys, time, urllib.error, urllib.request, uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
import pyodbc

ROOT = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
LOG = logging.getLogger("nexoqaa.agent")
QUERY = """
;WITH TasaReciente AS (SELECT TOP (1) Valor, Fecha FROM dbo.TASA_CAMBIO ORDER BY Fecha DESC),
Parametro AS (SELECT TOP (1) nombre FROM dbo.PARAMETROS)
SELECT TR.Valor AS tasa_cambio, TR.Fecha AS fecha_tasa_cambio, P.nombre AS sucursal_origen,
 I.CodigoBarra AS codigo_barra, I.Referencia AS referencia, I.CodigoMarca AS codigo_marca,
 I.Referencia + CAST(I.CodigoMarca AS VARCHAR) AS concatenado, M.Nombre AS marca, I.Nombre AS descripcion,
 C.Codigo AS codigo_categoria, C.Nombre AS nombre_categoria, CL.Nombre AS linea, I.Status AS status, I.Existencia AS existencia,
 I.CostoDolar AS costo_dolar, I.CostoInicial AS costo_inicial, I.PrecioPromocion AS precio_promocion,
 ROUND((I.PrecioDetal * 1.16) / NULLIF(TR.Valor, 0),2) AS precio_detal_usd_mas_iva,
 ROUND(I.PrecioDetal * 1.16,2) AS precio_detal_mas_iva,
 ROUND((I.PrecioMayor * 1.16) / NULLIF(TR.Valor,0),2) AS precio_mayor_usd_mas_iva,
 ROUND(I.PrecioMayor * 1.16,2) AS precio_mayor_mas_iva, I.UltimaActualizacion AS origen_actualizado_at
FROM dbo.INVENTARIO I LEFT JOIN dbo.MARCAS M ON I.CodigoMarca=M.Codigo
LEFT JOIN dbo.CATEGORIAS C ON I.Categoria=C.Codigo
LEFT JOIN dbo.CATEGORIAS CL ON LEFT(C.Codigo,4)=CL.Codigo
CROSS JOIN TasaReciente TR CROSS JOIN Parametro P
"""
# La línea (categoría padre, LEFT(Codigo, 4)) es la misma que usa PDMC en sqlserver/consultas/inventario.sql.

def config() -> dict[str,str]:
    path=Path(os.getenv("QA_AGENT_CONFIG", ROOT / "config.env"))
    if not path.exists(): raise RuntimeError(f"Falta configuración: {path}")
    result={}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k,v=line.split("=",1); result[k.strip()]=v.strip().strip('"').strip("'")
    result["_CONFIG_DIR"]=str(path.resolve().parent)  # las consultas de las tareas viven junto a config.env
    return result

def state(c: dict[str,str]) -> sqlite3.Connection:
    path=Path(c.get("STATE_PATH",r"C:\ProgramData\NexoQA\agente\state.sqlite3")); path.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(path); db.execute("CREATE TABLE IF NOT EXISTS estado(clave TEXT PRIMARY KEY, valor TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS enviado(codigo TEXT PRIMARY KEY, hash TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS enviado_tarea(tarea TEXT NOT NULL, clave TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(tarea, clave))"); return db

def get(db,key):
    row=db.execute("SELECT valor FROM estado WHERE clave=?",(key,)).fetchone(); return row[0] if row else None
def put(db,key,value):
    db.execute("INSERT INTO estado VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor",(key,value)); db.commit()
def json_value(v:Any):
    if isinstance(v,Decimal): return str(v)
    if isinstance(v,datetime): return v.isoformat()
    return v
# Columnas que la API recibe como texto aunque SQL Server las entregue como número o BIT.
TEXT_FIELDS=("sucursal_origen","codigo_barra","referencia","codigo_marca","concatenado","marca","descripcion","codigo_categoria","nombre_categoria","linea","status")
def text_value(v:Any) -> str|None:
    """Mismo criterio que app.sync.normalizacion.a_texto: BIT -> 'true'/'false', Decimal sin notación científica."""
    if v is None or v=="": return None
    if isinstance(v,bool): return "true" if v else "false"
    if isinstance(v,Decimal): return "0" if v==0 else format(v.normalize(),"f")
    return str(v)
def is_active(v:Any) -> bool:
    """Status puede llegar como BIT (bool), entero o texto."""
    if isinstance(v,bool): return v
    return v is not None and str(v).strip().lower() in {"1","true"}
# SQL Server guarda hora local sin zona; se marca con la zona de la PC para que el servidor no la lea como UTC.
LOCAL_TZ=datetime.now().astimezone().tzinfo
DATE_FIELDS=("origen_actualizado_at","fecha_tasa_cambio")
def normalize(row:dict[str,Any]) -> dict[str,Any]:
    row["activo"]=is_active(row.get("status"))
    for k in DATE_FIELDS:
        v=row.get(k)
        if isinstance(v,datetime) and v.tzinfo is None: row[k]=v.replace(tzinfo=LOCAL_TZ)
    for k in TEXT_FIELDS:
        if k in row: row[k]=text_value(row[k])
    return row
def fingerprint(row:dict[str,Any]) -> str:
    return hashlib.sha256(json.dumps(row,default=json_value,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()).hexdigest()
# Orden de preferencia cuando SQL_DRIVER=auto: se usa el más moderno que tenga instalado la PC.
DRIVERS=("ODBC Driver 18 for SQL Server","ODBC Driver 17 for SQL Server","ODBC Driver 13.1 for SQL Server","ODBC Driver 13 for SQL Server","ODBC Driver 11 for SQL Server","SQL Server Native Client 11.0","SQL Server Native Client 10.0","SQL Server")
TLS_ERRORS=("ssl","tls","certificate","certificado","encrypt","cifrad")
def driver(c:dict[str,str]) -> str:
    wanted=c.get("SQL_DRIVER","auto").strip()
    if wanted and wanted.lower()!="auto": return wanted
    installed=set(pyodbc.drivers())
    for d in DRIVERS:
        if d in installed: return d
    raise RuntimeError(f"No hay driver ODBC de SQL Server instalado. Disponibles: {sorted(installed)}")
def connect(c:dict[str,str]):
    """SQL_ENCRYPT=auto intenta cifrado y, si el servidor o el driver no lo soportan, reintenta sin cifrado (red local)."""
    drv=driver(c); enc=c.get("SQL_ENCRYPT","auto").strip().lower()
    base=f"DRIVER={{{drv}}};SERVER={c.get('SQL_SERVER',r'CAJAUNO\SQLEXPRESS')};DATABASE={c.get('SQL_DATABASE','BD_SPDV')};UID={c['SQL_USER']};PWD={c['SQL_PASSWORD']};TrustServerCertificate={c.get('SQL_TRUST_SERVER_CERTIFICATE','yes')};"
    options=["yes","no"] if enc=="auto" else [enc]
    for i,e in enumerate(options):
        try: return pyodbc.connect(base+f"Encrypt={e};",autocommit=True,timeout=int(c.get("SQL_CONNECTION_TIMEOUT","10")))
        except pyodbc.Error as ex:
            if i+1<len(options) and any(w in str(ex).lower() for w in TLS_ERRORS):
                LOG.warning("Driver %s no pudo cifrar la conexión con SQL Server; se reintenta sin cifrado.",drv); continue
            raise
def sql(c:dict[str,str]) -> list[dict[str,Any]]:
    """Lee el inventario completo. UltimaActualizacion no refleja ventas, por eso los cambios se detectan por huella."""
    with connect(c) as cn:
        cur=cn.cursor(); cur.execute(QUERY+" ORDER BY I.CodigoBarra")
        cols=[x[0] for x in cur.description]; rows=[dict(zip(cols,x)) for x in cur.fetchall()]
    unique:dict[str,dict[str,Any]]={}
    for row in rows:
        normalize(row)
        code=(row.get("codigo_barra") or "").strip()
        if not code: continue  # la API rechazaría el lote completo
        row["codigo_barra"]=code; row["fila_hash"]=fingerprint(row); unique[code]=row
    if len(unique)<len(rows): LOG.warning("Se omitieron %s filas sin código de barra o con código repetido.",len(rows)-len(unique))
    return list(unique.values())
def post(c:dict[str,str],path:str,body:dict[str,Any]) -> dict:
    req=urllib.request.Request(c["API_URL"].rstrip("/")+path,data=json.dumps(body,default=json_value,separators=(",",":"),ensure_ascii=False).encode(),method="POST",headers={"Content-Type":"application/json","X-Agente-Codigo":c["AGENT_CODE"],"X-Agente-Token":c["AGENT_TOKEN"]})
    try:
        with urllib.request.urlopen(req,context=ssl.create_default_context(),timeout=int(c.get("HTTP_TIMEOUT","30"))) as res: return json.loads(res.read())
    except urllib.error.HTTPError as e: raise RuntimeError(f"API HTTP {e.code}: {e.read().decode(errors='replace')}") from e
def send(c:dict[str,str],body:dict[str,Any]) -> dict: return post(c,"/api/agente/v1/inventario/sincronizaciones",body)
def heartbeat(c:dict[str,str]) -> bool:
    """Ciclo sin cambios: avisa que el agente sigue vivo. Un fallo no detiene el ciclo (p. ej. API anterior sin /latido)."""
    try: post(c,"/api/agente/v1/latido",{}); return True
    except Exception as e: LOG.warning("No se pudo enviar el latido: %s",e); return False
BATCH=500
def pending_rows(rows:list[dict[str,Any]], known:dict[str,str], full:bool) -> list[dict[str,Any]]:
    """Completo: todos los activos (la API da de baja lo que no llegue). Incremental: solo huellas distintas a lo ya enviado;
    los inactivos solo si antes se enviaron activos, para informar la baja."""
    if full: return [r for r in rows if r["activo"]]
    return [r for r in rows if known.get(r["codigo_barra"])!=r["fila_hash"] and (r["activo"] or r["codigo_barra"] in known)]
def run_once(c:dict[str,str]) -> dict:
    db=state(c); now=datetime.now(timezone.utc); last_full=get(db,"last_full")
    known=dict(db.execute("SELECT codigo,hash FROM enviado").fetchall())
    full=not last_full or not known or now-datetime.fromisoformat(last_full)>=timedelta(hours=int(c.get("FULL_RECONCILIATION_HOURS","24")))
    mode="INICIAL" if not last_full else ("RECONCILIACION" if full else "INCREMENTAL")
    rows=sql(c); pending=pending_rows(rows,known,full)
    if not pending:
        if full: LOG.warning("SQL Server no devolvió productos activos; no se reconcilia para no dar de baja todo el inventario.")
        return {"filas":len(rows),"enviadas":0,"modo":mode,"latido":heartbeat(c)}
    snapshot=str(uuid.uuid4()) if full else None; changed=0
    for i in range(0,len(pending),BATCH):
        batch=pending[i:i+BATCH]
        result=send(c,{"lote_id":str(uuid.uuid4()),"modo":mode,"snapshot_id":snapshot,"es_ultimo_lote":i+BATCH>=len(pending),"cursor_origen":max((x["origen_actualizado_at"] for x in batch if x["origen_actualizado_at"]),default=None),"filas":batch})
        changed+=result.get("insertadas_o_actualizadas",0)
        # Se guarda por lote: si falla Internet a mitad, el siguiente ciclo solo reenvía lo pendiente.
        db.executemany("INSERT INTO enviado VALUES(?,?) ON CONFLICT(codigo) DO UPDATE SET hash=excluded.hash",[(r["codigo_barra"],r["fila_hash"]) for r in batch]); db.commit()
    if full:
        sent={r["codigo_barra"] for r in pending}
        db.executemany("DELETE FROM enviado WHERE codigo=?",[(k,) for k in known if k not in sent]); db.commit()
        put(db,"last_full",now.isoformat())
    return {"filas":len(rows),"enviadas":len(pending),"cambios_servidor":changed,"modo":mode}

# --- Tareas de PDMC (bodegas): transferencias, devoluciones y usuarios -------------------------
# Cada tarea ejecuta su consulta de la carpeta "consultas" (junto a config.env; copias exactas de
# consultaPDMC/) y envía a /api/agente/v1/filas las filas nuevas o cambiadas y las que desaparecieron.
TAREAS={"transferencias":("transferencias.sql",("Numero","CodigoBarra","NumeroCaja")),
        "devoluciones":("devoluciones.sql",("Numero",)),
        "usuarios":("usuarios.sql",("CodUsuario",))}
# Misma regla que PDMC (backend/src/sync/solo-lectura.ts): SQL Server solo se lee.
WRITE_SQL=re.compile(r"\b(insert|update|delete|merge|truncate|drop|alter|create|exec|execute|grant|revoke|deny|backup|restore|dbcc|shutdown|kill|openrowset|opendatasource|openquery|bulk|into|waitfor)\b",re.I)
def assert_read_only(text:str) -> None:
    s=re.sub(r"/\*[\s\S]*?\*/"," ",text); s=re.sub(r"--[^\r\n]*"," ",s); s=re.sub(r"'(?:[^']|'')*'","''",s); s=re.sub(r"\[[^\]]*\]","[]",s).strip()
    if not re.match(r"(with|select)\b",s,re.I): raise RuntimeError("La consulta debe empezar con SELECT o WITH: SQL Server solo se lee.")
    m=WRITE_SQL.search(s)
    if m: raise RuntimeError(f'La consulta contiene "{m.group(1).upper()}": SQL Server solo se lee.')
    if re.search(r";\s*\S",s): raise RuntimeError("La consulta debe tener una sola instrucción.")
def tareas(c:dict[str,str]) -> list[str]:
    """TAREAS=inventario,transferencias,... (por defecto solo inventario, como los agentes de tienda anteriores)."""
    pedidas=[t.strip().lower() for t in c.get("TAREAS","inventario").split(",") if t.strip()]
    desconocidas=[t for t in pedidas if t!="inventario" and t not in TAREAS]
    if desconocidas: raise RuntimeError(f"TAREAS desconocidas en config.env: {', '.join(desconocidas)}.")
    return list(dict.fromkeys(pedidas))
def consulta(c:dict[str,str],tarea:str) -> str:
    carpeta=Path(c.get("CONSULTAS_DIR") or Path(c.get("_CONFIG_DIR",str(ROOT)))/"consultas")
    path=carpeta/TAREAS[tarea][0]
    if not path.exists(): raise RuntimeError(f"Falta la consulta de {tarea}: {path}")
    texto=path.read_text(encoding="utf-8-sig").strip(); assert_read_only(texto); return texto
def task_value(v:Any) -> str|None:
    if isinstance(v,datetime): return v.isoformat()
    if isinstance(v,str): return v.strip()
    return text_value(v)
def task_rows(c:dict[str,str],tarea:str) -> list[dict[str,Any]]:
    """Filas de la tarea como {clave, datos, fila_hash}. Los datos van como texto, igual que el CSV de PDMC."""
    texto=consulta(c,tarea)
    with connect(c) as cn:
        cur=cn.cursor(); cur.execute(texto)
        cols=[x[0] for x in cur.description]; raw=cur.fetchall()
    indices={n.lower():i for i,n in enumerate(cols)}
    faltan=[k for k in TAREAS[tarea][1] if k.lower() not in indices]
    if faltan: raise RuntimeError(f"La consulta de {tarea} no devuelve las columnas clave: {', '.join(faltan)}.")
    unique:dict[str,dict[str,Any]]={}
    for fila in raw:
        datos={n:task_value(v) for n,v in zip(cols,fila)}
        partes=[(datos[cols[indices[k.lower()]]] or "") for k in TAREAS[tarea][1]]
        if not partes[0]: continue
        clave="\x1f".join(partes)
        unique[clave]={"clave":clave,"datos":datos,"fila_hash":fingerprint(datos)}
    if len(unique)<len(raw): LOG.warning("%s: se omitieron %s filas sin clave o con la clave repetida.",tarea,len(raw)-len(unique))
    return list(unique.values())
def send_filas(c:dict[str,str],body:dict[str,Any]) -> dict: return post(c,"/api/agente/v1/filas",body)
def run_tarea(c:dict[str,str],tarea:str) -> dict:
    db=state(c); now=datetime.now(timezone.utc); marca=f"last_full:{tarea}"; last_full=get(db,marca)
    known=dict(db.execute("SELECT clave,hash FROM enviado_tarea WHERE tarea=?",(tarea,)).fetchall())
    full=not last_full or not known or now-datetime.fromisoformat(last_full)>=timedelta(hours=int(c.get("FULL_RECONCILIATION_HOURS","24")))
    mode="INICIAL" if not last_full else ("RECONCILIACION" if full else "INCREMENTAL")
    rows=task_rows(c,tarea)
    if not rows:
        LOG.warning("%s: la consulta no devolvió filas; no se envían bajas.",tarea)
        return {"filas":0,"enviadas":0,"bajas":0,"modo":mode}
    actuales={r["clave"] for r in rows}
    # Completo: todo (la API da de baja lo que no llegue). Incremental: lo nuevo o cambiado y lo que desapareció.
    cambios=rows if full else [r for r in rows if known.get(r["clave"])!=r["fila_hash"]]
    bajas=[] if full else [{"clave":k,"eliminada":True} for k in known if k not in actuales]
    pendiente=cambios+bajas
    if not pendiente: return {"filas":len(rows),"enviadas":0,"bajas":0,"modo":mode}
    snapshot=str(uuid.uuid4()) if full else None; changed=0
    for i in range(0,len(pendiente),BATCH):
        batch=pendiente[i:i+BATCH]
        result=send_filas(c,{"lote_id":str(uuid.uuid4()),"tarea":tarea,"modo":mode,"snapshot_id":snapshot,"es_ultimo_lote":i+BATCH>=len(pendiente),"filas":batch})
        changed+=result.get("insertadas_o_actualizadas",0)+result.get("eliminadas",0)
        # Se guarda por lote: si falla Internet a mitad, el siguiente ciclo solo reenvía lo pendiente.
        db.executemany("INSERT INTO enviado_tarea VALUES(?,?,?) ON CONFLICT(tarea,clave) DO UPDATE SET hash=excluded.hash",[(tarea,r["clave"],r["fila_hash"]) for r in batch if not r.get("eliminada")])
        db.executemany("DELETE FROM enviado_tarea WHERE tarea=? AND clave=?",[(tarea,r["clave"]) for r in batch if r.get("eliminada")]); db.commit()
    if full:
        db.executemany("DELETE FROM enviado_tarea WHERE tarea=? AND clave=?",[(tarea,k) for k in known if k not in actuales]); db.commit()
        put(db,marca,now.isoformat())
    return {"filas":len(rows),"enviadas":len(cambios),"bajas":len(bajas),"cambios_servidor":changed,"modo":mode}
def ciclo(c:dict[str,str]) -> dict:
    """Una vuelta de todas las tareas configuradas; el fallo de una no detiene las demás."""
    resultado:dict[str,Any]={}
    for t in tareas(c):
        try: resultado[t]=run_once(c) if t=="inventario" else run_tarea(c,t)
        except Exception as e:
            LOG.exception("%s: sincronización falló; lo no enviado se reintenta en el siguiente ciclo",t); resultado[t]={"error":str(e)[:300]}
    # Sin inventario no hay latido propio: se envía si ninguna tarea contactó con la API.
    if "inventario" not in resultado and not any(r.get("enviadas") or r.get("bajas") for r in resultado.values()):
        resultado["latido"]=heartbeat(c)
    return resultado
def main():
    logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s"); c=config(); once="--once" in sys.argv
    while True:
        try: LOG.info("Resultado: %s",ciclo(c))
        except Exception: LOG.exception("Sincronización falló; lo no enviado se reintenta en el siguiente ciclo")
        if once:return
        time.sleep(max(30,int(c.get("SYNC_INTERVAL_SECONDS","60"))))
if __name__=="__main__": main()