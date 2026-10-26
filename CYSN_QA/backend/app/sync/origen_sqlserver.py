"""
Lectura de CREACION en SQL Server.

Este módulo SOLO ejecuta lecturas:
- la consulta versionada sql/creacion_origen.sql;
- SELECT 1 y consultas de permisos para verificar que el usuario
  no pueda modificar SQL Server.

La conexión usa ApplicationIntent=ReadOnly y la transacción siempre se
revierte al cerrar. La garantía real de solo lectura la da el usuario
cysn_sync creado por el DBA con permisos únicamente de SELECT.
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from app.sync.config import ConfigSqlServer


RUTA_CONSULTA = Path(__file__).parent / "sql" / "creacion_origen.sql"

TABLAS_ORIGEN = (
    "dbo.INVENTARIO",
    "dbo.MARCAS",
    "dbo.CATEGORIAS",
    "dbo.TASA_CAMBIO",
    "dbo.PARAMETROS",
)

PERMISOS_PROHIBIDOS = (
    "INSERT",
    "UPDATE",
    "DELETE",
    "ALTER",
    "CONTROL",
    "TAKE OWNERSHIP",
)


class OrigenNoDisponibleError(RuntimeError):
    """Error transitorio de conexión o lectura en SQL Server."""


class OrigenNoSeguroError(RuntimeError):
    """El usuario configurado tiene permisos de escritura en SQL Server."""


def leer_consulta() -> str:
    return RUTA_CONSULTA.read_text(encoding="utf-8")


@contextmanager
def conectar(config: ConfigSqlServer) -> Iterator[Any]:
    import pyodbc

    try:
        conexion = pyodbc.connect(
            config.connection_string(),
            autocommit=False,
            timeout=config.login_timeout,
            readonly=True,
        )
    except pyodbc.Error as exc:
        raise OrigenNoDisponibleError(
            f"No se pudo conectar a SQL Server: {exc}"
        ) from exc

    conexion.timeout = config.query_timeout

    try:
        yield conexion
    finally:
        try:
            conexion.rollback()
        finally:
            conexion.close()


def verificar_solo_lectura(conexion: Any) -> dict[str, Any]:
    """
    Ejecuta SELECT 1 y revisa permisos efectivos del usuario.

    Retorna un detalle de permisos; no modifica nada.
    """
    cursor = conexion.cursor()

    cursor.execute("SELECT 1")
    cursor.fetchone()

    detalle: dict[str, Any] = {"select_1": True, "permisos_escritura": []}

    for tabla in TABLAS_ORIGEN:
        for permiso in PERMISOS_PROHIBIDOS:
            cursor.execute(
                "SELECT HAS_PERMS_BY_NAME(?, 'OBJECT', ?)",
                tabla,
                permiso,
            )
            valor = cursor.fetchone()[0]

            if valor == 1:
                detalle["permisos_escritura"].append(f"{permiso} {tabla}")

        cursor.execute("SELECT HAS_PERMS_BY_NAME(?, 'OBJECT', 'SELECT')", tabla)
        if cursor.fetchone()[0] != 1:
            detalle.setdefault("sin_select", []).append(tabla)

    for permiso in ("CREATE TABLE", "ALTER ANY SCHEMA", "EXECUTE"):
        cursor.execute(
            "SELECT HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', ?)",
            permiso,
        )
        if cursor.fetchone()[0] == 1:
            detalle["permisos_escritura"].append(f"{permiso} (DATABASE)")

    cursor.execute(
        "SELECT IS_MEMBER('db_owner'), IS_MEMBER('db_datawriter'), "
        "IS_SRVROLEMEMBER('sysadmin')"
    )
    db_owner, db_datawriter, sysadmin = cursor.fetchone()

    for nombre, valor in (
        ("db_owner", db_owner),
        ("db_datawriter", db_datawriter),
        ("sysadmin", sysadmin),
    ):
        if valor == 1:
            detalle["permisos_escritura"].append(f"miembro de {nombre}")

    cursor.close()

    return detalle


def leer_creacion(
    config: ConfigSqlServer,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Lee la fotografía completa de CREACION.

    Retorna (filas, detalle_permisos).
    """
    import pyodbc

    consulta = leer_consulta()

    with conectar(config) as conexion:
        try:
            permisos = verificar_solo_lectura(conexion)
        except pyodbc.Error as exc:
            raise OrigenNoDisponibleError(
                f"Error verificando permisos en SQL Server: {exc}"
            ) from exc

        if permisos.get("sin_select"):
            raise OrigenNoSeguroError(
                "El usuario no tiene SELECT sobre: "
                + ", ".join(permisos["sin_select"])
            )

        if config.require_readonly and permisos["permisos_escritura"]:
            raise OrigenNoSeguroError(
                "El usuario de SQL Server tiene permisos de escritura "
                "y la sincronización se detuvo por seguridad: "
                + ", ".join(permisos["permisos_escritura"])
            )

        try:
            cursor = conexion.cursor()
            cursor.execute("SET NOCOUNT ON;\n" + consulta)
            columnas = [d[0] for d in cursor.description]
            filas = [dict(zip(columnas, fila)) for fila in cursor.fetchall()]
            cursor.close()
        except pyodbc.Error as exc:
            raise OrigenNoDisponibleError(
                f"Error leyendo CREACION en SQL Server: {exc}"
            ) from exc

    return filas, permisos
