"""Rehace la carpeta Servidor/ que se copia al servidor: solo backends y lo necesario para operar.

    python deployment/preparar_servidor.py

Contenido de Servidor/ (sin interfaces: PDMC y NEXO QA se publican en Netlify):
- PDMC-API/: API de PDMC (package.json y package-lock.json de la raíz, backend/ y contratos/),
  tomada de lo confirmado en Git (git archive HEAD) de PDMC-APP, sin pruebas.
- CYSN_QA/backend/: API de NEXO QA, sus migraciones y scripts, de lo confirmado en Git de CYSN_QA, sin pruebas.
- deployment/: scripts de despliegue, Caddy y el .bat de arranque.
- backups/unificada/: SQL de estructura que usa Crear-Base-Unificada.ps1.
- El .zip más reciente del agente de tienda (se instala en los sitios, no en el servidor).

Nunca lleva .env, .env.local, config.env, .secrets, .git, node_modules, logs ni respaldos .dump.
Los archivos que solo existen en Servidor/ (el .bat y los .cmd de arranque, el Caddyfile completo y
04_cysn_qa_catalogos.sql) se toman de la Servidor/ anterior. La Servidor/ anterior se mueve a
respaldos-locales/ (puede llevar secretos: no se publica).
"""
from __future__ import annotations

import io
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DESTINO = RAIZ / "Servidor"
# Archivos que solo viven en Servidor/ y se conservan entre versiones.
PROPIOS_DE_SERVIDOR = ["deployment/Inicio-servicios-IAN.bat", "deployment/Inicio-servicios-IAN.anterior.bat",
                       "deployment/Iniciar-API-QA.cmd", "deployment/Iniciar-PDMC.cmd",
                       "deployment/caddy/Caddyfile", "backups/unificada/04_cysn_qa_catalogos.sql"]
DEL_PROYECTO = ["deployment/DESPLIEGUE-PDMC-API.md", "deployment/Aplicar-Migracion-CYSN.ps1", "deployment/Crear-Base-Unificada.ps1",
                "deployment/Iniciar-Backend-QA.ps1", "deployment/Revisar-Datos-Bodega.ps1",
                "deployment/requirements-qa-production.txt", "deployment/caddy/Caddyfile.apiqa",
                "deployment/caddy/README.md", "backups/unificada/00_crear_esquemas.sql",
                "backups/unificada/01_pdmc_estructura.sql", "backups/unificada/02_cysn_qa_estructura.sql",
                "backups/unificada/03_verificar_estructura.sql"]
PROHIBIDOS = {".git", ".env", ".env.local", "config.env", ".secrets", "node_modules", "logs", ".venv",
              "__pycache__", ".pytest_cache", "generated", "frontend", ".next", "tests"}


def git_archive(repo: Path, rutas: list[str], destino: Path, quitar: list[str]) -> str:
    """Extrae de HEAD solo lo confirmado; avisa si hay cambios sin confirmar en esas rutas."""
    pendientes = subprocess.run(["git", "-C", str(repo), "status", "--porcelain", "--", *rutas],
                                capture_output=True, text=True, check=True).stdout.strip()
    if pendientes:
        sys.exit(f"{repo.name} tiene cambios sin confirmar; confírmelos antes de preparar el paquete:\n{pendientes}")
    datos = subprocess.run(["git", "-C", str(repo), "archive", "--format=tar", "HEAD", *rutas],
                           capture_output=True, check=True).stdout
    with tarfile.open(fileobj=io.BytesIO(datos)) as tar:
        tar.extractall(destino, filter="data")
    for ruta in quitar:
        objetivo = destino / ruta
        shutil.rmtree(objetivo) if objetivo.is_dir() else objetivo.unlink(missing_ok=True)
    return subprocess.run(["git", "-C", str(repo), "rev-parse", "--short", "HEAD"],
                          capture_output=True, text=True, check=True).stdout.strip()


def main() -> int:
    anterior = None
    if DESTINO.exists():
        anterior = RAIZ / "respaldos-locales" / f"Servidor-{datetime.now():%Y%m%d-%H%M%S}"
        anterior.parent.mkdir(exist_ok=True)
        shutil.move(DESTINO, anterior)
    nuevo = DESTINO
    nuevo.mkdir()

    pdmc = git_archive(RAIZ / "PDMC-APP", ["package.json", "package-lock.json", "backend", "contratos"],
                       nuevo / "PDMC-API", ["backend/tests", "contratos/tests"])
    cysn = git_archive(RAIZ / "CYSN_QA", ["backend"], nuevo / "CYSN_QA",
                       ["backend/tests", "backend/docs", "backend/pytest.ini"])

    for ruta in DEL_PROYECTO:
        (nuevo / ruta).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(RAIZ / ruta, nuevo / ruta)
    faltan = []
    for ruta in PROPIOS_DE_SERVIDOR:
        origen = anterior / ruta if anterior else None
        if origen and origen.exists():
            (nuevo / ruta).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(origen, nuevo / ruta)
        elif not ruta.endswith(".anterior.bat"):
            faltan.append(ruta)
    zips = sorted(anterior.glob("NexoQAAgente-*.zip")) if anterior else []
    if zips:
        shutil.copy2(zips[-1], nuevo / zips[-1].name)
    else:
        faltan.append("NexoQAAgente-*.zip")

    indebidos = [str(p.relative_to(nuevo)) for p in nuevo.rglob("*")
                 if p.name in PROHIBIDOS or p.suffix in {".dump", ".log", ".pyc", ".pem", ".key", ".pfx"}]
    if indebidos:
        print("NO COPIAR: el paquete tiene archivos indebidos:", *indebidos, sep="\n  - ", file=sys.stderr)
        return 1
    archivos = sum(1 for p in nuevo.rglob("*") if p.is_file())
    print(f"Servidor/ lista ({archivos} archivos): PDMC-APP {pdmc}, CYSN_QA {cysn}, agente {zips[-1].name if zips else '-'}.")
    if anterior:
        print(f"La versión anterior quedó en {anterior}")
    for ruta in faltan:
        print(f"AVISO: falta {ruta} (no estaba en la Servidor/ anterior).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
