"""
Configuración del worker de sincronización CREACION.

Todos los secretos se leen de variables de entorno (o del .env del backend).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal

from dotenv import load_dotenv


load_dotenv()


def _bool(nombre: str, defecto: bool) -> bool:
    valor = os.getenv(nombre)

    if valor is None or valor.strip() == "":
        return defecto

    return valor.strip().lower() in ("1", "true", "yes", "si", "sí", "on")


def _int(nombre: str, defecto: int) -> int:
    valor = os.getenv(nombre)

    if valor is None or valor.strip() == "":
        return defecto

    return int(valor)


@dataclass(frozen=True)
class ConfigSqlServer:
    enabled: bool
    host: str | None
    instance: str | None
    port: int | None
    database: str
    user: str | None
    password: str | None
    driver: str
    encrypt: bool
    trust_server_certificate: bool
    login_timeout: int
    query_timeout: int
    require_readonly: bool

    def connection_string(self) -> str:
        if not self.host:
            raise ValueError("CYSN_SQLSERVER_HOST no está configurado.")

        if not self.user or not self.password:
            raise ValueError(
                "CYSN_SQLSERVER_USER / CYSN_SQLSERVER_PASSWORD no están configurados."
            )

        host = self.host.strip().rstrip("\\")
        instancia = self.instance.strip().lstrip("\\") if self.instance else None

        if instancia:
            # Debe coincidir exactamente con SERVERDOS\SERVERSQL_DOS.
            server = f"{host}\\{instancia}"
        elif self.port:
            server = f"{host},{self.port}"
        else:
            server = host

        # Se conserva el mismo formato que la conexión ODBC manual validada.
        partes = [
            f"DRIVER={{{self.driver}}}",
            f"SERVER={server}",
            f"DATABASE={self.database}",
            f"UID={self.user}",
            f"PWD={self.password}",
            f"Encrypt={'yes' if self.encrypt else 'no'}",
            "TrustServerCertificate="
            + ("yes" if self.trust_server_certificate else "no"),
        ]

        return ";".join(partes) + ";"


@dataclass(frozen=True)
class ConfigSync:
    sqlserver: ConfigSqlServer
    intervalo_segundos: int
    reintentos: int
    espera_reintento_segundos: int
    max_bajas_porcentaje: Decimal
    min_filas_validas: int
    # SQLSERVER: lee CREACION directamente. AGENTE: lee lo que envió el agente del
    # PC de creación (agente_fila, tarea creacion) del sitio dim_id_creacion.
    fuente: str = "SQLSERVER"
    dim_id_creacion: int = 2010
    # Segundos sin envíos del agente antes de procesar (que termine de enviar).
    espera_agente_segundos: int = 120


def cargar_config() -> ConfigSync:
    port = os.getenv("CYSN_SQLSERVER_PORT")
    fuente = os.getenv("CYSN_CREACION_FUENTE", "SQLSERVER").strip().upper()

    if fuente not in ("SQLSERVER", "AGENTE"):
        raise ValueError("CYSN_CREACION_FUENTE debe ser SQLSERVER o AGENTE.")

    sqlserver = ConfigSqlServer(
        enabled=_bool("CYSN_SQLSERVER_ENABLED", False),
        host=os.getenv("CYSN_SQLSERVER_HOST"),
        instance=os.getenv("CYSN_SQLSERVER_INSTANCE") or None,
        port=int(port) if port else None,
        database=os.getenv("CYSN_SQLSERVER_DATABASE", "CREACION"),
        user=os.getenv("CYSN_SQLSERVER_USER"),
        password=os.getenv("CYSN_SQLSERVER_PASSWORD"),
        driver=os.getenv(
            "CYSN_SQLSERVER_DRIVER",
            "ODBC Driver 18 for SQL Server",
        ),
        encrypt=_bool("CYSN_SQLSERVER_ENCRYPT", True),
        trust_server_certificate=_bool(
            "CYSN_SQLSERVER_TRUST_SERVER_CERTIFICATE",
            False,
        ),
        login_timeout=_int("CYSN_SQLSERVER_LOGIN_TIMEOUT", 15),
        query_timeout=_int("CYSN_SQLSERVER_QUERY_TIMEOUT", 300),
        require_readonly=_bool("CYSN_SQLSERVER_REQUIRE_READONLY", True),
    )

    return ConfigSync(
        sqlserver=sqlserver,
        intervalo_segundos=_int("CYSN_SYNC_INTERVALO_SEGUNDOS", 180),
        reintentos=_int("CYSN_SYNC_REINTENTOS", 3),
        espera_reintento_segundos=_int("CYSN_SYNC_ESPERA_REINTENTO_SEGUNDOS", 10),
        max_bajas_porcentaje=Decimal(
            os.getenv("CYSN_SYNC_MAX_BAJAS_PORCENTAJE", "20")
        ),
        min_filas_validas=_int("CYSN_SYNC_MIN_FILAS_VALIDAS", 1),
        fuente=fuente,
        dim_id_creacion=_int("CYSN_CREACION_DIM_ID", 2010),
        espera_agente_segundos=_int("CYSN_CREACION_ESPERA_AGENTE_SEGUNDOS", 120),
    )
