"""Prepara la copia limpia del proyecto para el repositorio PÚBLICO de GitHub.

    python deployment/exportar_github.py <carpeta del clon de Union_de_sistemas-QA>

- Copia el código y la documentación SIN secretos, respaldos, logs, Servidor/, binarios
  ni las carpetas .git de PDMC-APP y CYSN_QA (que siguen siendo repositorios aparte).
- Quita de la copia la auditoría de seguridad (sección 7 de contexto.md): no se publica.
- Revisa la copia en busca de secretos y se detiene si encuentra alguno.
- No hace commit ni push: revise "git status" en el clon y súbalo usted.

La carpeta destino debe ser un clon de https://github.com/PDB-sis/Union_de_sistemas-QA.
Se reemplaza su contenido (salvo .git) por la copia nueva.
"""
from __future__ import annotations

import re
import shutil
import sys
from fnmatch import fnmatch
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
INCLUIR = [".claude/agents", "CYSN_QA", "PDMC-APP", "consultaPDMC", "deployment", "docker",
           "contexto.md", "PLAN-agente-multisitio.md", "README.md", "DOCKER.md", "compose.yaml",
           ".env.example", ".gitignore", ".gitattributes", ".dockerignore"]
# Nombres de carpeta o archivo que nunca se copian, estén donde estén.
EXCLUIR = [".git", "node_modules", ".next", "generated", ".venv", "__pycache__", ".pytest_cache",
           ".env", ".env.local", ".secrets", "config.env", "dist", "build", "backups", "logs",
           "Servidor", ".integracion-pdmc", ".runtime", "entregables", "next-env.d.ts",
           "*.pyc", "*.dump", "*.rar", "*.zip", "*.log", "*.pem", "*.key", "*.pfx", "*.cer",
           "*.sqlite3", "*.tsbuildinfo", "*.exe"]
SOSPECHOSOS = [
    re.compile(r"postgres(ql)?://[^:/\s\"']+:(?!\*\*\*|CLAVE|clave|USUARIO|\$\{)[^@\s\"']{6,}@(?!127\.0\.0\.1:5432/pdmc_test)"),
    # Cadenas de conexión de .NET/ODBC: ...;Password=valor;
    re.compile(r";\s*(?i:password|pwd)=(?![A-Z0-9_]+[;'\"\s])[^;'\"\s{$]{4,}"),
    re.compile(r"BEGIN [A-Z ]*PRIVATE KEY"),
    # Asignaciones con un valor real (los marcadores de ejemplo van en MAYÚSCULAS_CON_GUIONES).
    re.compile(r"^(AGENT_TOKEN|JWT_SECRET_KEY|POSTGRES_PASSWORD|NEXOQA_JWT_SECRET|SSO_SECRET|"
               r"[A-Z_]*PASSWORD)=(?![A-Z0-9_]+\s*$)[^\s<#]{8,}", re.M),
]


def excluido(nombre: str) -> bool:
    return any(fnmatch(nombre, patron) for patron in EXCLUIR) and nombre != ".env.example"


def copiar(origen: Path, destino: Path) -> None:
    if origen.is_dir():
        for hijo in origen.iterdir():
            if not excluido(hijo.name):
                copiar(hijo, destino / hijo.name)
    else:
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(origen, destino)


def limpiar_documentacion(destino: Path) -> None:
    contexto = destino / "contexto.md"
    texto = contexto.read_text(encoding="utf-8")
    inicio, fin = texto.find("\n## 7."), texto.find("\n## 8.")
    if inicio != -1 and fin != -1:
        texto = (texto[:inicio] + "\n## 7. Seguridad\n\n> La auditoría de seguridad y su plan de acción **no se publican** "
                 "en este repositorio público. Se mantienen en la copia interna de `contexto.md`.\n\n---\n" + texto[fin:])
    texto = re.sub(r"\r?\n- ⚠️ \*\*`CYSN_QA` (tiene versionados|dejó de versionar)[^\n]*\n", "\n", texto)
    texto = texto.replace("(auditoría de seguridad en la sección 7; agentes de Claude Code en la sección 8)",
                          "(agentes de Claude Code en la sección 8)")
    contexto.write_text(texto, encoding="utf-8")
    auditor = destino / ".claude/agents/auditor-seguridad.md"
    if auditor.exists():
        auditor.write_text(re.sub(r"\*\*Empieza siempre leyendo `contexto\.md`, sección 7\.\*\*[^\n]*",
                                  "**Empieza por la auditoría interna de seguridad** (no se publica en este repositorio): "
                                  "para cada hallazgo conocido comprueba en el código si sigue abierto y dilo explícitamente.",
                                  auditor.read_text(encoding="utf-8")), encoding="utf-8")
    despliegue = destino / ".claude/agents/preparador-despliegue.md"
    if despliegue.exists():
        despliegue.write_text(re.sub(r" Hoy `Servidor/` sí los lleva \(hallazgo M6 de `contexto\.md`\)[^\n]*", "",
                                     despliegue.read_text(encoding="utf-8")), encoding="utf-8")


def revisar(destino: Path) -> list[str]:
    hallazgos = []
    for archivo in destino.rglob("*"):
        if ".git" in archivo.parts or not archivo.is_file() or archivo.name == Path(__file__).name:
            continue
        if excluido(archivo.name):
            hallazgos.append(f"{archivo.relative_to(destino)}: archivo que no debería estar")
            continue
        if archivo.stat().st_size > 5_000_000:
            hallazgos.append(f"{archivo.relative_to(destino)}: pesa más de 5 MB")
        try:
            texto = archivo.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for patron in SOSPECHOSOS:
            for m in patron.finditer(texto):
                hallazgos.append(f"{archivo.relative_to(destino)}: posible secreto «{m.group(0)[:40]}»")
    if "## 7. Seguridad" in (destino / "contexto.md").read_text(encoding="utf-8") and \
            "Plan de acción por prioridad" in (destino / "contexto.md").read_text(encoding="utf-8"):
        hallazgos.append("contexto.md: la auditoría de seguridad sigue en la copia")
    return hallazgos


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    destino = Path(sys.argv[1]).resolve()
    if not (destino / ".git").is_dir():
        print(f"Error: {destino} no es un clon de Git (falta .git).", file=sys.stderr)
        return 2
    for hijo in destino.iterdir():
        if hijo.name != ".git":
            shutil.rmtree(hijo) if hijo.is_dir() else hijo.unlink()
    for ruta in INCLUIR:
        origen = RAIZ / ruta
        if origen.exists():
            copiar(origen, destino / ruta)
    limpiar_documentacion(destino)
    hallazgos = revisar(destino)
    if hallazgos:
        print("NO SUBIR: la revisión encontró posibles secretos o archivos indebidos:", file=sys.stderr)
        for h in hallazgos:
            print("  - " + h, file=sys.stderr)
        return 1
    archivos = sum(1 for a in destino.rglob("*") if a.is_file() and ".git" not in a.parts)
    print(f"Copia limpia lista en {destino} ({archivos} archivos). Revise 'git status' y súbala.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
