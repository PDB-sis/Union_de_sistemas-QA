"""Instalador del agente NEXO QA en una tienda, una bodega o el PC de creación.

Se ejecuta como administrador (Instalar-NexoQA.exe pide permisos solo):

1. Pide AGENT_CODE y AGENT_TOKEN (de `python -m app.agentes crear-faltantes`) y los prueba con la API.
2. Busca el SQL Server del PC y la base del sitio: BD_SPDV (tienda), GDC_CASA_MATRIZ (bodega) o CREACION.
3. Crea o actualiza el usuario SQL de solo lectura `nexoqa_agente` (clave aleatoria) con SELECT solo
   sobre las tablas que leen las consultas, y comprueba que no puede escribir.
4. Copia el agente a C:\\NexoQA, escribe config.env (solo administradores y SYSTEM pueden leerlo),
   hace la primera carga y deja el servicio con inicio automático, reinicio si falla y la PC sin suspensión.

Repetirlo en un sitio ya instalado actualiza los archivos y conserva el código y el token.
Las credenciales de administrador de SQL Server (si hacen falta) solo se usan en esta ejecución: no se guardan.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import secrets
import shutil
import ssl
import string
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

RAIZ = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
DESTINO = Path(r"C:\NexoQA")
AGENTE_DIR = DESTINO / "agente"
CONSOLA_DIR = DESTINO / "consola"
REGISTRO = DESTINO / "instalacion.log"
SERVICIO = "NexoQAAgenteTienda"
USUARIO_SQL = "nexoqa_agente"
API_URL = "https://apiqa.apipalacio.com"

TABLAS_INVENTARIO = ("INVENTARIO", "MARCAS", "CATEGORIAS", "TASA_CAMBIO", "PARAMETROS")
TABLAS_BODEGA = ("MOVTRANSFERENCIAS", "TRANSFERENCIAS", "DEVTRANSFERENCIAS", "MOVDEVTRANSFERENCIAS", "USUARIOS")
# Base del sitio -> qué hace el agente allí.
PERFILES = {
    "BD_SPDV": {"sitio": "tienda", "tareas": "inventario", "intervalo": 60, "http_timeout": 30,
                "tablas": TABLAS_INVENTARIO},
    "GDC_CASA_MATRIZ": {"sitio": "bodega", "tareas": "inventario,transferencias,devoluciones,usuarios",
                        "intervalo": 300, "http_timeout": 120, "tablas": TABLAS_INVENTARIO + TABLAS_BODEGA},
    "CREACION": {"sitio": "PC de creación", "tareas": "creacion", "intervalo": 60, "http_timeout": 120,
                 "tablas": TABLAS_INVENTARIO},
}


class InstalacionError(Exception):
    """Error que se explica al usuario sin traza."""


def registrar(mensaje: str) -> None:
    """Muestra y guarda en C:\\NexoQA\\instalacion.log. Nunca recibe claves ni tokens."""
    print(mensaje)
    try:
        DESTINO.mkdir(parents=True, exist_ok=True)
        with REGISTRO.open("a", encoding="utf-8") as f:
            f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {mensaje}\n")
    except OSError:
        pass


# --- Configuración -------------------------------------------------------------------

def leer_config(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    valores = {}
    for linea in path.read_text(encoding="utf-8").splitlines():
        if "=" in linea and not linea.lstrip().startswith("#"):
            k, v = linea.split("=", 1)
            valores[k.strip()] = v.strip().strip('"').strip("'")
    return valores


def clave_aleatoria(largo: int = 32) -> str:
    """Solo letras y dígitos: va dentro de CREATE LOGIN y de la cadena ODBC sin escapes."""
    alfabeto = string.ascii_letters + string.digits
    while True:
        clave = "".join(secrets.choice(alfabeto) for _ in range(largo))
        if any(c.islower() for c in clave) and any(c.isupper() for c in clave) and any(c.isdigit() for c in clave):
            return clave


def generar_config(api_url: str, codigo: str, token: str, servidor: str, base: str, clave_sql: str) -> str:
    perfil = PERFILES[base]
    return "\n".join([
        f"# Generado por Instalar-NexoQA el {datetime.now():%Y-%m-%d %H:%M} ({perfil['sitio']}).",
        "# Para cambiarlo, vuelva a ejecutar Instalar-NexoQA.exe. Contiene secretos: no lo copie ni lo comparta.",
        f"API_URL={api_url}",
        f"AGENT_CODE={codigo}",
        f"AGENT_TOKEN={token}",
        "SQL_DRIVER=auto",
        f"SQL_SERVER={servidor}",
        f"SQL_DATABASE={base}",
        f"SQL_USER={USUARIO_SQL}",
        f"SQL_PASSWORD={clave_sql}",
        "SQL_CONNECTION_TIMEOUT=10",
        "SQL_ENCRYPT=auto",
        "SQL_TRUST_SERVER_CERTIFICATE=yes",
        f"TAREAS={perfil['tareas']}",
        f"SYNC_INTERVAL_SECONDS={perfil['intervalo']}",
        "OVERLAP_SECONDS=120",
        "FULL_RECONCILIATION_HOURS=24",
        f"HTTP_TIMEOUT={perfil['http_timeout']}",
        r"STATE_PATH=C:\ProgramData\NexoQA\agente\state.sqlite3",
        "",
    ])


def validar_codigo_token(codigo: str, token: str) -> tuple[str, str]:
    codigo, token = codigo.strip().upper(), token.strip()
    if not (3 <= len(codigo) <= 80) or not all(c.isalnum() or c in "-_" for c in codigo):
        raise InstalacionError(f"El código {codigo!r} no es válido (ejemplo: AGT-PLAZA-LAGO).")
    if not (32 <= len(token) <= 512) or not all(c.isalnum() or c in "-_" for c in token):
        raise InstalacionError("El token no es válido: debe tener al menos 32 caracteres, sin espacios.")
    return codigo, token


# --- API -----------------------------------------------------------------------------

def probar_api(api_url: str, codigo: str, token: str) -> dict:
    """El latido autentica el agente: confirma código, token e Internet antes de tocar nada."""
    peticion = urllib.request.Request(
        api_url.rstrip("/") + "/api/agente/v1/latido", data=b"{}", method="POST",
        headers={"Content-Type": "application/json", "X-Agente-Codigo": codigo, "X-Agente-Token": token},
    )
    try:
        with urllib.request.urlopen(peticion, timeout=30, context=ssl.create_default_context()) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise InstalacionError("La API rechazó el código o el token. Revise que estén bien copiados "
                                   "y que el agente esté activo (python -m app.agentes listar).") from e
        raise InstalacionError(f"La API respondió {e.code}. Inténtelo de nuevo en unos minutos.") from e
    except (urllib.error.URLError, OSError) as e:
        raise InstalacionError(f"No hay conexión con {api_url}: {getattr(e, 'reason', e)}. "
                               "Revise Internet, la hora del PC y el proxy.") from e


# --- SQL Server ----------------------------------------------------------------------

def instancias_locales() -> list[str]:
    """Nombres de servidor de las instancias de SQL Server instaladas en este PC."""
    import winreg
    nombres: set[str] = set()
    for vista in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL",
                                0, winreg.KEY_READ | vista) as clave:
                i = 0
                while True:
                    try:
                        nombres.add(winreg.EnumValue(clave, i)[0])
                    except OSError:
                        break
                    i += 1
        except OSError:
            continue
    equipo = os.environ.get("COMPUTERNAME", ".")
    return sorted(equipo if n.upper() == "MSSQLSERVER" else f"{equipo}\\{n}" for n in nombres)


def conectar(servidor: str, base: str = "master", usuario: str | None = None, clave: str | None = None):
    import pyodbc
    from qa_agent import TLS_ERRORS, driver
    pyodbc.pooling = False  # cada comprobación abre una conexión real (p. ej. tras cambiar la clave)
    drv = driver({"SQL_DRIVER": "auto"})
    acceso = f"UID={usuario};PWD={clave};" if usuario else "Trusted_Connection=yes;"
    cadena = f"DRIVER={{{drv}}};SERVER={servidor};DATABASE={base};{acceso}TrustServerCertificate=yes;"
    for i, cifrado in enumerate(("yes", "no")):
        try:
            return pyodbc.connect(cadena + f"Encrypt={cifrado};", autocommit=True, timeout=10)
        except pyodbc.Error as e:
            if i == 0 and any(w in str(e).lower() for w in TLS_ERRORS):
                continue
            raise


def bases_del_sitio(cn) -> list[str]:
    nombres = [r[0] for r in cn.execute("SELECT name FROM sys.databases").fetchall()]
    return [b for b in PERFILES if b in nombres]


def preparar_usuario_lectura(servidor: str, base: str, admin: str | None, admin_clave: str | None,
                             cn_master, clave_nueva: str) -> None:
    import pyodbc
    if cn_master.execute("SELECT CAST(SERVERPROPERTY('IsIntegratedSecurityOnly') AS INT)").fetchone()[0] == 1:
        raise InstalacionError(
            f"{servidor} solo acepta autenticación de Windows. Active la autenticación de SQL Server "
            "(modo mixto) en SQL Server Management Studio, reinicie el servicio de SQL Server y vuelva a ejecutar.")
    # La clave solo tiene letras y dígitos (clave_aleatoria): se puede poner literal en CREATE LOGIN.
    assert clave_nueva.isalnum()
    cn_master.execute(f"""
        IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'{USUARIO_SQL}')
            CREATE LOGIN [{USUARIO_SQL}] WITH PASSWORD = N'{clave_nueva}', CHECK_POLICY = OFF, DEFAULT_DATABASE = [{base}];
        ELSE
            ALTER LOGIN [{USUARIO_SQL}] WITH PASSWORD = N'{clave_nueva}';
        ALTER LOGIN [{USUARIO_SQL}] ENABLE;
    """)
    cn = conectar(servidor, base, admin, admin_clave)
    try:
        perfil = PERFILES[base]
        faltan = [t for t in perfil["tablas"] if cn.execute("SELECT OBJECT_ID(?)", f"dbo.{t}").fetchone()[0] is None]
        if faltan:
            raise InstalacionError(f"En {base} faltan las tablas {', '.join(faltan)}: no es la base esperada para una {perfil['sitio']}.")
        cn.execute(f"""
            IF USER_ID(N'{USUARIO_SQL}') IS NULL
                CREATE USER [{USUARIO_SQL}] FOR LOGIN [{USUARIO_SQL}];
            ELSE
                ALTER USER [{USUARIO_SQL}] WITH LOGIN = [{USUARIO_SQL}];
        """)
        for tabla in perfil["tablas"]:
            cn.execute(f"GRANT SELECT ON dbo.[{tabla}] TO [{USUARIO_SQL}]")
    finally:
        cn.close()

    # Comprobación con el propio usuario: lee, y no es administrador ni puede escribir.
    try:
        cn = conectar(servidor, base, USUARIO_SQL, clave_nueva)
    except pyodbc.Error as e:
        raise InstalacionError(f"El usuario {USUARIO_SQL} no pudo entrar a {base}: {e}") from e
    try:
        fila = cn.execute("SELECT IS_SRVROLEMEMBER('sysadmin'), IS_MEMBER('db_owner'), IS_MEMBER('db_datawriter'), "
                          "IS_MEMBER('db_ddladmin')").fetchone()
        if any(v == 1 for v in fila):
            raise InstalacionError(
                f"{USUARIO_SQL} tiene permisos de escritura o de administrador en {servidor}/{base}. "
                "Quíteselos (debe tener solo SELECT) y vuelva a ejecutar.")
        cn.execute("SELECT TOP (1) 1 FROM dbo.INVENTARIO").fetchall()
    finally:
        cn.close()


def elegir(opciones: list[str], que: str) -> str:
    if len(opciones) == 1:
        return opciones[0]
    print(f"Hay varias opciones para {que}:")
    for i, o in enumerate(opciones, start=1):
        print(f"  {i}. {o}")
    while True:
        r = input(f"Elija el número de {que}: ").strip()
        if r.isdigit() and 1 <= int(r) <= len(opciones):
            return opciones[int(r) - 1]


def detectar_sql(servidor: str | None, base: str | None, admin: str | None):
    """Busca la base del sitio como administrador de SQL Server: primero con la cuenta de Windows de quien
    instala y, si no alcanza, con un usuario administrador que se pide una sola vez (no se guarda).

    Devuelve (servidor, base, conexión a master, usuario admin, clave admin)."""
    import pyodbc
    candidatos = [servidor] if servidor else instancias_locales()
    if not candidatos:
        raise InstalacionError("No se encontró SQL Server en este PC. Si está en otro equipo, use --sql-servidor EQUIPO\\INSTANCIA.")

    def buscar(usuario: str | None, clave: str | None):
        hallados, errores = [], []
        quien = usuario or "la cuenta de Windows"
        for s in candidatos:
            try:
                cn = conectar(s, usuario=usuario, clave=clave)
            except pyodbc.Error as e:
                errores.append(f"{s}: no se pudo entrar con {quien} ({str(e)[:160]})")
                continue
            if cn.execute("SELECT IS_SRVROLEMEMBER('sysadmin')").fetchone()[0] != 1:
                cn.close()
                errores.append(f"{s}: {quien} no es administrador")
                continue
            bases = [b for b in bases_del_sitio(cn) if not base or b == base.upper()]
            if bases:
                hallados.append((s, bases, cn))
            else:
                cn.close()
                errores.append(f"{s}: no tiene {base.upper() if base else 'BD_SPDV, GDC_CASA_MATRIZ ni CREACION'}")
        return hallados, errores

    usuario = clave = None
    hallados, errores = ([], []) if admin else buscar(None, None)
    if not hallados:
        if not admin:
            print("Con la cuenta de Windows no se encontró la base del sitio:\n  " + "\n  ".join(errores))
        usuario = admin or input("Usuario administrador de SQL Server (por ejemplo sa): ").strip()
        clave = getpass.getpass(f"Clave de {usuario} (solo para esta instalación, no se guarda): ")
        hallados, errores = buscar(usuario, clave)
    if not hallados:
        raise InstalacionError("No se encontró la base del sitio:\n  " + "\n  ".join(errores))

    opciones = [(s, b, cn) for s, bases, cn in hallados for b in bases]
    etiquetas = [f"{s} / {b}" for s, b, _ in opciones]
    s, b, cn = opciones[etiquetas.index(elegir(etiquetas, "la base del sitio"))]
    for _, _, otra in hallados:
        if otra is not cn:
            otra.close()
    return s, b, cn, usuario, clave


# --- Windows: archivos, servicio y energía --------------------------------------------

def es_administrador() -> bool:
    import ctypes
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except OSError:
        return False


def sc(*args: str, verificar: bool = False) -> subprocess.CompletedProcess:
    r = subprocess.run(["sc.exe", *args], capture_output=True, text=True, encoding="mbcs", errors="replace")
    if verificar and r.returncode != 0:
        raise InstalacionError(f"sc {' '.join(args)} falló: {(r.stdout or r.stderr).strip()}")
    return r


def estado_servicio() -> str | None:
    r = sc("query", SERVICIO)
    if r.returncode != 0:
        return None
    for estado in ("RUNNING", "STOPPED", "START_PENDING", "STOP_PENDING"):
        if estado in r.stdout:
            return estado
    return "DESCONOCIDO"


def detener_servicio() -> None:
    if estado_servicio() in (None, "STOPPED"):
        return
    sc("stop", SERVICIO)
    for _ in range(60):
        if estado_servicio() == "STOPPED":
            return
        time.sleep(1)
    raise InstalacionError(f"El servicio {SERVICIO} no se detuvo en 60 s; deténgalo a mano y vuelva a ejecutar.")


def copiar_archivos() -> None:
    for nombre, destino in (("NexoQAAgenteTienda", AGENTE_DIR), ("NexoQAAgenteTiendaConsola", CONSOLA_DIR)):
        origen = RAIZ / nombre
        if not (origen / f"{nombre}.exe").exists():
            raise InstalacionError(f"Falta la carpeta {nombre} junto al instalador. Descomprima el paquete completo.")
        destino.mkdir(parents=True, exist_ok=True)
        for hijo in origen.iterdir():
            if hijo.name in ("config.env", "agente.log"):
                continue
            objetivo = destino / hijo.name
            if hijo.is_dir():
                shutil.copytree(hijo, objetivo, dirs_exist_ok=True)
            else:
                shutil.copy2(hijo, objetivo)


def guardar_config(contenido: str) -> Path:
    path = AGENTE_DIR / "config.env"
    path.write_text(contenido, encoding="utf-8")
    # Solo Administradores (S-1-5-32-544) y SYSTEM (S-1-5-18, la cuenta del servicio) pueden leerlo.
    subprocess.run(["icacls", str(path), "/inheritance:r", "/grant:r", "*S-1-5-32-544:F", "*S-1-5-18:F"],
                   capture_output=True, check=False)
    return path


def primera_carga(config_path: Path) -> bool:
    registrar("Primera carga (puede tardar varios minutos en una bodega)...")
    entorno = {**os.environ, "QA_AGENT_CONFIG": str(config_path)}
    r = subprocess.run([str(CONSOLA_DIR / "NexoQAAgenteTiendaConsola.exe"), "--once"], env=entorno)
    return r.returncode == 0


def instalar_servicio() -> None:
    exe = AGENTE_DIR / "NexoQAAgenteTienda.exe"
    if estado_servicio() is not None:
        subprocess.run([str(exe), "remove"], capture_output=True)
        for _ in range(30):
            if estado_servicio() is None:
                break
            time.sleep(1)
    r = subprocess.run([str(exe), "--startup", "delayed", "install"], capture_output=True, text=True,
                       encoding="mbcs", errors="replace")
    if estado_servicio() is None:
        raise InstalacionError(f"No se pudo instalar el servicio: {(r.stdout + r.stderr).strip()}")
    # Si el proceso se cae, Windows lo reinicia al minuto (siempre).
    sc("failure", SERVICIO, "reset=", "86400", "actions=", "restart/60000/restart/60000/restart/60000", verificar=True)
    sc("failureflag", SERVICIO, "1")
    sc("start", SERVICIO)
    for _ in range(30):
        if estado_servicio() == "RUNNING":
            return
        time.sleep(1)
    raise InstalacionError(f"El servicio quedó instalado pero no arrancó. Revise {AGENTE_DIR / 'agente.log'}.")


def sin_suspension() -> None:
    """Enchufado a la corriente, el PC no se suspende ni hiberna: el agente debe correr siempre."""
    for ajuste in ("standby-timeout-ac", "hibernate-timeout-ac"):
        subprocess.run(["powercfg", "/change", ajuste, "0"], capture_output=True)


def diagnostico(api_url: str) -> int:
    """Solo lee: drivers ODBC, instancias de SQL Server, servicio, configuración (sin secretos) e Internet."""
    import pyodbc
    print("Drivers ODBC de SQL Server:", ", ".join(d for d in pyodbc.drivers() if "SQL" in d) or "ninguno")
    print("Instancias de SQL Server en este PC:", ", ".join(instancias_locales()) or "ninguna")
    print(f"Servicio {SERVICIO}:", estado_servicio() or "no instalado")
    anterior = leer_config(AGENTE_DIR / "config.env")
    if anterior:
        print(f"Configuración actual: {anterior.get('AGENT_CODE')} · {anterior.get('SQL_SERVER')} / "
              f"{anterior.get('SQL_DATABASE')} · TAREAS={anterior.get('TAREAS')}")
    else:
        print(f"Configuración actual: no hay {AGENTE_DIR / 'config.env'}")
    try:
        with urllib.request.urlopen(api_url.rstrip("/") + "/api/health", timeout=15,
                                    context=ssl.create_default_context()) as r:
            print(f"API {api_url}: responde ({r.status}).")
    except (urllib.error.URLError, OSError) as e:
        print(f"API {api_url}: sin conexión ({getattr(e, 'reason', e)}).")
    return 0


def desinstalar() -> int:
    if estado_servicio() is None:
        registrar("El servicio no está instalado.")
        return 0
    detener_servicio()
    subprocess.run([str(AGENTE_DIR / "NexoQAAgenteTienda.exe"), "remove"], capture_output=True)
    registrar(f"Servicio {SERVICIO} quitado. Los archivos de {DESTINO} se conservan.")
    return 0


# --- Flujo principal -----------------------------------------------------------------

def instalar(args: argparse.Namespace) -> int:
    anterior = leer_config(AGENTE_DIR / "config.env")
    codigo = args.codigo or (anterior.get("AGENT_CODE") if not args.token else None)
    token = args.token or (anterior.get("AGENT_TOKEN") if not args.codigo else None)
    if codigo and token and not (args.codigo or args.token):
        registrar(f"Se reutiliza el agente ya configurado en este PC: {codigo}.")
    if not codigo:
        codigo = input("AGENT_CODE (por ejemplo AGT-PLAZA-LAGO): ")
    if not token:
        token = getpass.getpass("AGENT_TOKEN (se pega con clic derecho; no se ve al escribirlo): ")
    codigo, token = validar_codigo_token(codigo, token)
    api_url = args.api_url or anterior.get("API_URL") or API_URL

    registrar(f"[1/6] Probando el código {codigo} con {api_url}...")
    sitio = probar_api(api_url, codigo, token)
    registrar(f"      Aceptado (dimID {sitio.get('dim_id_tienda')}, sucursal {sitio.get('sucursal_id')}).")

    registrar("[2/6] Buscando SQL Server y la base del sitio...")
    servidor, base, cn_master, admin, admin_clave = detectar_sql(
        args.sql_servidor or None, args.base, args.sql_admin)
    perfil = PERFILES[base]
    registrar(f"      {servidor} / {base}: {perfil['sitio']} (TAREAS={perfil['tareas']}).")

    registrar(f"[3/6] Preparando el usuario de solo lectura {USUARIO_SQL}...")
    clave_sql = clave_aleatoria()
    try:
        preparar_usuario_lectura(servidor, base, admin, admin_clave, cn_master, clave_sql)
    finally:
        cn_master.close()
    registrar(f"      Listo: SELECT sobre {', '.join(perfil['tablas'])}.")

    registrar(f"[4/6] Copiando el agente a {DESTINO}...")
    detener_servicio()
    copiar_archivos()
    config_path = guardar_config(generar_config(api_url, codigo, token, servidor, base, clave_sql))

    if args.sin_primera_carga:
        registrar("[5/6] Primera carga omitida (--sin-primera-carga): la hará el servicio.")
    elif primera_carga(config_path):
        registrar("[5/6] Primera carga terminada.")
    else:
        registrar("[5/6] AVISO: la primera carga falló; el servicio la reintentará. "
                  f"Revise el mensaje de arriba y {AGENTE_DIR / 'agente.log'}.")

    registrar("[6/6] Instalando el servicio (inicio automático y reinicio si falla)...")
    instalar_servicio()
    if not args.sin_energia:
        sin_suspension()
        registrar("      El PC ya no se suspende ni hiberna mientras esté enchufado.")
    registrar(f"Instalación terminada: el servicio {SERVICIO} está en marcha y arranca solo al encender el PC.")
    registrar(f"Registro del agente: {AGENTE_DIR / 'agente.log'}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="Instalar-NexoQA", description="Instala el agente NEXO QA en este PC.")
    parser.add_argument("--codigo", help="AGENT_CODE del sitio.")
    parser.add_argument("--token", help="AGENT_TOKEN del sitio (si no se indica, se pide sin mostrarlo).")
    parser.add_argument("--api-url", help=f"Por defecto {API_URL}.")
    parser.add_argument("--sql-servidor", help="EQUIPO\\INSTANCIA si SQL Server no está en este PC o hay varias.")
    parser.add_argument("--base", choices=sorted(PERFILES), help="Base del sitio, si hay varias.")
    parser.add_argument("--sql-admin", help="Usuario administrador de SQL Server (por defecto, la cuenta de Windows).")
    parser.add_argument("--sin-primera-carga", action="store_true", help="No hace la carga inicial con la consola.")
    parser.add_argument("--sin-energia", action="store_true", help="No cambia la suspensión del PC.")
    parser.add_argument("--desinstalar", action="store_true", help="Detiene y quita el servicio (conserva los archivos).")
    parser.add_argument("--diagnostico", action="store_true", help="Solo muestra el estado del PC; no cambia nada.")
    parser.add_argument("--sin-pausa", action="store_true", help="No espera Enter al terminar.")
    args = parser.parse_args(argv)

    print("Instalador del agente NEXO QA\n")
    codigo = 1
    try:
        if args.diagnostico:
            codigo = diagnostico(args.api_url or API_URL)
        elif not es_administrador():
            raise InstalacionError("Ejecute el instalador como administrador (clic derecho > Ejecutar como administrador).")
        else:
            codigo = desinstalar() if args.desinstalar else instalar(args)
    except InstalacionError as e:
        registrar(f"ERROR: {e}")
    except KeyboardInterrupt:
        registrar("Instalación cancelada.")
    except Exception as e:  # noqa: BLE001 - se informa al usuario y queda en el registro
        registrar(f"ERROR inesperado: {type(e).__name__}: {e}")
    if not args.sin_pausa and sys.stdin and sys.stdin.isatty():
        input("\nPulse Enter para cerrar...")
    return codigo


if __name__ == "__main__":
    sys.exit(main())
