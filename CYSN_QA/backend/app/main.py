import os
import re
import threading
from time import time

import os
import re
import threading
from time import time

from datetime import (
    date,
    datetime,
    timezone,
)
from pathlib import Path

from app.schemas.qa_metricas import (
    QAMetricasResumen,
    QAMetricasTiposDiferencia,
    QAMetricasEmpresas,
    QAMetricasSucursales,
)

from app.services.qa_ciclo_engine import (
    ejecutar_qa_ciclo,
)

from app.schemas.qa_metricas_operativas import (
    QAMetricasResumenOperativo,
)

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
    Query,
)

from app.services.qa_import_engine import (
    importar_qa_existente,
)

from app.services.qa_ciclo_engine import (
    ejecutar_qa_ciclo,
)

from app.models.qa_correccion import QACorreccion
from app.models.qa_diferencia import QADiferencia
from app.models.qa_resultado import QAResultado
from app.models.qa_tipo_diferencia import QATipoDiferencia
from app.models.user import User
from app.models.rol import Rol
from app.models.user_sucursal import UserSucursal
from app.models.sucursal import Sucursal
from app.models.empresa import Empresa
from app.models.qa_ciclo import QACiclo
from app.models.qa_ciclo_sucursal import QACicloSucursal
from app.models.inventario_carga import InventarioCarga
from app.models.inventario_detalle import InventarioDetalle
from app.schemas.inventario_fase2 import (
    InventarioCSVValidacionResponse,
    InventarioCargaRegistroResponse,
    InventarioProcesamientoResponse,
)
from app.schemas.auth import (
    CurrentUserResponse,
    LoginRequest,
    LoginResponse,
    RoleAccessResponse,
)
from app.schemas.sucursal_usuario import (
    SucursalAccessResponse,
    SucursalAsignadaResponse,
    SucursalUserCreate,
    SucursalUserCreatedResponse,
)
from app.schemas.usuario_admin import (
    CambiarPasswordRequest,
    RolAdminResponse,
    SucursalAdminCatalogoResponse,
    UsuarioAdminCreate,
    UsuarioAdminResponse,
    UsuarioAdminUpdate,
    UsuarioOperacionResponse,
    UsuarioPasswordReset,
    UsuarioSucursalResumen,
    UsuarioSucursalesUpdate,
)
from app.schemas.sucursal_portal import (
    SucursalRecepcionPortalResponse,
)
from app.schemas.qa_ciclo_fase2 import (
    QACicloCreate,
    QACicloResponse,
    QACicloSucursalesAddRequest,
    QACicloSucursalesAddResponse,
    QACicloSucursalResponse,
    QACicloRecepcionResumen,
)
from app.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.schemas.qa_resultado import (
    QAFiltrosDisponibles,
    QAPaginaResultados,
)

from app.schemas.qa_diferencia import (
    QADiferenciaEstadoResponse,
    QADiferenciaEstadoUpdate,
    QAFiltrosDiferencias,
    QAPaginaDiferencias,
)

from pydantic import BaseModel, Field
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
import jwt
from jwt.exceptions import InvalidTokenError
from sqlalchemy import (
    and_,
    delete,
    func,
    or_,
    select,
    text,
)

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.database import (
    check_database_connection,
    get_db,
)
from app.models.qa_ejecucion import QAEjecucion
from app.models.qa_importacion import QAImportacion
from app.schemas.qa_ejecucion import (
    QAEjecucionCreate,
    QAEjecucionResponse,
)
from app.services.qa_import_engine import (
    importar_qa_existente,
)
from app.services.qa_import_service import (
    analizar_archivo_qa,
)
from app.services.inventario_csv_service import (
    analizar_csv_inventario,
    extraer_detalles_csv_inventario,
)
from app.services.inventario_agente_service import (
    tomar_inventarios_pendientes,
)

from app.schemas.qa_correccion import (
    QACorreccionResponse,
    QAPaginaHistorialCorrecciones,
    QAFiltrosHistorialCorrecciones,
)

from app.routers.agente_filas import router as agente_filas_router
from app.routers.agente_tienda import router as agente_tienda_router

app = FastAPI(
    title="NEXO QA API",
    description="API backend del sistema NEXO QA",
    version="0.1.0",
)
app.include_router(agente_tienda_router)
app.include_router(agente_filas_router)


bearer_scheme = HTTPBearer(
    auto_error=False,
)


class PDMCSsoExchangeRequest(BaseModel):
    assertion: str = Field(min_length=32, max_length=4096)


_sso_consumidos: dict[str, int] = {}
_sso_consumidos_lock = threading.Lock()


def _secreto_sso_pdmc() -> str:
    secreto = os.getenv("CYSN_PDMC_SSO_SECRET")
    if not secreto:
        archivo = os.getenv("CYSN_PDMC_SSO_SECRET_FILE", "/run/secrets/pdmc_qa_sso")
        try:
            with open(archivo, "r", encoding="utf-8") as origen:
                secreto = origen.read().strip()
        except OSError:
            secreto = None

    if not secreto or len(secreto) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="El acceso único PDMC no está configurado.",
        )

    return secreto


def _validar_assertion_pdmc(assertion: str) -> dict:
    try:
        payload = jwt.decode(
            assertion,
            _secreto_sso_pdmc(),
            algorithms=["HS256"],
            audience="cysn-qa",
            issuer="pdmc-app",
            options={"require": ["exp", "iat", "jti", "sub", "email", "nombre", "rol"]},
        )
    except (InvalidTokenError, ValueError):
        raise _credenciales_invalidas()

    if payload.get("typ") != "pdmc_sso":
        raise _credenciales_invalidas()

    try:
        expira = int(payload["exp"])
        emitido = int(payload["iat"])
        identificador = str(payload["jti"])
    except (KeyError, TypeError, ValueError):
        raise _credenciales_invalidas()

    ahora = int(time())
    if emitido > ahora + 30 or expira <= ahora or expira - emitido > 60:
        raise _credenciales_invalidas()

    with _sso_consumidos_lock:
        for jti, vence in list(_sso_consumidos.items()):
            if vence <= ahora:
                del _sso_consumidos[jti]
        if identificador in _sso_consumidos:
            raise _credenciales_invalidas()
        _sso_consumidos[identificador] = expira

    return payload


def _usuario_sso_pdmc(payload: dict, db: Session) -> User:
    roles_permitidos = {
        valor.strip()
        for valor in os.getenv(
            "CYSN_PDMC_SSO_ALLOWED_ROLES",
            "ADMINISTRADOR,MEJORA_CONTINUA",
        ).split(",")
        if valor.strip()
    }
    if payload.get("rol") not in roles_permitidos:
        raise _acceso_denegado()

    email = str(payload.get("email") or "").strip().lower()
    nombre = str(payload.get("nombre") or "").strip()
    identificador_pdmc = str(payload.get("sub") or "").strip()
    if not email or len(email) > 180 or not nombre or not identificador_pdmc:
        raise _credenciales_invalidas()

    usuario = db.scalar(select(User).where(func.lower(User.email) == email))
    if usuario is None:
        rol_admin = db.scalar(
            select(Rol).where(
                Rol.nombre == "ADMINISTRADOR",
                Rol.activo.is_(True),
            )
        )
        if rol_admin is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="El rol ADMINISTRADOR de QA no está disponible.",
            )

        sufijo = re.sub(r"[^a-z0-9]", "", identificador_pdmc.lower())[-40:]
        username = f"pdmc_{sufijo}" or "pdmc_usuario"
        if db.scalar(select(User.id).where(User.username == username)) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No se pudo asociar la cuenta de PDMC a QA.",
            )

        usuario = User(
            rol_id=rol_admin.id,
            username=username,
            nombre=nombre[:180],
            email=email,
            password_hash=hash_password(os.urandom(32).hex()),
            activo=True,
        )
        db.add(usuario)
    else:
        rol = db.get(Rol, usuario.rol_id)
        if not usuario.activo or rol is None or not rol.activo or rol.nombre != "ADMINISTRADOR":
            raise _acceso_denegado()
        usuario.nombre = nombre[:180]

    usuario.ultimo_login_at = datetime.now(timezone.utc)
    try:
        db.commit()
        db.refresh(usuario)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo abrir la sesión única de QA.",
        )

    return usuario

@app.post("/api/auth/sso/pdmc", response_model=LoginResponse)
def iniciar_sesion_desde_pdmc(datos: PDMCSsoExchangeRequest, db: Session = Depends(get_db)):
    usuario = _usuario_sso_pdmc(_validar_assertion_pdmc(datos.assertion), db)
    rol = db.get(Rol, usuario.rol_id)
    if rol is None:
        raise _credenciales_invalidas()
    return LoginResponse(
        authenticated=True,
        access_token=create_access_token(usuario.id),
        token_type="bearer",
        user_id=usuario.id,
        username=usuario.username,
        nombre=usuario.nombre,
        email=usuario.email,
        rol_id=usuario.rol_id,
        rol=rol.nombre,
    )


def _condicion_codigo_barra_qa_valido():
    codigo_limpio = func.regexp_replace(
        func.btrim(
            QAResultado.codigo_barra
        ),
        r"^'+",
        "",
        "g",
    )

    return and_(
        QAResultado.codigo_barra.is_not(
            None
        ),
        func.length(
            codigo_limpio
        ) >= 9,
        codigo_limpio.op("~")(
            r"^[0-9]+$"
        ),
    )

# Orígenes del frontend que pueden llamar a la API (por ejemplo, el sitio de Netlify).
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *(
        valor.strip().rstrip("/")
        for valor in os.getenv("CYSN_CORS_ORIGINS", "").split(",")
        if valor.strip()
    ),
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=[
        "GET",
        "POST",
        "PATCH",
        "PUT",
    ],
    allow_headers=[
        "Content-Type",
        "Authorization",
    ],
)

@app.get("/api/health")
def health():
    try:
        database_connected = check_database_connection()

        return {
            "status": "ok",
            "application": "NEXO QA",
            "backend": "connected",
            "database": (
                "connected"
                if database_connected
                else "disconnected"
            ),
        }

    except SQLAlchemyError:
        return {
            "status": "error",
            "application": "NEXO QA",
            "backend": "connected",
            "database": "disconnected",
        }

def _credenciales_invalidas() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
    db: Session = Depends(get_db),
) -> User:
    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
    ):
        raise _credenciales_invalidas()

    try:
        payload = decode_access_token(
            credentials.credentials
        )
        user_id = int(payload["sub"])
    except (
        InvalidTokenError,
        KeyError,
        TypeError,
        ValueError,
    ):
        raise _credenciales_invalidas()

    usuario = db.get(
        User,
        user_id,
    )

    if usuario is None or not usuario.activo:
        raise _credenciales_invalidas()

    return usuario


def _acceso_denegado() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="No tiene permisos para realizar esta acción.",
    )


def require_role(*roles_permitidos: str):

    def dependency(
        usuario: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> tuple[User, Rol]:
        rol = db.get(
            Rol,
            usuario.rol_id,
        )

        if (
            rol is None
            or not rol.activo
            or rol.nombre not in roles_permitidos
        ):
            raise _acceso_denegado()

        return usuario, rol

    return dependency


@app.get("/api/sincronizacion/creacion/estado")
def estado_sincronizacion_creacion(
    _usuario: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Última sincronización SQL Server CREACION -> creacion."""
    try:
        fila = db.execute(
            text(
                """
                SELECT
                    E.ultimo_estado,
                    E.ultimo_modo,
                    E.ultima_ejecucion_en,
                    E.ultimo_exito_en,
                    E.ultimo_error,
                    X.id AS ejecucion_id,
                    X.finalizado_en,
                    X.duracion_ms,
                    X.total_origen,
                    X.total_validos,
                    X.descartados,
                    X.insertados,
                    X.actualizados,
                    X.sin_cambios,
                    X.inactivados,
                    (
                        SELECT count(*)
                        FROM creacion
                        WHERE vigente
                    ) AS codigos_vigentes
                FROM sincronizacion_estado AS E
                LEFT JOIN sincronizacion_ejecucion AS X
                    ON X.id = E.ultima_ejecucion_id
                WHERE E.proceso = 'creacion'
                """
            )
        ).mappings().first()
    except SQLAlchemyError:
        # Migración 001 aún no aplicada.
        db.rollback()
        return {"disponible": False}

    if fila is None:
        return {"disponible": False}

    return {"disponible": True, **dict(fila)}


@app.post(
    "/api/auth/login",
    response_model=LoginResponse,
)
def login(
    datos: LoginRequest,
    db: Session = Depends(get_db),
):
    usuario = db.scalar(
        select(User).where(
            User.username == datos.username
        )
    )

    if (
        usuario is None
        or not usuario.activo
        or not verify_password(
            datos.password,
            usuario.password_hash,
        )
    ):
        raise _credenciales_invalidas()

    rol = db.get(
        Rol,
        usuario.rol_id,
    )

    if rol is None or not rol.activo:
        raise _credenciales_invalidas()

    # Registrar el último inicio de sesión real del usuario.
    # Este dato alimenta la administración y la trazabilidad.
    usuario.ultimo_login_at = datetime.now(
        timezone.utc
    )

    try:
        db.commit()
        db.refresh(usuario)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No se pudo registrar el inicio de sesión."
            ),
        )

    access_token = create_access_token(
        usuario.id
    )

    return LoginResponse(
        authenticated=True,
        access_token=access_token,
        token_type="bearer",
        user_id=usuario.id,
        username=usuario.username,
        nombre=usuario.nombre,
        email=usuario.email,
        rol_id=usuario.rol_id,
        rol=rol.nombre,
    )


@app.get(
    "/api/auth/me",
    response_model=CurrentUserResponse,
)
def obtener_usuario_actual(
    usuario: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rol = db.get(
        Rol,
        usuario.rol_id,
    )

    if rol is None or not rol.activo:
        raise _credenciales_invalidas()

    return CurrentUserResponse(
        user_id=usuario.id,
        username=usuario.username,
        nombre=usuario.nombre,
        email=usuario.email,
        rol_id=usuario.rol_id,
        rol=rol.nombre,
        activo=usuario.activo,
    )

@app.get(
    "/api/auth/check/administrador",
    response_model=RoleAccessResponse,
)
def comprobar_acceso_administrador(
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):
    usuario, rol = acceso

    return RoleAccessResponse(
        authorized=True,
        user_id=usuario.id,
        username=usuario.username,
        rol=rol.nombre,
    )

@app.get(
    "/api/auth/check/sucursal",
    response_model=RoleAccessResponse,
)
def comprobar_acceso_sucursal(
    acceso: tuple[User, Rol] = Depends(
        require_role("SUCURSAL")
    ),
):
    usuario, rol = acceso

    return RoleAccessResponse(
        authorized=True,
        user_id=usuario.id,
        username=usuario.username,
        rol=rol.nombre,
    )

@app.post(
    "/api/admin/usuarios-sucursal",
    response_model=SucursalUserCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_usuario_sucursal(
    datos: SucursalUserCreate,
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):

    _usuario_admin, _rol_admin = acceso

    rol_sucursal = db.scalar(
        select(Rol).where(
            Rol.nombre == "SUCURSAL",
            Rol.activo.is_(True),
        )
    )

    if rol_sucursal is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El rol SUCURSAL no existe o está inactivo.",
        )

    sucursal = db.get(
        Sucursal,
        datos.sucursal_id,
    )

    if sucursal is None or not sucursal.activo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La sucursal indicada no existe o está inactiva.",
        )

    empresa = db.get(
        Empresa,
        sucursal.empresa_id,
    )

    if empresa is None or not empresa.activo:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La empresa de la sucursal no existe o está inactiva.",
        )

    usuario_existente = db.scalar(
        select(User).where(
            User.username == datos.username
        )
    )

    if usuario_existente is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El username ya está registrado.",
        )

    if datos.email is not None:
        email_existente = db.scalar(
            select(User).where(
                User.email == datos.email
            )
        )

        if email_existente is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El email ya está registrado.",
            )

    nuevo_usuario = User(
        rol_id=rol_sucursal.id,
        username=datos.username,
        nombre=datos.nombre,
        email=datos.email,
        password_hash=hash_password(datos.password),
        activo=True,
    )

    try:
        db.add(nuevo_usuario)
        db.flush()

        asignacion = UserSucursal(
            user_id=nuevo_usuario.id,
            sucursal_id=sucursal.id,
        )

        db.add(asignacion)
        db.commit()
        db.refresh(nuevo_usuario)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible crear el usuario de sucursal.",
        )

    return SucursalUserCreatedResponse(
        user_id=nuevo_usuario.id,
        username=nuevo_usuario.username,
        nombre=nuevo_usuario.nombre,
        rol=rol_sucursal.nombre,
        sucursal_id=sucursal.id,
        sucursal=sucursal.nombre,
        empresa_id=empresa.id,
        empresa=empresa.nombre,
    )

def _normalizar_ids_sucursal(
    sucursal_ids: list[int],
) -> list[int]:
    return list(dict.fromkeys(sucursal_ids))


def _obtener_sucursales_admin_usuario(
    user_id: int,
    db: Session,
) -> list[UsuarioSucursalResumen]:
    filas = db.execute(
        select(
            Sucursal,
            Empresa,
        )
        .join(
            UserSucursal,
            UserSucursal.sucursal_id == Sucursal.id,
        )
        .join(
            Empresa,
            Empresa.id == Sucursal.empresa_id,
        )
        .where(
            UserSucursal.user_id == user_id,
        )
        .order_by(
            Empresa.nombre,
            Sucursal.nombre,
        )
    ).all()

    return [
        UsuarioSucursalResumen(
            sucursal_id=sucursal.id,
            sucursal=sucursal.nombre,
            empresa_id=empresa.id,
            empresa=empresa.nombre,
            identificador_inventario=(
                sucursal.identificador_inventario
            ),
            sucursal_activa=sucursal.activo,
            empresa_activa=empresa.activo,
        )
        for sucursal, empresa in filas
    ]


def _construir_usuario_admin_response(
    usuario: User,
    rol: Rol,
    db: Session,
) -> UsuarioAdminResponse:
    sucursales = _obtener_sucursales_admin_usuario(
        usuario.id,
        db,
    )

    return UsuarioAdminResponse(
        user_id=usuario.id,
        username=usuario.username,
        nombre=usuario.nombre,
        email=usuario.email,
        activo=usuario.activo,
        ultimo_login_at=usuario.ultimo_login_at,
        rol_id=rol.id,
        rol=rol.nombre,
        total_sucursales=len(sucursales),
        sucursales=sucursales,
        created_at=usuario.created_at,
        updated_at=usuario.updated_at,
    )


def _validar_sucursales_para_usuario(
    sucursal_ids: list[int],
    db: Session,
) -> list[Sucursal]:
    ids = _normalizar_ids_sucursal(
        sucursal_ids
    )

    if not ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Un usuario SUCURSAL debe tener al menos "
                "una sucursal asignada."
            ),
        )

    filas = db.execute(
        select(
            Sucursal,
            Empresa,
        )
        .join(
            Empresa,
            Empresa.id == Sucursal.empresa_id,
        )
        .where(
            Sucursal.id.in_(ids),
        )
    ).all()

    encontradas = {
        sucursal.id: (sucursal, empresa)
        for sucursal, empresa in filas
    }

    faltantes = [
        sucursal_id
        for sucursal_id in ids
        if sucursal_id not in encontradas
    ]

    if faltantes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No existen las siguientes sucursales: "
                + ", ".join(
                    str(valor)
                    for valor in faltantes
                )
            ),
        )

    inactivas = [
        sucursal_id
        for sucursal_id, (sucursal, empresa) in encontradas.items()
        if not sucursal.activo or not empresa.activo
    ]

    if inactivas:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No se pueden asignar sucursales o empresas "
                "inactivas. IDs: "
                + ", ".join(
                    str(valor)
                    for valor in inactivas
                )
            ),
        )

    return [
        encontradas[sucursal_id][0]
        for sucursal_id in ids
    ]


@app.get(
    "/api/admin/roles",
    response_model=list[RolAdminResponse],
)
def listar_roles_admin(
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    _usuario_admin, _rol_admin = acceso

    roles = db.scalars(
        select(Rol).order_by(
            Rol.nombre
        )
    ).all()

    return [
        RolAdminResponse(
            id=rol.id,
            nombre=rol.nombre,
            descripcion=rol.descripcion,
            activo=rol.activo,
        )
        for rol in roles
    ]


@app.get(
    "/api/admin/sucursales",
    response_model=list[SucursalAdminCatalogoResponse],
)
def listar_sucursales_admin(
    incluir_inactivas: bool = Query(False),
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    _usuario_admin, _rol_admin = acceso

    consulta = (
        select(
            Sucursal,
            Empresa,
        )
        .join(
            Empresa,
            Empresa.id == Sucursal.empresa_id,
        )
    )

    if not incluir_inactivas:
        consulta = consulta.where(
            Sucursal.activo.is_(True),
            Empresa.activo.is_(True),
        )

    filas = db.execute(
        consulta.order_by(
            Empresa.nombre,
            Sucursal.nombre,
        )
    ).all()

    return [
        SucursalAdminCatalogoResponse(
            sucursal_id=sucursal.id,
            sucursal=sucursal.nombre,
            empresa_id=empresa.id,
            empresa=empresa.nombre,
            identificador_inventario=(
                sucursal.identificador_inventario
            ),
            sucursal_activa=sucursal.activo,
            empresa_activa=empresa.activo,
        )
        for sucursal, empresa in filas
    ]


@app.get(
    "/api/admin/usuarios",
    response_model=list[UsuarioAdminResponse],
)
def listar_usuarios_admin(
    rol: str | None = Query(None),
    activo: bool | None = Query(None),
    buscar: str | None = Query(None),
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    _usuario_admin, _rol_admin = acceso

    consulta = select(
        User,
        Rol,
    ).join(
        Rol,
        Rol.id == User.rol_id,
    )

    if rol is not None and rol.strip():
        consulta = consulta.where(
            Rol.nombre == rol.strip().upper()
        )

    if activo is not None:
        consulta = consulta.where(
            User.activo.is_(activo)
        )

    if buscar is not None and buscar.strip():
        patron = f"%{buscar.strip()}%"
        consulta = consulta.where(
            or_(
                User.username.ilike(patron),
                User.nombre.ilike(patron),
                User.email.ilike(patron),
            )
        )

    filas = db.execute(
        consulta.order_by(
            User.username
        )
    ).all()

    return [
        _construir_usuario_admin_response(
            usuario,
            rol_usuario,
            db,
        )
        for usuario, rol_usuario in filas
    ]


@app.get(
    "/api/admin/usuarios/{usuario_id}",
    response_model=UsuarioAdminResponse,
)
def obtener_usuario_admin(
    usuario_id: int,
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    _usuario_admin, _rol_admin = acceso

    fila = db.execute(
        select(
            User,
            Rol,
        )
        .join(
            Rol,
            Rol.id == User.rol_id,
        )
        .where(
            User.id == usuario_id,
        )
    ).first()

    if fila is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El usuario indicado no existe.",
        )

    usuario, rol_usuario = fila

    return _construir_usuario_admin_response(
        usuario,
        rol_usuario,
        db,
    )


@app.post(
    "/api/admin/usuarios",
    response_model=UsuarioAdminResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_usuario_admin(
    datos: UsuarioAdminCreate,
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    _usuario_admin, _rol_admin = acceso

    nombre_rol = datos.rol.strip().upper()

    if nombre_rol not in {
        "ADMINISTRADOR",
        "SUCURSAL",
    }:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "El rol debe ser ADMINISTRADOR o SUCURSAL."
            ),
        )

    rol_usuario = db.scalar(
        select(Rol).where(
            Rol.nombre == nombre_rol,
            Rol.activo.is_(True),
        )
    )

    if rol_usuario is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"El rol {nombre_rol} no existe o está inactivo."
            ),
        )

    username = datos.username.strip()
    nombre = datos.nombre.strip()
    email = (
        datos.email.strip()
        if datos.email is not None
        and datos.email.strip()
        else None
    )

    if not username or not nombre:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username y nombre son obligatorios.",
        )

    if db.scalar(
        select(User).where(
            User.username == username
        )
    ) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El username ya está registrado.",
        )

    if (
        email is not None
        and db.scalar(
            select(User).where(
                User.email == email
            )
        ) is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El email ya está registrado.",
        )

    sucursales: list[Sucursal] = []

    if nombre_rol == "SUCURSAL":
        sucursales = _validar_sucursales_para_usuario(
            datos.sucursal_ids,
            db,
        )
    elif datos.sucursal_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Un usuario ADMINISTRADOR no utiliza "
                "asignaciones user_sucursal."
            ),
        )

    nuevo_usuario = User(
        rol_id=rol_usuario.id,
        username=username,
        nombre=nombre,
        email=email,
        password_hash=hash_password(
            datos.password
        ),
        activo=datos.activo,
    )

    try:
        db.add(nuevo_usuario)
        db.flush()

        for sucursal in sucursales:
            db.add(
                UserSucursal(
                    user_id=nuevo_usuario.id,
                    sucursal_id=sucursal.id,
                )
            )

        db.commit()
        db.refresh(nuevo_usuario)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible crear el usuario.",
        )

    return _construir_usuario_admin_response(
        nuevo_usuario,
        rol_usuario,
        db,
    )


@app.patch(
    "/api/admin/usuarios/{usuario_id}",
    response_model=UsuarioAdminResponse,
)
def actualizar_usuario_admin(
    usuario_id: int,
    datos: UsuarioAdminUpdate,
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    usuario_admin, _rol_admin = acceso

    usuario = db.get(
        User,
        usuario_id,
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El usuario indicado no existe.",
        )

    rol_usuario = db.get(
        Rol,
        usuario.rol_id,
    )

    if rol_usuario is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El usuario tiene un rol inexistente.",
        )

    campos = datos.model_fields_set

    if "nombre" in campos:
        if datos.nombre is None or not datos.nombre.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="El nombre no puede quedar vacío.",
            )
        usuario.nombre = datos.nombre.strip()

    if "email" in campos:
        email = (
            datos.email.strip()
            if datos.email is not None
            and datos.email.strip()
            else None
        )

        if email is not None:
            email_existente = db.scalar(
                select(User).where(
                    User.email == email,
                    User.id != usuario.id,
                )
            )

            if email_existente is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="El email ya está registrado.",
                )

        usuario.email = email

    if "activo" in campos and datos.activo is not None:
        if (
            usuario.id == usuario_admin.id
            and not datos.activo
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "El administrador autenticado no puede "
                    "desactivar su propio usuario."
                ),
            )

        usuario.activo = datos.activo

    try:
        db.commit()
        db.refresh(usuario)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible actualizar el usuario.",
        )

    return _construir_usuario_admin_response(
        usuario,
        rol_usuario,
        db,
    )


@app.put(
    "/api/admin/usuarios/{usuario_id}/sucursales",
    response_model=UsuarioAdminResponse,
)
def reemplazar_sucursales_usuario_admin(
    usuario_id: int,
    datos: UsuarioSucursalesUpdate,
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    _usuario_admin, _rol_admin = acceso

    usuario = db.get(
        User,
        usuario_id,
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El usuario indicado no existe.",
        )

    rol_usuario = db.get(
        Rol,
        usuario.rol_id,
    )

    if rol_usuario is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El usuario tiene un rol inexistente.",
        )

    if rol_usuario.nombre != "SUCURSAL":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Solo los usuarios con rol SUCURSAL utilizan "
                "asignaciones de sucursales."
            ),
        )

    sucursales = _validar_sucursales_para_usuario(
        datos.sucursal_ids,
        db,
    )

    try:
        db.execute(
            delete(UserSucursal).where(
                UserSucursal.user_id == usuario.id
            )
        )

        for sucursal in sucursales:
            db.add(
                UserSucursal(
                    user_id=usuario.id,
                    sucursal_id=sucursal.id,
                )
            )

        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No fue posible actualizar las sucursales "
                "asignadas al usuario."
            ),
        )

    return _construir_usuario_admin_response(
        usuario,
        rol_usuario,
        db,
    )


@app.post(
    "/api/admin/usuarios/{usuario_id}/reset-password",
    response_model=UsuarioOperacionResponse,
)
def resetear_password_usuario_admin(
    usuario_id: int,
    datos: UsuarioPasswordReset,
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    _usuario_admin, _rol_admin = acceso

    usuario = db.get(
        User,
        usuario_id,
    )

    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El usuario indicado no existe.",
        )

    usuario.password_hash = hash_password(
        datos.nueva_password
    )

    try:
        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible restablecer la contraseña.",
        )

    return UsuarioOperacionResponse(
        actualizado=True,
        user_id=usuario.id,
        mensaje="Contraseña restablecida correctamente.",
    )


@app.post(
    "/api/auth/cambiar-password",
    response_model=UsuarioOperacionResponse,
)
def cambiar_password_usuario_actual(
    datos: CambiarPasswordRequest,
    usuario: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(
        datos.password_actual,
        usuario.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual es incorrecta.",
        )

    if verify_password(
        datos.nueva_password,
        usuario.password_hash,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La nueva contraseña debe ser diferente "
                "de la contraseña actual."
            ),
        )

    usuario.password_hash = hash_password(
        datos.nueva_password
    )

    try:
        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible cambiar la contraseña.",
        )

    return UsuarioOperacionResponse(
        actualizado=True,
        user_id=usuario.id,
        mensaje="Contraseña actualizada correctamente.",
    )


@app.get(
    "/api/auth/me/sucursales",
    response_model=list[SucursalAsignadaResponse],
)
def obtener_sucursales_usuario_actual(
    acceso: tuple[User, Rol] = Depends(
        require_role("SUCURSAL")
    ),
    db: Session = Depends(get_db),
):
    usuario, _rol = acceso

    filas = db.execute(
        select(
            Sucursal,
            Empresa,
        )
        .join(
            UserSucursal,
            UserSucursal.sucursal_id == Sucursal.id,
        )
        .join(
            Empresa,
            Empresa.id == Sucursal.empresa_id,
        )
        .where(
            UserSucursal.user_id == usuario.id,
            Sucursal.activo.is_(True),
            Empresa.activo.is_(True),
        )
        .order_by(
            Empresa.nombre,
            Sucursal.nombre,
        )
    ).all()

    return [
        SucursalAsignadaResponse(
            sucursal_id=sucursal.id,
            sucursal=sucursal.nombre,
            empresa_id=empresa.id,
            empresa=empresa.nombre,
            identificador_inventario=(
                sucursal.identificador_inventario
            ),
        )
        for sucursal, empresa in filas
    ]

@app.get(
    "/api/auth/me/recepciones",
    response_model=list[SucursalRecepcionPortalResponse],
)
def obtener_recepciones_usuario_actual(
    acceso: tuple[User, Rol] = Depends(
        require_role("SUCURSAL")
    ),
    db: Session = Depends(get_db),
):
    usuario, _rol = acceso

    filas = db.execute(
        select(
            QACicloSucursal,
            QACiclo,
            Sucursal,
            Empresa,
            InventarioCarga,
        )
        .join(
            QACiclo,
            QACiclo.id == QACicloSucursal.qa_ciclo_id,
        )
        .join(
            Sucursal,
            Sucursal.id == QACicloSucursal.sucursal_id,
        )
        .join(
            Empresa,
            Empresa.id == Sucursal.empresa_id,
        )
        .join(
            UserSucursal,
            UserSucursal.sucursal_id == Sucursal.id,
        )
        .outerjoin(
            InventarioCarga,
            (
                (InventarioCarga.qa_ciclo_sucursal_id == QACicloSucursal.id)
                & InventarioCarga.es_actual.is_(True)
            ),
        )
        .where(
            UserSucursal.user_id == usuario.id,
            Sucursal.activo.is_(True),
            Empresa.activo.is_(True),
        )
        .order_by(
            QACiclo.created_at.desc(),
            Empresa.nombre,
            Sucursal.nombre,
        )
    ).all()

    return [
        SucursalRecepcionPortalResponse(
            qa_ciclo_id=ciclo.id,
            ciclo=ciclo.nombre,
            estado_ciclo=ciclo.estado,
            fecha_inicio=ciclo.fecha_inicio,
            fecha_fin=ciclo.fecha_fin,
            qa_ciclo_sucursal_id=participacion.id,
            sucursal_id=sucursal.id,
            sucursal=sucursal.nombre,
            empresa_id=empresa.id,
            empresa=empresa.nombre,
            identificador_inventario=(
                sucursal.identificador_inventario
            ),
            estado_recepcion=participacion.estado_recepcion,
            recibido_at=participacion.recibido_at,
            validado_at=participacion.validado_at,
            observacion=participacion.observacion,
            carga_id=(
                carga.id
                if carga is not None
                else None
            ),
            carga_version=(
                carga.version
                if carga is not None
                else None
            ),
            estado_carga=(
                carga.estado
                if carga is not None
                else None
            ),
            archivo_nombre=(
                carga.archivo_nombre_original
                if carga is not None
                else None
            ),
            total_registros=(
                carga.total_registros
                if carga is not None
                else None
            ),
            registros_validos=(
                carga.registros_validos
                if carga is not None
                else None
            ),
            registros_invalidos=(
                carga.registros_invalidos
                if carga is not None
                else None
            ),
            carga_recibido_at=(
                carga.recibido_at
                if carga is not None
                else None
            ),
            carga_procesado_at=(
                carga.procesado_at
                if carga is not None
                else None
            ),
            puede_cargar_inventario=(
                ciclo.estado == "RECEPCION"
            ),
        )
        for (
            participacion,
            ciclo,
            sucursal,
            empresa,
            carga,
        ) in filas
    ]

def require_sucursal_access(
    sucursal_id: int,
    acceso: tuple[User, Rol] = Depends(
        require_role(
            "ADMINISTRADOR",
            "SUCURSAL",
        )
    ),
    db: Session = Depends(get_db),
) -> tuple[User, Rol, Sucursal, Empresa]:
    usuario, rol = acceso

    sucursal = db.get(
        Sucursal,
        sucursal_id,
    )

    if sucursal is None or not sucursal.activo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La sucursal indicada no existe o está inactiva.",
        )

    empresa = db.get(
        Empresa,
        sucursal.empresa_id,
    )

    if empresa is None or not empresa.activo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La empresa de la sucursal no existe o está inactiva.",
        )

    if rol.nombre == "SUCURSAL":
        asignacion = db.scalar(
            select(UserSucursal).where(
                UserSucursal.user_id == usuario.id,
                UserSucursal.sucursal_id == sucursal.id,
            )
        )

        if asignacion is None:
            raise _acceso_denegado()

    return (
        usuario,
        rol,
        sucursal,
        empresa,
    )


@app.get(
    "/api/auth/check/sucursal/{sucursal_id}",
    response_model=SucursalAccessResponse,
)
def comprobar_acceso_sucursal_especifica(
    acceso: tuple[User, Rol, Sucursal, Empresa] = Depends(
        require_sucursal_access
    ),
):
    usuario, rol, sucursal, empresa = acceso

    return SucursalAccessResponse(
        authorized=True,
        user_id=usuario.id,
        username=usuario.username,
        rol=rol.nombre,
        sucursal_id=sucursal.id,
        sucursal=sucursal.nombre,
        empresa_id=empresa.id,
        empresa=empresa.nombre,
    )

def _obtener_ciclo_o_404(
    ciclo_id: int,
    db: Session,
) -> QACiclo:
    ciclo = db.get(
        QACiclo,
        ciclo_id,
    )

    if ciclo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El ciclo QA indicado no existe.",
        )

    return ciclo


@app.post(
    "/api/admin/ciclos",
    response_model=QACicloResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_ciclo_qa(
    datos: QACicloCreate,
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    usuario_admin, _rol_admin = acceso

    ciclo = QACiclo(
        nombre=datos.nombre,
        descripcion=datos.descripcion,
        fecha_inicio=datos.fecha_inicio,
        fecha_fin=datos.fecha_fin,
        estado="PREPARANDO",
        creado_por_user_id=usuario_admin.id,
    )

    try:
        db.add(ciclo)
        db.commit()
        db.refresh(ciclo)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible crear el ciclo QA.",
        )

    return QACicloResponse(
        id=ciclo.id,
        nombre=ciclo.nombre,
        descripcion=ciclo.descripcion,
        fecha_inicio=ciclo.fecha_inicio,
        fecha_fin=ciclo.fecha_fin,
        estado=ciclo.estado,
        creado_por_user_id=ciclo.creado_por_user_id,
        created_at=ciclo.created_at,
        updated_at=ciclo.updated_at,
    )


@app.get(
    "/api/admin/ciclos",
    response_model=list[QACicloResponse],
)
def listar_ciclos_qa(
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclos = db.scalars(
        select(QACiclo).order_by(
            QACiclo.id.desc()
        )
    ).all()

    return [
        QACicloResponse(
            id=ciclo.id,
            nombre=ciclo.nombre,
            descripcion=ciclo.descripcion,
            fecha_inicio=ciclo.fecha_inicio,
            fecha_fin=ciclo.fecha_fin,
            estado=ciclo.estado,
            creado_por_user_id=ciclo.creado_por_user_id,
            created_at=ciclo.created_at,
            updated_at=ciclo.updated_at,
        )
        for ciclo in ciclos
    ]


@app.post(
    "/api/admin/ciclos/{ciclo_id}/sucursales",
    response_model=QACicloSucursalesAddResponse,
)
def agregar_sucursales_a_ciclo(
    ciclo_id: int,
    datos: QACicloSucursalesAddRequest,
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    ids_solicitados = list(
        dict.fromkeys(datos.sucursal_ids)
    )

    if any(
        sucursal_id <= 0
        for sucursal_id in ids_solicitados
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Todos los sucursal_id deben ser mayores que cero.",
        )

    filas_sucursales = db.execute(
        select(
            Sucursal,
            Empresa,
        )
        .join(
            Empresa,
            Empresa.id == Sucursal.empresa_id,
        )
        .where(
            Sucursal.id.in_(ids_solicitados),
            Sucursal.activo.is_(True),
            Empresa.activo.is_(True),
        )
    ).all()

    sucursales_validas = {
        sucursal.id: (sucursal, empresa)
        for sucursal, empresa in filas_sucursales
    }

    ids_no_validos = [
        sucursal_id
        for sucursal_id in ids_solicitados
        if sucursal_id not in sucursales_validas
    ]

    if ids_no_validos:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Hay sucursales inexistentes, inactivas o con empresa inactiva: "
                + ", ".join(
                    str(sucursal_id)
                    for sucursal_id in ids_no_validos
                )
            ),
        )

    ids_existentes = set(
        db.scalars(
            select(QACicloSucursal.sucursal_id).where(
                QACicloSucursal.qa_ciclo_id == ciclo.id,
                QACicloSucursal.sucursal_id.in_(ids_solicitados),
            )
        ).all()
    )

    ids_nuevos = [
        sucursal_id
        for sucursal_id in ids_solicitados
        if sucursal_id not in ids_existentes
    ]

    nuevas_asignaciones: list[QACicloSucursal] = []

    try:
        for sucursal_id in ids_nuevos:
            asignacion = QACicloSucursal(
                qa_ciclo_id=ciclo.id,
                sucursal_id=sucursal_id,
                estado_recepcion="PENDIENTE",
            )
            db.add(asignacion)
            nuevas_asignaciones.append(asignacion)

        db.commit()

        for asignacion in nuevas_asignaciones:
            db.refresh(asignacion)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible asignar las sucursales al ciclo QA.",
        )

    total_participantes = db.scalar(
        select(func.count(QACicloSucursal.id)).where(
            QACicloSucursal.qa_ciclo_id == ciclo.id
        )
    ) or 0

    respuestas_nuevas = []

    for asignacion in nuevas_asignaciones:
        sucursal, empresa = sucursales_validas[
            asignacion.sucursal_id
        ]

        respuestas_nuevas.append(
            QACicloSucursalResponse(
                id=asignacion.id,
                qa_ciclo_id=asignacion.qa_ciclo_id,
                sucursal_id=sucursal.id,
                sucursal=sucursal.nombre,
                empresa_id=empresa.id,
                empresa=empresa.nombre,
                identificador_inventario=(
                    sucursal.identificador_inventario
                ),
                estado_recepcion=asignacion.estado_recepcion,
                recibido_at=asignacion.recibido_at,
                validado_at=asignacion.validado_at,
                observacion=asignacion.observacion,
            )
        )

    return QACicloSucursalesAddResponse(
        qa_ciclo_id=ciclo.id,
        ciclo=ciclo.nombre,
        agregadas=len(ids_nuevos),
        ya_existentes=len(ids_existentes),
        total_participantes=total_participantes,
        sucursales_agregadas=respuestas_nuevas,
    )


@app.get(
    "/api/admin/ciclos/{ciclo_id}/sucursales",
    response_model=list[QACicloSucursalResponse],
)
def listar_sucursales_de_ciclo(
    ciclo_id: int,
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    filas = db.execute(
        select(
            QACicloSucursal,
            Sucursal,
            Empresa,
        )
        .join(
            Sucursal,
            Sucursal.id == QACicloSucursal.sucursal_id,
        )
        .join(
            Empresa,
            Empresa.id == Sucursal.empresa_id,
        )
        .where(
            QACicloSucursal.qa_ciclo_id == ciclo.id
        )
        .order_by(
            Empresa.nombre,
            Sucursal.nombre,
        )
    ).all()

    return [
        QACicloSucursalResponse(
            id=asignacion.id,
            qa_ciclo_id=asignacion.qa_ciclo_id,
            sucursal_id=sucursal.id,
            sucursal=sucursal.nombre,
            empresa_id=empresa.id,
            empresa=empresa.nombre,
            identificador_inventario=(
                sucursal.identificador_inventario
            ),
            estado_recepcion=asignacion.estado_recepcion,
            recibido_at=asignacion.recibido_at,
            validado_at=asignacion.validado_at,
            observacion=asignacion.observacion,
        )
        for asignacion, sucursal, empresa in filas
    ]

@app.get(
    "/api/admin/ciclos/{ciclo_id}/recepcion-resumen",
    response_model=QACicloRecepcionResumen,
)
def obtener_resumen_recepcion_ciclo(
    ciclo_id: int,
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    filas = db.execute(
        select(
            QACicloSucursal.estado_recepcion,
            func.count(QACicloSucursal.id),
        )
        .where(
            QACicloSucursal.qa_ciclo_id == ciclo.id
        )
        .group_by(
            QACicloSucursal.estado_recepcion
        )
    ).all()

    conteos = {
        "PENDIENTE": 0,
        "RECIBIDO": 0,
        "VALIDADO": 0,
        "RECHAZADO": 0,
    }

    for estado_recepcion, cantidad in filas:
        if estado_recepcion in conteos:
            conteos[estado_recepcion] = int(cantidad)

    total_participantes = sum(conteos.values())
    validados = conteos["VALIDADO"]

    porcentaje_validado = (
        round(
            (validados / total_participantes) * 100,
            2,
        )
        if total_participantes > 0
        else 0.0
    )

    return QACicloRecepcionResumen(
        qa_ciclo_id=ciclo.id,
        ciclo=ciclo.nombre,
        estado=ciclo.estado,
        total_participantes=total_participantes,
        pendientes=conteos["PENDIENTE"],
        recibidos=conteos["RECIBIDO"],
        validados=validados,
        rechazados=conteos["RECHAZADO"],
        porcentaje_validado=porcentaje_validado,
        todos_validados=(
            total_participantes > 0
            and validados == total_participantes
        ),
    )

@app.post(
    "/api/admin/ciclos/{ciclo_id}/marcar-listo-qa",
    response_model=QACicloResponse,
)
def marcar_ciclo_listo_qa(
    ciclo_id: int,
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    if ciclo.estado != "RECEPCION":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Solo se puede marcar LISTO_QA un ciclo "
                "que esté en estado RECEPCION."
            ),
        )

    # Las sucursales sin carga toman ahora el inventario que envió su agente
    # (la carga de CSV está retirada). Todo o nada: si falta alguna, no se cambia nada.
    try:
        sin_agente = tomar_inventarios_pendientes(
            db,
            ciclo_id=ciclo.id,
            usuario_id=_acceso[0].id,
        )
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible tomar el inventario de los agentes.",
        )

    if sin_agente:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No se puede pasar el ciclo a LISTO_QA porque estas "
                "sucursales no tienen inventario enviado por su agente: "
                f"{', '.join(sin_agente)}. Instale el agente o quítelas del ciclo."
            ),
        )

    filas = db.execute(
        select(
            QACicloSucursal.estado_recepcion,
            func.count(QACicloSucursal.id),
        )
        .where(
            QACicloSucursal.qa_ciclo_id == ciclo.id
        )
        .group_by(
            QACicloSucursal.estado_recepcion
        )
    ).all()

    conteos = {
        "PENDIENTE": 0,
        "RECIBIDO": 0,
        "VALIDADO": 0,
        "RECHAZADO": 0,
    }

    for estado_recepcion, cantidad in filas:
        if estado_recepcion in conteos:
            conteos[estado_recepcion] = int(cantidad)

    total_participantes = sum(conteos.values())

    if total_participantes <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "El ciclo debe tener al menos una sucursal "
                "participante antes de pasar a LISTO_QA."
            ),
        )

    no_validadas = (
        conteos["PENDIENTE"]
        + conteos["RECIBIDO"]
        + conteos["RECHAZADO"]
    )

    if no_validadas > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No se puede pasar el ciclo a LISTO_QA porque "
                f"{no_validadas} de {total_participantes} sucursal(es) "
                "aún no están VALIDADO. "
                f"PENDIENTE={conteos['PENDIENTE']}, "
                f"RECIBIDO={conteos['RECIBIDO']}, "
                f"RECHAZADO={conteos['RECHAZADO']}, "
                f"VALIDADO={conteos['VALIDADO']}."
            ),
        )

    ciclo.estado = "LISTO_QA"
    ciclo.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(ciclo)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible marcar el ciclo como LISTO_QA.",
        )

    return QACicloResponse(
        id=ciclo.id,
        nombre=ciclo.nombre,
        descripcion=ciclo.descripcion,
        fecha_inicio=ciclo.fecha_inicio,
        fecha_fin=ciclo.fecha_fin,
        estado=ciclo.estado,
        creado_por_user_id=ciclo.creado_por_user_id,
        created_at=ciclo.created_at,
        updated_at=ciclo.updated_at,
    )

@app.post(
    "/api/admin/ciclos/{ciclo_id}/abrir-recepcion",
    response_model=QACicloResponse,
)
def abrir_recepcion_ciclo(
    ciclo_id: int,
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    if ciclo.estado != "PREPARANDO":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Solo se puede abrir la recepción de un ciclo "
                "que esté en estado PREPARANDO."
            ),
        )

    total_participantes = db.scalar(
        select(func.count(QACicloSucursal.id)).where(
            QACicloSucursal.qa_ciclo_id == ciclo.id
        )
    ) or 0

    if total_participantes <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "El ciclo debe tener al menos una sucursal "
                "participante antes de abrir la recepción."
            ),
        )

    ciclo.estado = "RECEPCION"
    ciclo.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(ciclo)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible abrir la recepción del ciclo QA.",
        )

    return QACicloResponse(
        id=ciclo.id,
        nombre=ciclo.nombre,
        descripcion=ciclo.descripcion,
        fecha_inicio=ciclo.fecha_inicio,
        fecha_fin=ciclo.fecha_fin,
        estado=ciclo.estado,
        creado_por_user_id=ciclo.creado_por_user_id,
        created_at=ciclo.created_at,
        updated_at=ciclo.updated_at,
    )

def _ciclo_response_admin_simple(ciclo: QACiclo) -> QACicloResponse:
    return QACicloResponse(
        id=ciclo.id,
        nombre=ciclo.nombre,
        descripcion=ciclo.descripcion,
        fecha_inicio=ciclo.fecha_inicio,
        fecha_fin=ciclo.fecha_fin,
        estado=ciclo.estado,
        creado_por_user_id=ciclo.creado_por_user_id,
        created_at=ciclo.created_at,
        updated_at=ciclo.updated_at,
    )

@app.post(
    "/api/admin/ciclos/{ciclo_id}/activar-recepcion",
    response_model=QACicloResponse,
)
def activar_recepcion_simple_admin(
    ciclo_id: int,
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    if ciclo.estado == "RECEPCION":
        return _ciclo_response_admin_simple(ciclo)

    if ciclo.estado != "PREPARANDO":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Solo se puede activar la recepcion de un ciclo "
                "que este en PREPARANDO."
            ),
        )

    ids_sucursales_habilitadas = list(
        db.scalars(
            select(Sucursal.id)
            .join(
                UserSucursal,
                UserSucursal.sucursal_id == Sucursal.id,
            )
            .join(
                User,
                User.id == UserSucursal.user_id,
            )
            .join(
                Rol,
                Rol.id == User.rol_id,
            )
            .join(
                Empresa,
                Empresa.id == Sucursal.empresa_id,
            )
            .where(
                User.activo.is_(True),
                Rol.activo.is_(True),
                Rol.nombre == "SUCURSAL",
                Sucursal.activo.is_(True),
                Empresa.activo.is_(True),
            )
            .distinct()
        ).all()
    )

    ids_existentes = set(
        db.scalars(
            select(QACicloSucursal.sucursal_id).where(
                QACicloSucursal.qa_ciclo_id == ciclo.id
            )
        ).all()
    )

    for sucursal_id in ids_sucursales_habilitadas:
        if sucursal_id in ids_existentes:
            continue

        db.add(
            QACicloSucursal(
                qa_ciclo_id=ciclo.id,
                sucursal_id=sucursal_id,
                estado_recepcion="PENDIENTE",
            )
        )

    try:
        db.flush()

        total_participantes = db.scalar(
            select(func.count(QACicloSucursal.id)).where(
                QACicloSucursal.qa_ciclo_id == ciclo.id
            )
        ) or 0

        if total_participantes <= 0:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No hay sucursales participantes. Asigna al menos "
                    "un usuario SUCURSAL a una sucursal antes de activar "
                    "la recepcion."
                ),
            )

        ciclo.estado = "RECEPCION"
        ciclo.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(ciclo)

    except HTTPException:
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible activar la recepcion de inventarios.",
        )

    return _ciclo_response_admin_simple(ciclo)


@app.post(
    "/api/admin/ciclos/{ciclo_id}/desactivar-recepcion",
    response_model=QACicloResponse,
)
def desactivar_recepcion_simple_admin(
    ciclo_id: int,
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    if ciclo.estado == "PREPARANDO":
        return _ciclo_response_admin_simple(ciclo)

    if ciclo.estado != "RECEPCION":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Solo se puede desactivar la recepcion de un ciclo "
                "que este en RECEPCION."
            ),
        )

    ciclo.estado = "PREPARANDO"
    ciclo.updated_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(ciclo)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible desactivar la recepcion de inventarios.",
        )

    return _ciclo_response_admin_simple(ciclo)

def _carga_manual_de_archivos_retirada() -> None:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "La carga manual de archivos fue retirada. "
            "El inventario se consulta directamente desde la base de datos."
        ),
    )

@app.post(
    "/api/ciclos/{ciclo_id}/sucursales/{sucursal_id}/inventarios/validar",
    include_in_schema=False,
    response_model=InventarioCSVValidacionResponse,
)
def validar_csv_inventario_sucursal(
    ciclo_id: int,
    sucursal_id: int,
    archivo: UploadFile = File(...),
    acceso_sucursal: tuple[User, Rol, Sucursal, Empresa] = Depends(
        require_sucursal_access
    ),
    db: Session = Depends(get_db),
):
    _carga_manual_de_archivos_retirada()
    _usuario, _rol, sucursal, empresa = acceso_sucursal

    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    if (
        ciclo.estado != "RECEPCION"
        and not (
            _rol.nombre == "ADMINISTRADOR"
            and ciclo.estado == "PREPARANDO"
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La recepcion debe estar activa para usuarios SUCURSAL. "
                "El ADMINISTRADOR solo puede cargar en PREPARANDO o RECEPCION."
            ),
        )

    participacion = db.scalar(
        select(QACicloSucursal).where(
            QACicloSucursal.qa_ciclo_id == ciclo.id,
            QACicloSucursal.sucursal_id == sucursal.id,
        )
    )

    if participacion is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La sucursal no participa en el ciclo QA indicado.",
        )

    if not sucursal.identificador_inventario:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La sucursal no tiene identificador_inventario "
                "configurado."
            ),
        )

    if not archivo.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo no tiene nombre.",
        )

    if Path(archivo.filename).suffix.lower() != ".csv":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se permiten archivos CSV.",
        )

    contenido = archivo.file.read()

    if not contenido:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo CSV está vacío.",
        )

    try:
        analisis = analizar_csv_inventario(
            contenido=contenido,
            nombre_archivo=archivo.filename,
            identificador_esperado=sucursal.identificador_inventario,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    return InventarioCSVValidacionResponse(
        validado=True,
        qa_ciclo_id=ciclo.id,
        ciclo=ciclo.nombre,
        sucursal_id=sucursal.id,
        sucursal=sucursal.nombre,
        empresa_id=empresa.id,
        empresa=empresa.nombre,
        estado_recepcion=participacion.estado_recepcion,
        **analisis,
    )

@app.post(
    "/api/ciclos/{ciclo_id}/sucursales/{sucursal_id}/inventarios/registrar",
    include_in_schema=False,
    response_model=InventarioCargaRegistroResponse,
    status_code=status.HTTP_201_CREATED,
)
def registrar_carga_inventario_sucursal(
    ciclo_id: int,
    sucursal_id: int,
    archivo: UploadFile = File(...),
    acceso_sucursal: tuple[User, Rol, Sucursal, Empresa] = Depends(
        require_sucursal_access
    ),
    db: Session = Depends(get_db),
):
    _carga_manual_de_archivos_retirada()
    usuario, _rol, sucursal, empresa = acceso_sucursal

    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    if (
        ciclo.estado != "RECEPCION"
        and not (
            _rol.nombre == "ADMINISTRADOR"
            and ciclo.estado == "PREPARANDO"
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La recepcion debe estar activa para usuarios SUCURSAL. "
                "El ADMINISTRADOR solo puede cargar en PREPARANDO o RECEPCION."
            ),
        )

    participacion = db.scalar(
        select(QACicloSucursal).where(
            QACicloSucursal.qa_ciclo_id == ciclo.id,
            QACicloSucursal.sucursal_id == sucursal.id,
        )
    )

    if participacion is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La sucursal no participa en el ciclo QA indicado.",
        )

    if not sucursal.identificador_inventario:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La sucursal no tiene identificador_inventario "
                "configurado."
            ),
        )

    if not archivo.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo no tiene nombre.",
        )

    if Path(archivo.filename).suffix.lower() != ".csv":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se permiten archivos CSV.",
        )

    contenido = archivo.file.read()

    if not contenido:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo CSV está vacío.",
        )

    try:
        analisis = analizar_csv_inventario(
            contenido=contenido,
            nombre_archivo=archivo.filename,
            identificador_esperado=sucursal.identificador_inventario,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    carga_duplicada = db.scalar(
        select(InventarioCarga).where(
            InventarioCarga.qa_ciclo_sucursal_id == participacion.id,
            InventarioCarga.archivo_sha256 == analisis["archivo_sha256"],
        )
    )

    if carga_duplicada is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este mismo archivo ya fue registrado para la sucursal "
                "en el ciclo QA indicado."
            ),
        )

    carga_actual = db.scalar(
        select(InventarioCarga)
        .where(
            InventarioCarga.qa_ciclo_sucursal_id == participacion.id,
            InventarioCarga.es_actual.is_(True),
        )
        .order_by(InventarioCarga.version.desc())
    )

    ultima_version = db.scalar(
        select(
            func.max(InventarioCarga.version)
        ).where(
            InventarioCarga.qa_ciclo_sucursal_id == participacion.id
        )
    )

    nueva_version = int(ultima_version or 0) + 1
    ahora = datetime.now(timezone.utc)

    if carga_actual is not None:
        carga_actual.es_actual = False
        carga_actual.estado = "REEMPLAZADO"
        carga_actual.updated_at = ahora

    nueva_carga = InventarioCarga(
        qa_ciclo_sucursal_id=participacion.id,
        cargado_por_user_id=usuario.id,
        version=nueva_version,
        es_actual=True,
        reemplaza_carga_id=(
            carga_actual.id
            if carga_actual is not None
            else None
        ),
        archivo_nombre_original=archivo.filename,
        archivo_nombre_guardado=None,
        archivo_ruta=None,
        archivo_sha256=analisis["archivo_sha256"],
        archivo_tamano_bytes=analisis["archivo_tamano_bytes"],
        estado="RECIBIDO",
        total_registros=analisis["total_registros"],
        registros_validos=0,
        registros_invalidos=0,
        error_mensaje=None,
        recibido_at=ahora,
        procesado_at=None,
        updated_at=ahora,
    )

    participacion.estado_recepcion = "RECIBIDO"
    participacion.recibido_at = ahora
    participacion.validado_at = None
    participacion.observacion = None
    participacion.updated_at = ahora

    try:
        db.add(nueva_carga)
        db.commit()
        db.refresh(nueva_carga)
        db.refresh(participacion)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No fue posible registrar la carga de inventario.",
        )

    return InventarioCargaRegistroResponse(
        registrado=True,
        carga_id=nueva_carga.id,
        qa_ciclo_id=ciclo.id,
        ciclo=ciclo.nombre,
        qa_ciclo_sucursal_id=participacion.id,
        sucursal_id=sucursal.id,
        sucursal=sucursal.nombre,
        empresa_id=empresa.id,
        empresa=empresa.nombre,
        cargado_por_user_id=usuario.id,
        cargado_por_username=usuario.username,
        version=nueva_carga.version,
        es_actual=nueva_carga.es_actual,
        reemplaza_carga_id=nueva_carga.reemplaza_carga_id,
        estado=nueva_carga.estado,
        estado_recepcion=participacion.estado_recepcion,
        archivo_nombre=nueva_carga.archivo_nombre_original,
        archivo_tamano_bytes=nueva_carga.archivo_tamano_bytes or 0,
        archivo_sha256=nueva_carga.archivo_sha256,
        total_registros=nueva_carga.total_registros,
        registros_validos=nueva_carga.registros_validos,
        registros_invalidos=nueva_carga.registros_invalidos,
        recibido_at=nueva_carga.recibido_at,
    )

@app.post(
    "/api/ciclos/{ciclo_id}/sucursales/{sucursal_id}/inventarios/{carga_id}/procesar",
    include_in_schema=False,
    response_model=InventarioProcesamientoResponse,
)
def procesar_carga_inventario_sucursal(
    ciclo_id: int,
    sucursal_id: int,
    carga_id: int,
    archivo: UploadFile = File(...),
    acceso_sucursal: tuple[User, Rol, Sucursal, Empresa] = Depends(
        require_sucursal_access
    ),
    db: Session = Depends(get_db),
):
    _carga_manual_de_archivos_retirada()
    _usuario, _rol, sucursal, empresa = acceso_sucursal

    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    if (
        ciclo.estado != "RECEPCION"
        and not (
            _rol.nombre == "ADMINISTRADOR"
            and ciclo.estado == "PREPARANDO"
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La recepcion debe estar activa para usuarios SUCURSAL. "
                "El ADMINISTRADOR solo puede cargar en PREPARANDO o RECEPCION."
            ),
        )

    participacion = db.scalar(
        select(QACicloSucursal).where(
            QACicloSucursal.qa_ciclo_id == ciclo.id,
            QACicloSucursal.sucursal_id == sucursal.id,
        )
    )

    if participacion is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La sucursal no participa en el ciclo QA indicado.",
        )

    carga = db.get(
        InventarioCarga,
        carga_id,
    )

    if carga is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La carga de inventario indicada no existe.",
        )

    if carga.qa_ciclo_sucursal_id != participacion.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La carga de inventario no pertenece a la sucursal "
                "y ciclo indicados."
            ),
        )

    if not carga.es_actual:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La carga indicada ya fue reemplazada por una versión "
                "posterior."
            ),
        )

    if carga.estado != "RECIBIDO":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La carga debe estar en estado RECIBIDO para ser "
                "procesada. Estado actual: " + carga.estado
            ),
        )

    if participacion.estado_recepcion != "RECIBIDO":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La recepción de la sucursal debe estar en estado "
                "RECIBIDO antes de procesar la carga."
            ),
        )

    if not sucursal.identificador_inventario:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La sucursal no tiene identificador_inventario "
                "configurado."
            ),
        )

    if not archivo.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo no tiene nombre.",
        )

    if Path(archivo.filename).suffix.lower() != ".csv":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se permiten archivos CSV.",
        )

    contenido = archivo.file.read()

    if not contenido:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo CSV está vacío.",
        )

    try:
        analisis = analizar_csv_inventario(
            contenido=contenido,
            nombre_archivo=archivo.filename,
            identificador_esperado=sucursal.identificador_inventario,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    if analisis["archivo_sha256"] != carga.archivo_sha256:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "El archivo seleccionado no coincide con el archivo "
                "registrado para esta carga."
            ),
        )

    if analisis["total_registros"] != carga.total_registros:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La cantidad de registros del archivo no coincide con "
                "la carga registrada."
            ),
        )

    detalles_existentes = db.scalar(
        select(func.count(InventarioDetalle.id)).where(
            InventarioDetalle.inventario_carga_id == carga.id
        )
    )

    if int(detalles_existentes or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La carga ya tiene registros en inventario_detalle y "
                "no puede procesarse nuevamente."
            ),
        )

    try:
        filas_detalle = extraer_detalles_csv_inventario(
            contenido=contenido,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    registros_codigo_barra_validos = int(
        analisis.get(
            "registros_codigo_barra_validos",
            len(filas_detalle),
        )
    )

    if len(filas_detalle) != registros_codigo_barra_validos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La cantidad de códigos de barra válidos preparados para "
                "inventario_detalle no coincide con la validación del archivo."
            ),
        )

    detalles_insertados = 0
    tamanio_lote = 1000

    try:
        for inicio in range(0, len(filas_detalle), tamanio_lote):
            lote = filas_detalle[inicio:inicio + tamanio_lote]

            objetos = [
                InventarioDetalle(
                    inventario_carga_id=carga.id,
                    **fila,
                )
                for fila in lote
            ]

            db.add_all(objetos)
            db.flush()
            detalles_insertados += len(objetos)

        ahora = datetime.now(timezone.utc)

        carga.estado = "VALIDADO"
        carga.registros_validos = detalles_insertados
        carga.registros_invalidos = max(
            0,
            carga.total_registros - detalles_insertados,
        )
        carga.error_mensaje = None
        carga.procesado_at = ahora
        carga.updated_at = ahora

        participacion.estado_recepcion = "VALIDADO"
        participacion.validado_at = ahora
        participacion.observacion = None
        participacion.updated_at = ahora

        db.commit()
        db.refresh(carga)
        db.refresh(participacion)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No fue posible insertar inventario_detalle. "
                "La operación fue revertida completamente."
            ),
        )

    return InventarioProcesamientoResponse(
        procesado=True,
        carga_id=carga.id,
        qa_ciclo_id=ciclo.id,
        ciclo=ciclo.nombre,
        qa_ciclo_sucursal_id=participacion.id,
        sucursal_id=sucursal.id,
        sucursal=sucursal.nombre,
        empresa_id=empresa.id,
        empresa=empresa.nombre,
        version=carga.version,
        es_actual=carga.es_actual,
        estado=carga.estado,
        estado_recepcion=participacion.estado_recepcion,
        total_registros=carga.total_registros,
        registros_validos=carga.registros_validos,
        registros_invalidos=carga.registros_invalidos,
        detalles_insertados=detalles_insertados,
        archivo_nombre=carga.archivo_nombre_original,
        archivo_sha256=carga.archivo_sha256,
        procesado_at=carga.procesado_at,
    )

@app.get(
    "/api/admin/inventarios/comparacion"
)
def visualizar_inventario_vs_creacion_admin(
    ciclo_id: int = Query(..., ge=1),
    sucursal_id: int = Query(..., ge=1),
    pagina: int = Query(default=1, ge=1),
    tamano_pagina: int = Query(default=50, ge=1, le=100),
    buscar: str | None = Query(default=None, max_length=180),
    estado: str | None = Query(default=None, max_length=30),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    sucursal = db.get(
        Sucursal,
        sucursal_id,
    )

    if sucursal is None or not sucursal.activo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La sucursal indicada no existe o está inactiva.",
        )

    empresa = db.get(
        Empresa,
        sucursal.empresa_id,
    )

    if empresa is None or not empresa.activo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La empresa de la sucursal no existe o está inactiva.",
        )

    participacion = db.scalar(
        select(QACicloSucursal).where(
            QACicloSucursal.qa_ciclo_id == ciclo.id,
            QACicloSucursal.sucursal_id == sucursal.id,
        )
    )

    if participacion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La sucursal no participa en el ciclo QA indicado. "
                "Primero debe existir su participación en el ciclo."
            ),
        )

    carga = db.scalar(
        select(InventarioCarga)
        .where(
            InventarioCarga.qa_ciclo_sucursal_id == participacion.id,
            InventarioCarga.es_actual.is_(True),
        )
        .order_by(
            InventarioCarga.version.desc(),
            InventarioCarga.id.desc(),
        )
    )

    if carga is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La sucursal todavía no tiene una carga de inventario "
                "actual dentro de este ciclo."
            ),
        )

    estado_limpio = (
        estado.strip().upper()
        if estado is not None and estado.strip()
        else None
    )

    estados_validos = {
        "IGUAL",
        "DIFERENCIA",
        "NO_EN_CREACION",
    }

    if (
        estado_limpio is not None
        and estado_limpio not in estados_validos
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Estado de comparación inválido. "
                "Debe ser IGUAL, DIFERENCIA o NO_EN_CREACION."
            ),
        )

    buscar_limpio = (
        buscar.strip()
        if buscar is not None and buscar.strip()
        else None
    )

    comparacion_base_sql = """
    WITH base AS
    (
        SELECT
            I.id AS inventario_detalle_id,
            I.codigo_barra,

            C.registro_id AS registro_id_creacion,
            C.codigo_barra AS codigo_barra_creacion,

            I.referencia AS referencia_inventario,
            C.referencia AS referencia_creacion,

            I.precio_detal_usd_mas_iva AS precio_detal_inventario,
            C.precio_detal_usd_mas_iva AS precio_detal_creacion,

            I.tasa_cambio AS tasa_cambio_inventario,
            C.tasa_cambio AS tasa_cambio_creacion,

            I.codigo_marca AS codigo_marca_inventario,
            C.codigo_marca_origen AS codigo_marca_creacion,

            I.codigo_categoria AS codigo_categoria_inventario,
            C.codigo_categoria AS codigo_categoria_creacion,

            I.precio_promocion AS precio_promocion_inventario,
            C.precio_promocion AS precio_promocion_creacion,

            I.costo_inicial AS costo_inicial_inventario,
            C.costo_inicial AS costo_inicial_creacion,

            I.costo_dolar AS costo_dolar_inventario,
            C.costo_dolar AS costo_dolar_creacion,

            (
                I.referencia
                IS DISTINCT FROM C.referencia
            ) AS diferencia_referencia,

            (
                I.precio_detal_usd_mas_iva
                IS DISTINCT FROM C.precio_detal_usd_mas_iva
            ) AS diferencia_precio_detal,

            (
                I.tasa_cambio
                IS DISTINCT FROM C.tasa_cambio
            ) AS diferencia_tasa_cambio,

            (
                I.codigo_marca
                IS DISTINCT FROM C.codigo_marca_origen
            ) AS diferencia_codigo_marca,

            (
                I.codigo_categoria
                IS DISTINCT FROM C.codigo_categoria
            ) AS diferencia_codigo_categoria,

            (
                I.precio_promocion
                IS DISTINCT FROM C.precio_promocion
            ) AS diferencia_precio_promocion,

            (
                I.costo_inicial
                IS DISTINCT FROM C.costo_inicial
            ) AS diferencia_costo_inicial,

            (
                I.costo_dolar
                IS DISTINCT FROM C.costo_dolar
            ) AS diferencia_costo_dolar,

            CASE
                WHEN C.codigo_barra IS NULL
                    THEN 'NO_EN_CREACION'

                WHEN
                    I.referencia
                        IS NOT DISTINCT FROM C.referencia
                    AND
                    I.precio_detal_usd_mas_iva
                        IS NOT DISTINCT FROM C.precio_detal_usd_mas_iva
                    AND
                    I.tasa_cambio
                        IS NOT DISTINCT FROM C.tasa_cambio
                    AND
                    I.codigo_marca
                        IS NOT DISTINCT FROM C.codigo_marca_origen
                    AND
                    I.codigo_categoria
                        IS NOT DISTINCT FROM C.codigo_categoria
                    AND
                    I.precio_promocion
                        IS NOT DISTINCT FROM C.precio_promocion
                    AND
                    I.costo_inicial
                        IS NOT DISTINCT FROM C.costo_inicial
                    AND
                    I.costo_dolar
                        IS NOT DISTINCT FROM C.costo_dolar
                    THEN 'IGUAL'

                ELSE 'DIFERENCIA'
            END AS estado_comparacion

        FROM inventario_detalle AS I

        LEFT JOIN LATERAL
        (
            SELECT
                C0.registro_id,
                C0.codigo_barra,
                C0.referencia,
                C0.precio_detal_usd_mas_iva,
                C0.tasa_cambio,
                C0.codigo_marca_origen,
                C0.codigo_categoria,
                C0.precio_promocion,
                C0.costo_inicial,
                C0.costo_dolar
            FROM creacion AS C0
            WHERE C0.codigo_barra = I.codigo_barra
              AND C0.vigente = TRUE
            ORDER BY C0.registro_id DESC
            LIMIT 1
        ) AS C
            ON TRUE

        WHERE I.inventario_carga_id = :carga_id
    )
    """

    resumen = db.execute(
        text(
            comparacion_base_sql
            + """
            SELECT
                COUNT(*) AS total_inventario,

                COUNT(*) FILTER (
                    WHERE registro_id_creacion IS NOT NULL
                ) AS encontrados_creacion,

                COUNT(*) FILTER (
                    WHERE estado_comparacion = 'NO_EN_CREACION'
                ) AS no_en_creacion,

                COUNT(*) FILTER (
                    WHERE estado_comparacion = 'IGUAL'
                ) AS iguales,

                COUNT(*) FILTER (
                    WHERE estado_comparacion = 'DIFERENCIA'
                ) AS diferencias

            FROM base
            """
        ),
        {
            "carga_id": carga.id,
        },
    ).mappings().one()

    condiciones = []
    parametros = {
        "carga_id": carga.id,
    }

    if estado_limpio is not None:
        condiciones.append(
            "estado_comparacion = :estado"
        )
        parametros["estado"] = estado_limpio

    if buscar_limpio is not None:
        condiciones.append(
            """
            (
                codigo_barra ILIKE :patron
                OR COALESCE(referencia_inventario, '') ILIKE :patron
                OR COALESCE(referencia_creacion, '') ILIKE :patron
            )
            """
        )
        parametros["patron"] = (
            f"%{buscar_limpio}%"
        )

    where_sql = (
        " WHERE " + " AND ".join(condiciones)
        if condiciones
        else ""
    )

    total_filtrado = int(
        db.scalar(
            text(
                comparacion_base_sql
                + f"""
                SELECT COUNT(*)
                FROM base
                {where_sql}
                """
            ),
            parametros,
        )
        or 0
    )

    total_paginas = (
        (
            total_filtrado
            + tamano_pagina
            - 1
        )
        // tamano_pagina
    )

    offset = (
        pagina - 1
    ) * tamano_pagina

    parametros_pagina = {
        **parametros,
        "limite": tamano_pagina,
        "offset": offset,
    }

    filas = db.execute(
        text(
            comparacion_base_sql
            + f"""
            SELECT *
            FROM base
            {where_sql}
            ORDER BY
                codigo_barra ASC,
                inventario_detalle_id ASC
            LIMIT :limite
            OFFSET :offset
            """
        ),
        parametros_pagina,
    ).mappings().all()

    return {
        "ciclo_id": ciclo.id,
        "ciclo": ciclo.nombre,
        "empresa_id": empresa.id,
        "empresa": empresa.nombre,
        "sucursal_id": sucursal.id,
        "sucursal": sucursal.nombre,

        "carga": {
            "id": carga.id,
            "version": carga.version,
            "estado": carga.estado,
            "archivo_nombre": carga.archivo_nombre_original,
            "total_registros": carga.total_registros,
            "registros_validos": carga.registros_validos,
            "registros_invalidos": carga.registros_invalidos,
            "recibido_at": carga.recibido_at,
            "procesado_at": carga.procesado_at,
        },

        "resumen": {
            "total_inventario": int(
                resumen["total_inventario"]
                or 0
            ),
            "encontrados_creacion": int(
                resumen["encontrados_creacion"]
                or 0
            ),
            "no_en_creacion": int(
                resumen["no_en_creacion"]
                or 0
            ),
            "iguales": int(
                resumen["iguales"]
                or 0
            ),
            "diferencias": int(
                resumen["diferencias"]
                or 0
            ),
        },

        "filtros": {
            "buscar": buscar_limpio,
            "estado": estado_limpio,
        },

        "pagina": pagina,
        "tamano_pagina": tamano_pagina,
        "total_registros": total_filtrado,
        "total_paginas": total_paginas,

        "resultados": [
            dict(fila)
            for fila in filas
        ],
    }
    

@app.post(
    "/api/admin/ciclos/{ciclo_id}/ejecutar-qa",
    status_code=status.HTTP_201_CREATED,
)
def ejecutar_qa_ciclo_admin(
    ciclo_id: int,
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
    db: Session = Depends(get_db),
):
    ciclo = _obtener_ciclo_o_404(
        ciclo_id,
        db,
    )

    # Evita iniciar otra ejecución simultánea del mismo ciclo.
    ejecucion_en_proceso = db.scalar(
        select(QAEjecucion)
        .where(
            QAEjecucion.qa_ciclo_id == ciclo.id,
            QAEjecucion.estado == "PROCESANDO",
        )
        .order_by(
            QAEjecucion.id.desc()
        )
    )

    if ejecucion_en_proceso is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este ciclo ya tiene una ejecución QA "
                "en estado PROCESANDO."
            ),
        )

    try:
        resultado = ejecutar_qa_ciclo(
            db=db,
            ciclo_id=ciclo.id,
            nombre_ejecucion=(
                f"{ciclo.nombre} - QA"
            ),
            fecha_referencia=date.today(),
            descripcion=(
                "Ejecución QA generada desde "
                "inventario_detalle vs creacion."
            ),
        )

        return resultado

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(error),
        )

    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No fue posible ejecutar el QA del ciclo. "
                f"{error}"
            ),
        )

    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "La ejecución QA no pudo completarse. "
                f"{error}"
            ),
        )

@app.post(
    "/api/qa/ejecuciones",
    response_model=QAEjecucionResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_ejecucion(
    datos: QAEjecucionCreate,
    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):
    nueva_ejecucion = QAEjecucion(
        nombre=datos.nombre,
        fecha_referencia=datos.fecha_referencia,
        descripcion=datos.descripcion,
    )

    db.add(nueva_ejecucion)

    db.commit()

    db.refresh(nueva_ejecucion)

    return nueva_ejecucion

@app.get(
    "/api/qa/ejecuciones",
    response_model=list[QAEjecucionResponse],
)
def listar_ejecuciones(
    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):
    consulta = (
        select(QAEjecucion)
        .order_by(QAEjecucion.id.desc())
    )

    ejecuciones = db.scalars(
        consulta
    ).all()

    return ejecuciones

@app.post(
    "/api/qa/importar/validar",
    include_in_schema=False,
)
def validar_archivo_qa(
    archivo: UploadFile = File(...),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):
    _carga_manual_de_archivos_retirada()
    if not archivo.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo no tiene nombre.",
        )

    extension = Path(
        archivo.filename
    ).suffix.lower()

    if extension != ".csv":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Formato no permitido. "
                "Debes cargar un archivo CSV."
            ),
        )

    try:
        resultado = analizar_archivo_qa(
            archivo
        )

        return resultado

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

@app.post(
    "/api/qa/importar",
    include_in_schema=False,
    status_code=status.HTTP_201_CREATED,
)
def importar_archivo_qa(
    archivo: UploadFile = File(...),

    nombre_ejecucion: str = Form(...),

    fecha_referencia: date | None = Form(
        None
    ),

    descripcion: str | None = Form(
        None
    ),

    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):
    _carga_manual_de_archivos_retirada()
    if not archivo.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo no tiene nombre.",
        )

    if not archivo.filename.lower().endswith(
        ".csv"
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se permiten archivos CSV.",
        )

    if not nombre_ejecucion.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Debes indicar un nombre "
                "para la ejecución."
            ),
        )

    try:
        resultado = importar_qa_existente(
            db=db,
            archivo=archivo,
            nombre_ejecucion=nombre_ejecucion.strip(),
            fecha_referencia=fecha_referencia,
            descripcion=(
                descripcion.strip()
                if descripcion
                else None
            ),
        )

        return resultado

    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "La importación no pudo "
                f"completarse: {error}"
            ),
        )

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/filtros",
    response_model=QAFiltrosDisponibles,
)
def obtener_filtros_qa(
    ejecucion_id: int,

    empresa: str | None = Query(
        default=None,
        max_length=120,
    ),

    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )

    if ejecucion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )

    consulta_empresas = (
        select(
            QAResultado.tabla_empresa
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),

            QAResultado.tabla_empresa.is_not(
                None
            ),
        )
        .distinct()
        .order_by(
            QAResultado.tabla_empresa.asc()
        )
    )

    empresas = [
        empresa_resultado
        for empresa_resultado in db.scalars(
            consulta_empresas
        ).all()
        if empresa_resultado
    ]

    sucursal_visible = func.coalesce(
        QAResultado.sucursal_empresa,
        QAResultado.sucursal_origen,
    )

    condiciones_sucursales = [
        QAResultado.qa_ejecucion_id
        == ejecucion_id,
        _condicion_codigo_barra_qa_valido(),

        sucursal_visible.is_not(
            None
        ),
    ]

    if empresa:

        empresa_limpia = (
            empresa.strip()
        )

        if empresa_limpia:

            condiciones_sucursales.append(
                QAResultado.tabla_empresa
                == empresa_limpia
            )

    consulta_sucursales = (
        select(
            sucursal_visible.label(
                "sucursal"
            )
        )
        .where(
            *condiciones_sucursales
        )
        .distinct()
        .order_by(
            sucursal_visible.asc()
        )
    )

    sucursales = [
        sucursal
        for sucursal in db.scalars(
            consulta_sucursales
        ).all()
        if sucursal
    ]

    # ========================================================
    # ESTADOS PRESENTES
    # ========================================================

    consulta_estados = (
        select(
            QAResultado.estado_comparacion
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
        .distinct()
        .order_by(
            QAResultado.estado_comparacion.asc()
        )
    )

    estados = [
        str(estado)
        for estado in db.scalars(
            consulta_estados
        ).all()
    ]

    return {
        "empresas":
            empresas,

        "sucursales":
            sucursales,

        "estados":
            estados,
    }
        

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/resultados",
    response_model=QAPaginaResultados,
)
def listar_resultados_qa(
    ejecucion_id: int,

    pagina: int = Query(
        default=1,
        ge=1,
    ),

    tamano_pagina: int = Query(
        default=100,
        ge=1,
        le=200,
    ),

    codigo_barra: str | None = Query(
        default=None,
        max_length=100,
    ),

    referencia: str | None = Query(
        default=None,
        max_length=150,
    ),

    estado: str | None = Query(
        default=None,
        max_length=50,
    ),

    empresa: str | None = Query(
        default=None,
        max_length=120,
    ),

    sucursal: str | None = Query(
        default=None,
        max_length=300,
    ),

    orden_por: str = Query(
        default="id",
        max_length=50,
    ),

    direccion: str = Query(
        default="asc",
        max_length=4,
    ),

    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )

    if ejecucion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )

    condiciones = [
        QAResultado.qa_ejecucion_id
        == ejecucion_id,
        _condicion_codigo_barra_qa_valido(),
    ]

    if codigo_barra:

        codigo_barra_limpio = (
            codigo_barra.strip()
        )

        if codigo_barra_limpio:

            condiciones.append(
                QAResultado.codigo_barra
                == codigo_barra_limpio
            )

    if referencia:

        referencia_limpia = (
            referencia.strip()
        )

        if referencia_limpia:

            condiciones.append(
                or_(
                    QAResultado.referencia_creacion
                    == referencia_limpia,

                    QAResultado.referencia_empresa
                    == referencia_limpia,
                )
            )

    if estado:

        estado_limpio = (
            estado
            .strip()
            .upper()
        )

        estados_validos = {
            "IGUAL",
            "DIFERENCIA",
            "NO_EN_EMPRESAS",
            "NO_EN_CREACION",
        }

        if estado_limpio not in estados_validos:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Estado de comparación inválido.",
            )

        condiciones.append(
            QAResultado.estado_comparacion
            == estado_limpio
        )

    if empresa:

        empresa_limpia = (
            empresa.strip()
        )

        if empresa_limpia:

            condiciones.append(
                QAResultado.tabla_empresa
                == empresa_limpia
            )

    if sucursal:

        sucursal_limpia = (
            sucursal.strip()
        )

        if sucursal_limpia:

            sucursal_visible = func.coalesce(
                QAResultado.sucursal_empresa,
                QAResultado.sucursal_origen,
            )

            condiciones.append(
                sucursal_visible
                == sucursal_limpia
            )

    sucursal_visible = func.coalesce(
        QAResultado.sucursal_empresa,
        QAResultado.sucursal_origen,
    )


    columnas_ordenables = {
        "id":
            QAResultado.id,

        "codigo_barra":
            QAResultado.codigo_barra,

        "empresa":
            QAResultado.tabla_empresa,

        "sucursal":
            sucursal_visible,

        "referencia_creacion":
            QAResultado.referencia_creacion,

        "referencia_empresa":
            QAResultado.referencia_empresa,

        "precio_creacion":
            QAResultado.precio_detal_usd_creacion,

        "precio_empresa":
            QAResultado.precio_detal_usd_empresa,

        "existencia":
            QAResultado.existencia_empresa,

        "estado":
            QAResultado.estado_comparacion,
    }

    if orden_por not in columnas_ordenables:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Columna de ordenamiento inválida.",
        )

    direccion_limpia = (
        direccion
        .strip()
        .lower()
    )

    if direccion_limpia not in {
        "asc",
        "desc",
    }:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La dirección debe ser asc o desc.",
        )


    columna_orden = (
        columnas_ordenables[
            orden_por
        ]
    )

    if direccion_limpia == "desc":

        orden_sql = (
            columna_orden.desc()
        )

    else:

        orden_sql = (
            columna_orden.asc()
        )

    consulta_total = (
        select(
            func.count()
        )
        .select_from(
            QAResultado
        )
        .where(
            *condiciones
        )
    )


    total_registros = (
        db.scalar(
            consulta_total
        )
        or 0
    )

    total_paginas = (
        (
            total_registros
            + tamano_pagina
            - 1
        )
        // tamano_pagina
    )

    offset = (
        pagina - 1
    ) * tamano_pagina

    consulta = (
        select(
            QAResultado
        )
        .where(
            *condiciones
        )
        .order_by(
            orden_sql,
            QAResultado.id.asc(),
        )
        .offset(
            offset
        )
        .limit(
            tamano_pagina
        )
    )


    resultados = (
        db.scalars(
            consulta
        )
        .all()
    )


    return {
        "pagina":
            pagina,

        "tamano_pagina":
            tamano_pagina,

        "total_registros":
            total_registros,

        "total_paginas":
            total_paginas,

        "resultados":
            resultados,
    }

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/diferencias/filtros",
    response_model=QAFiltrosDiferencias,
)
def obtener_filtros_diferencias(
    ejecucion_id: int,

    empresa: str | None = Query(
        default=None,
        max_length=120,
    ),

    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )


    if ejecucion is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )

    consulta_tipos = (
        select(
            QATipoDiferencia.codigo,
            QATipoDiferencia.nombre,
            QATipoDiferencia.orden_visual,
        )
        .select_from(
            QADiferencia
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),

            QATipoDiferencia.activo.is_(
                True
            ),
        )
        .distinct()
        .order_by(
            QATipoDiferencia.orden_visual.asc(),
            QATipoDiferencia.codigo.asc(),
        )
    )

    filas_tipos = (
        db.execute(
            consulta_tipos
        )
        .mappings()
        .all()
    )

    tipos = [
        {
            "codigo":
                fila["codigo"],

            "nombre":
                fila["nombre"],
        }
        for fila in filas_tipos
    ]
    

    consulta_empresas = (
        select(
            QAResultado.tabla_empresa
        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),

            QAResultado.tabla_empresa.is_not(
                None
            ),
        )
        .distinct()
        .order_by(
            QAResultado.tabla_empresa.asc()
        )
    )

    empresas = [
        empresa_resultado
        for empresa_resultado
        in db.scalars(
            consulta_empresas
        ).all()
        if empresa_resultado
    ]

    sucursal_visible = func.coalesce(
        QAResultado.sucursal_empresa,
        QAResultado.sucursal_origen,
    )


    condiciones_sucursales = [
        QAResultado.qa_ejecucion_id
        == ejecucion_id,
        _condicion_codigo_barra_qa_valido(),

        sucursal_visible.is_not(
            None
        ),
    ]

    if empresa:

        empresa_limpia = (
            empresa.strip()
        )

        if empresa_limpia:

            condiciones_sucursales.append(
                QAResultado.tabla_empresa
                == empresa_limpia
            )

    consulta_sucursales = (
        select(
            sucursal_visible.label(
                "sucursal"
            )
        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .where(
            *condiciones_sucursales
        )
        .distinct()
        .order_by(
            sucursal_visible.asc()
        )
    )

    sucursales = [
        sucursal
        for sucursal
        in db.scalars(
            consulta_sucursales
        ).all()
        if sucursal
    ]

    estados_correccion = [
        "PENDIENTE",
        "CORREGIDO",
    ]


    return {
        "tipos":
            tipos,

    "estados_correccion":
        estados_correccion,

    "empresas":
        empresas,

    "sucursales":
        sucursales,
}
    
    

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/diferencias",
    response_model=QAPaginaDiferencias,
)
def listar_diferencias_qa(
    ejecucion_id: int,

    pagina: int = Query(
        default=1,
        ge=1,
    ),

    tamano_pagina: int = Query(
        default=100,
        ge=1,
        le=200,
    ),

tipo_diferencia: str | None = Query(
    default=None,
    max_length=80,
),

estado_correccion: str | None = Query(
    default=None,
    max_length=30,
),

codigo_barra: str | None = Query(
    default=None,
    max_length=100,
),

empresa: str | None = Query(
    default=None,
    max_length=120,
),

sucursal: str | None = Query(
    default=None,
    max_length=300,
),

db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )


    if ejecucion is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )

    condiciones = [
        QAResultado.qa_ejecucion_id
        == ejecucion_id,
        _condicion_codigo_barra_qa_valido(),
    ]

    if tipo_diferencia:

        tipo_limpio = (
            tipo_diferencia
            .strip()
            .upper()
        )


        if tipo_limpio:

            condiciones.append(
                QATipoDiferencia.codigo
                == tipo_limpio
            )

    if estado_correccion:

        estado_limpio = (
            estado_correccion
            .strip()
            .upper()
        )


        estados_validos = {
            "PENDIENTE",
            "CORREGIDO",
        }


        if (
            estado_limpio
            not in estados_validos
        ):

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Estado de corrección inválido. "
                    "Debe ser PENDIENTE o CORREGIDO."
                ),
            )


        condiciones.append(
            QADiferencia.estado_correccion
            == estado_limpio
        )

    if codigo_barra:

        codigo_limpio = (
            codigo_barra.strip()
        )

        if codigo_limpio:

            condiciones.append(
                QAResultado.codigo_barra
                == codigo_limpio
            )

    if empresa:

        empresa_limpia = (
            empresa.strip()
        )

        if empresa_limpia:

            condiciones.append(
                QAResultado.tabla_empresa
                == empresa_limpia
            )

    sucursal_visible = func.coalesce(
        QAResultado.sucursal_empresa,
        QAResultado.sucursal_origen,
    )
    
    

    if sucursal:

        sucursal_limpia = (
            sucursal.strip()
        )

        if sucursal_limpia:

            condiciones.append(
                sucursal_visible
                == sucursal_limpia
            )

    consulta_total = (
        select(
            func.count(
                QADiferencia.id
            )
        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            *condiciones
        )
    )

    total_registros = (
        db.scalar(
            consulta_total
        )
        or 0
    )

    total_paginas = (
        (
            total_registros
            + tamano_pagina
            - 1
        )
        // tamano_pagina
    )

    offset = (
        pagina - 1
    ) * tamano_pagina

    consulta = (
        select(
            QADiferencia.id.label(
                "diferencia_id"
            ),

            QADiferencia.qa_resultado_id.label(
                "resultado_id"
            ),

            QAResultado.codigo_barra.label(
                "codigo_barra"
            ),

            QAResultado.tabla_empresa.label(
                "empresa"
            ),

            sucursal_visible.label(
                "sucursal"
            ),

            QATipoDiferencia.codigo.label(
                "tipo_diferencia"
            ),

            QATipoDiferencia.nombre.label(
                "nombre_diferencia"
            ),

            QADiferencia.valor_creacion.label(
                "valor_creacion"
            ),

            QADiferencia.valor_empresa.label(
                "valor_empresa"
            ),

            QADiferencia.diferencia_numerica.label(
                "diferencia_numerica"
            ),

            QADiferencia.estado_correccion.label(
                "estado_correccion"
            ),

            QADiferencia.corregido_at.label(
                "corregido_at"
            ),
        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            *condiciones
        )
        .order_by(
            QADiferencia.id.asc()
        )
        .offset(
            offset
        )
        .limit(
            tamano_pagina
        )
    )

    filas = (
        db.execute(
            consulta
        )
        .mappings()
        .all()
    )

    diferencias = []

    for fila in filas:

        estado_valor = (
            fila[
                "estado_correccion"
            ]
        )

        if hasattr(
            estado_valor,
            "value",
        ):

            estado_valor = (
                estado_valor.value
            )

        else:

            estado_valor = str(
                estado_valor
            )


        diferencias.append({
            "diferencia_id":
                fila[
                    "diferencia_id"
                ],

            "resultado_id":
                fila[
                    "resultado_id"
                ],

            "codigo_barra":
                fila[
                    "codigo_barra"
                ],

            "empresa":
                fila[
                    "empresa"
                ],

            "sucursal":
                fila[
                    "sucursal"
                ],

            "tipo_diferencia":
                fila[
                    "tipo_diferencia"
                ],

            "nombre_diferencia":
                fila[
                    "nombre_diferencia"
                ],

            "valor_creacion":
                fila[
                    "valor_creacion"
                ],

            "valor_empresa":
                fila[
                    "valor_empresa"
                ],

            "diferencia_numerica":
                fila[
                    "diferencia_numerica"
                ],

            "estado_correccion":
                estado_valor,

            "corregido_at":
                fila[
                    "corregido_at"
                ],
        })


    return {
        "pagina":
            pagina,

        "tamano_pagina":
            tamano_pagina,

        "total_registros":
            total_registros,

        "total_paginas":
            total_paginas,

        "diferencias":
            diferencias,
    }

@app.patch(
    "/api/qa/ejecuciones/{ejecucion_id}/diferencias/{diferencia_id}/estado",
    response_model=QADiferenciaEstadoResponse,
)
def cambiar_estado_diferencia(
    ejecucion_id: int,
    diferencia_id: int,

    datos: QADiferenciaEstadoUpdate,

    db: Session = Depends(get_db),
    acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):
    usuario_actual, _rol_actual = acceso

    estado_nuevo = (
        datos
        .estado_correccion
        .strip()
        .upper()
    )


    estados_validos = {
        "PENDIENTE",
        "CORREGIDO",
    }


    if (
        estado_nuevo
        not in estados_validos
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Estado de corrección inválido. "
                "Debe ser PENDIENTE o CORREGIDO."
            ),
        )

    consulta = (
        select(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .where(
            QADiferencia.id
            == diferencia_id,

            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
    )


    diferencia = db.scalar(
        consulta
    )


    if diferencia is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La diferencia no existe "
                "en esta ejecución QA."
            ),
        )

    estado_anterior = (
        diferencia.estado_correccion
    )


    if hasattr(
        estado_anterior,
        "value",
    ):

        estado_anterior = (
            estado_anterior.value
        )

    else:

        estado_anterior = str(
            estado_anterior
        )

    if (
        estado_anterior
        == estado_nuevo
    ):

        return {
            "diferencia_id":
                diferencia.id,

            "estado_correccion":
                estado_anterior,

            "corregido_at":
                diferencia.corregido_at,
        }

    diferencia.estado_correccion = (
        estado_nuevo
    )


    if (
        estado_nuevo
        == "CORREGIDO"
    ):

        diferencia.corregido_at = (
            datetime.now(
                timezone.utc
            )
        )

    else:

        diferencia.corregido_at = (
            None
        )

    nueva_correccion = QACorreccion(
        qa_diferencia_id=
            diferencia.id,

        estado_anterior=
            estado_anterior,

        estado_nuevo=
            estado_nuevo,

        usuario=usuario_actual.username,

        observacion=None,
    )


    db.add(
        nueva_correccion
    )


    try:
        
        db.commit()
        
        db.refresh(
            diferencia
        )
    
    except Exception:
        
        db.rollback()
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No se pudo actualizar"
                "el estado de la diferencia" 
            ),
        )


    estado_resultado = (
        diferencia.estado_correccion
    )


    if hasattr(
        estado_resultado,
        "value",
    ):

        estado_resultado = (
            estado_resultado.value
        )

    else:

        estado_resultado = str(
            estado_resultado
        )


    return {
        "diferencia_id":
            diferencia.id,

        "estado_correccion":
            estado_resultado,

        "corregido_at":
            diferencia.corregido_at,
    }
    
    

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/diferencias/{diferencia_id}/historial",
    response_model=list[QACorreccionResponse],
)
def obtener_historial_diferencia(
    ejecucion_id: int,
    diferencia_id: int,

    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )


    if ejecucion is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La ejecución QA no existe."
            ),
        )

    consulta_diferencia = (
        select(
            QADiferencia.id
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .where(
            QADiferencia.id
            == diferencia_id,

            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
    )


    diferencia_existente = db.scalar(
        consulta_diferencia
    )


    if diferencia_existente is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "La diferencia no existe "
                "en esta ejecución QA."
            ),
        )


    consulta_historial = (
        select(
            QACorreccion
        )
        .where(
            QACorreccion.qa_diferencia_id
            == diferencia_id
        )
        .order_by(
            QACorreccion.created_at.desc(),
            QACorreccion.id.desc(),
        )
    )


    registros = (
        db.scalars(
            consulta_historial
        )
        .all()
    )


    historial = []


    for registro in registros:

        estado_anterior = (
            registro.estado_anterior
        )

        estado_nuevo = (
            registro.estado_nuevo
        )


        if hasattr(
            estado_anterior,
            "value",
        ):

            estado_anterior = (
                estado_anterior.value
            )

        else:

            estado_anterior = str(
                estado_anterior
            )


        if hasattr(
            estado_nuevo,
            "value",
        ):

            estado_nuevo = (
                estado_nuevo.value
            )

        else:

            estado_nuevo = str(
                estado_nuevo
            )


        historial.append({
            "id":
                registro.id,

            "qa_diferencia_id":
                registro.qa_diferencia_id,

            "estado_anterior":
                estado_anterior,

            "estado_nuevo":
                estado_nuevo,

            "usuario":
                registro.usuario,

            "observacion":
                registro.observacion,

            "created_at":
                registro.created_at,
        })


    return historial

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/historial-correcciones",
    response_model=QAPaginaHistorialCorrecciones,
)
def listar_historial_correcciones(
    ejecucion_id: int,

    pagina: int = Query(
        default=1,
        ge=1,
    ),

    tamano_pagina: int = Query(
        default=100,
        ge=1,
        le=200,
    ),

    codigo_barra: str | None = Query(
        default=None,
    ),

    tipo_diferencia: str | None = Query(
        default=None,
    ),

    empresa: str | None = Query(
        default=None,
    ),

    sucursal: str | None = Query(
        default=None,
    ),

    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )

    if ejecucion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )


    sucursal_visible = func.coalesce(
        QAResultado.sucursal_empresa,
        QAResultado.sucursal_origen,
    )

    condiciones = [
        QAResultado.qa_ejecucion_id
        == ejecucion_id,
        _condicion_codigo_barra_qa_valido(),
    ]


    if (
        codigo_barra
        and
        codigo_barra.strip()
    ):
        condiciones.append(
            QAResultado.codigo_barra
            == codigo_barra.strip()
        )


    if (
        tipo_diferencia
        and
        tipo_diferencia.strip()
    ):
        condiciones.append(
            QATipoDiferencia.codigo
            == tipo_diferencia.strip()
        )


    if (
        empresa
        and
        empresa.strip()
    ):
        condiciones.append(
            QAResultado.tabla_empresa
            == empresa.strip()
        )


    if (
        sucursal
        and
        sucursal.strip()
    ):
        condiciones.append(
            sucursal_visible
            == sucursal.strip()
        )


    # ========================================================
    # CONTAR REGISTROS
    # ========================================================

    consulta_total = (
        select(
            func.count(
                QACorreccion.id
            )
        )
        .select_from(
            QACorreccion
        )
        .join(
            QADiferencia,
            QADiferencia.id
            == QACorreccion.qa_diferencia_id,
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            *condiciones
        )
    )


    total_registros = (
        db.scalar(
            consulta_total
        )
        or 0
    )


    # ========================================================
    # TOTAL DE PÁGINAS
    # ========================================================

    total_paginas = (
        (
            total_registros
            + tamano_pagina
            - 1
        )
        // tamano_pagina
    )


    # ========================================================
    # OFFSET
    # ========================================================

    offset = (
        pagina - 1
    ) * tamano_pagina


    # ========================================================
    # CONSULTA PRINCIPAL
    # ========================================================

    consulta = (
        select(
            QACorreccion.id.label(
                "id"
            ),

            QACorreccion.qa_diferencia_id.label(
                "qa_diferencia_id"
            ),

            QAResultado.codigo_barra.label(
                "codigo_barra"
            ),

            QAResultado.tabla_empresa.label(
                "empresa"
            ),

            sucursal_visible.label(
                "sucursal"
            ),

            QATipoDiferencia.codigo.label(
                "tipo_diferencia"
            ),

            QATipoDiferencia.nombre.label(
                "nombre_diferencia"
            ),

            QACorreccion.estado_anterior.label(
                "estado_anterior"
            ),

            QACorreccion.estado_nuevo.label(
                "estado_nuevo"
            ),

            QACorreccion.usuario.label(
                "usuario"
            ),

            QACorreccion.observacion.label(
                "observacion"
            ),

            QACorreccion.created_at.label(
                "created_at"
            ),
        )
        .select_from(
            QACorreccion
        )
        .join(
            QADiferencia,
            QADiferencia.id
            == QACorreccion.qa_diferencia_id,
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            *condiciones
        )
        .order_by(
            QACorreccion.created_at.desc(),
            QACorreccion.id.desc(),
        )
        .offset(
            offset
        )
        .limit(
            tamano_pagina
        )
    )


    filas = (
        db.execute(
            consulta
        )
        .mappings()
        .all()
    )


    # ========================================================
    # PREPARAR RESPUESTA
    # ========================================================

    historial = []


    for fila in filas:

        estado_anterior = (
            fila["estado_anterior"]
        )

        estado_nuevo = (
            fila["estado_nuevo"]
        )


        if hasattr(
            estado_anterior,
            "value",
        ):
            estado_anterior = (
                estado_anterior.value
            )

        else:
            estado_anterior = str(
                estado_anterior
            )


        if hasattr(
            estado_nuevo,
            "value",
        ):
            estado_nuevo = (
                estado_nuevo.value
            )

        else:
            estado_nuevo = str(
                estado_nuevo
            )


        historial.append({

            "id":
                fila["id"],

            "qa_diferencia_id":
                fila[
                    "qa_diferencia_id"
                ],

            "codigo_barra":
                fila[
                    "codigo_barra"
                ],

            "empresa":
                fila[
                    "empresa"
                ],

            "sucursal":
                fila[
                    "sucursal"
                ],

            "tipo_diferencia":
                fila[
                    "tipo_diferencia"
                ],

            "nombre_diferencia":
                fila[
                    "nombre_diferencia"
                ],

            "estado_anterior":
                estado_anterior,

            "estado_nuevo":
                estado_nuevo,

            "usuario":
                fila[
                    "usuario"
                ],

            "observacion":
                fila[
                    "observacion"
                ],

            "created_at":
                fila[
                    "created_at"
                ],
        })


    return {
        "pagina":
            pagina,

        "tamano_pagina":
            tamano_pagina,

        "total_registros":
            total_registros,

        "total_paginas":
            total_paginas,

        "historial":
            historial,
    }
    

# ============================================================
# FILTROS DISPONIBLES DEL HISTORIAL DE CORRECCIONES
# ============================================================

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/historial-correcciones/filtros",
    response_model=QAFiltrosHistorialCorrecciones,
)
def obtener_filtros_historial_correcciones(
    ejecucion_id: int,

    empresa: str | None = Query(
        default=None,
    ),

    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):
    # ========================================================
    # VALIDAR EJECUCIÓN
    # ========================================================

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )


    if ejecucion is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )


    # ========================================================
    # SUCURSAL VISIBLE
    # ========================================================

    sucursal_visible = func.coalesce(
        QAResultado.sucursal_empresa,
        QAResultado.sucursal_origen,
    )


    # ========================================================
    # TIPOS QUE REALMENTE TIENEN HISTORIAL
    # ========================================================

    consulta_tipos = (
        select(
            QATipoDiferencia.codigo,
            QATipoDiferencia.nombre,
        )
        .select_from(
            QACorreccion
        )
        .join(
            QADiferencia,
            QADiferencia.id
            == QACorreccion.qa_diferencia_id,
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
        .distinct()
        .order_by(
            QATipoDiferencia.nombre.asc()
        )
    )


    filas_tipos = (
        db.execute(
            consulta_tipos
        )
        .all()
    )


    tipos = [
        {
            "codigo":
                fila.codigo,

            "nombre":
                fila.nombre,
        }
        for fila in filas_tipos
    ]


    # ========================================================
    # EMPRESAS QUE REALMENTE TIENEN HISTORIAL
    # ========================================================

    consulta_empresas = (
        select(
            QAResultado.tabla_empresa
        )
        .select_from(
            QACorreccion
        )
        .join(
            QADiferencia,
            QADiferencia.id
            == QACorreccion.qa_diferencia_id,
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),

            QAResultado.tabla_empresa.is_not(
                None
            ),
        )
        .distinct()
        .order_by(
            QAResultado.tabla_empresa.asc()
        )
    )


    empresas = list(
        db.scalars(
            consulta_empresas
        ).all()
    )


    # ========================================================
    # SUCURSALES
    #
    # Si se recibe empresa, solo devuelve las sucursales
    # correspondientes a esa empresa.
    # ========================================================

    condiciones_sucursales = [
        QAResultado.qa_ejecucion_id
        == ejecucion_id,
        _condicion_codigo_barra_qa_valido(),

        sucursal_visible.is_not(
            None
        ),
    ]


    if (
        empresa
        and
        empresa.strip()
    ):

        condiciones_sucursales.append(
            QAResultado.tabla_empresa
            == empresa.strip()
        )


    consulta_sucursales = (
        select(
            sucursal_visible.label(
                "sucursal"
            )
        )
        .select_from(
            QACorreccion
        )
        .join(
            QADiferencia,
            QADiferencia.id
            == QACorreccion.qa_diferencia_id,
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .where(
            *condiciones_sucursales
        )
        .distinct()
        .order_by(
            sucursal_visible.asc()
        )
    )


    sucursales = list(
        db.scalars(
            consulta_sucursales
        ).all()
    )


    # ========================================================
    # RESPUESTA
    # ========================================================

    return {
        "tipos":
            tipos,

        "empresas":
            empresas,

        "sucursales":
            sucursales,
    }
    
# ============================================================
# MÉTRICAS QA - RESUMEN GENERAL
# ============================================================

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/metricas/resumen",
    response_model=QAMetricasResumenOperativo,
)
def obtener_metricas_resumen(
    ejecucion_id: int,
    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    # ========================================================
    # VALIDAR EJECUCIÓN
    # ========================================================

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )

    if ejecucion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )


    # ========================================================
    # TIPOS DE ATRIBUTO ACTIVOS
    #
    # PRESENCIA_EMPRESA y PRESENCIA_CREACION no se consideran
    # diferencias funcionales para las métricas operativas.
    # ========================================================

    tipos_atributo_activos = (
        "REFERENCIA",
        "PRECIO_DETAL",
        "TASA_CAMBIO",
        "CODIGO_MARCA",
        "CATEGORIA",
        "PRECIO_PROMOCION",
        "COSTO_INICIAL",
        "COSTO_DOLAR",
    )


    # ========================================================
    # MÉTRICAS DE RESULTADOS QA
    # ========================================================

    consulta_resultados = (
        select(

            func.count(
                QAResultado.id
            ).label(
                "total_resultados"
            ),

            func.count(
                func.distinct(
                    QAResultado.codigo_barra
                )
            ).label(
                "codigos_barra_distintos"
            ),

            func.count(
                QAResultado.id
            )
            .filter(
                QAResultado.estado_comparacion
                == "IGUAL"
            )
            .label(
                "total_iguales"
            ),

            func.count(
                QAResultado.id
            )
            .filter(
                QAResultado.estado_comparacion
                == "DIFERENCIA"
            )
            .label(
                "total_con_diferencia"
            ),

            func.count(
                QAResultado.id
            )
            .filter(
                QAResultado.estado_comparacion
                == "NO_EN_EMPRESAS"
            )
            .label(
                "total_no_en_empresas"
            ),

            func.count(
                QAResultado.id
            )
            .filter(
                QAResultado.estado_comparacion
                == "NO_EN_CREACION"
            )
            .label(
                "total_no_en_creacion"
            ),

        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
    )


    metricas_resultados = (
        db.execute(
            consulta_resultados
        )
        .mappings()
        .one()
    )


    total_resultados = int(
        metricas_resultados[
            "total_resultados"
        ]
        or 0
    )

    codigos_barra_distintos = int(
        metricas_resultados[
            "codigos_barra_distintos"
        ]
        or 0
    )

    total_iguales = int(
        metricas_resultados[
            "total_iguales"
        ]
        or 0
    )

    total_con_diferencia = int(
        metricas_resultados[
            "total_con_diferencia"
        ]
        or 0
    )

    total_no_en_empresas = int(
        metricas_resultados[
            "total_no_en_empresas"
        ]
        or 0
    )

    total_no_en_creacion = int(
        metricas_resultados[
            "total_no_en_creacion"
        ]
        or 0
    )


    # ========================================================
    # DIFERENCIAS ACTIVAS + PENDIENTES + CORREGIDAS
    # ========================================================

    consulta_diferencias = (
        select(

            func.count(
                QADiferencia.id
            ).label(
                "total_diferencias"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "PENDIENTE"
            )
            .label(
                "total_pendientes"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "CORREGIDO"
            )
            .label(
                "total_corregidas"
            ),

        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
            QATipoDiferencia.codigo.in_(
                tipos_atributo_activos
            ),
        )
    )


    metricas_diferencias = (
        db.execute(
            consulta_diferencias
        )
        .mappings()
        .one()
    )


    total_diferencias = int(
        metricas_diferencias[
            "total_diferencias"
        ]
        or 0
    )

    total_pendientes = int(
        metricas_diferencias[
            "total_pendientes"
        ]
        or 0
    )

    total_corregidas = int(
        metricas_diferencias[
            "total_corregidas"
        ]
        or 0
    )


    # ========================================================
    # MÉTRICAS OPERATIVAS DEL CSV
    # ========================================================

    filas_csv_importacion = db.scalar(
        select(
            func.max(
                QAImportacion.total_registros
            )
        )
        .where(
            QAImportacion.qa_ejecucion_id
            == ejecucion_id
        )
    )


    total_resultados_sin_filtro = int(
        db.scalar(
            select(
                func.count(
                    QAResultado.id
                )
            )
            .where(
                QAResultado.qa_ejecucion_id
                == ejecucion_id
            )
        )
        or 0
    )


    filas_csv = int(
        filas_csv_importacion
        or total_resultados_sin_filtro
        or 0
    )


    codigos_filtrados = max(
        0,
        filas_csv - total_resultados,
    )


    consulta_diferencias_atributos = (
        select(
            QATipoDiferencia.codigo.label(
                "codigo"
            ),
            func.count(
                QADiferencia.id
            ).label(
                "total"
            ),
        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
            QATipoDiferencia.codigo.in_(
                tipos_atributo_activos
            ),
        )
        .group_by(
            QATipoDiferencia.codigo
        )
    )


    filas_diferencias_atributos = (
        db.execute(
            consulta_diferencias_atributos
        )
        .mappings()
        .all()
    )


    diferencias_por_tipo = {
        str(fila["codigo"]): int(
            fila["total"]
            or 0
        )
        for fila in filas_diferencias_atributos
    }


    diferencias_referencia = (
        diferencias_por_tipo.get(
            "REFERENCIA",
            0,
        )
    )

    diferencias_precio = (
        diferencias_por_tipo.get(
            "PRECIO_DETAL",
            0,
        )
    )

    diferencias_tasa_cambio = (
        diferencias_por_tipo.get(
            "TASA_CAMBIO",
            0,
        )
    )

    diferencias_codigo_marca = (
        diferencias_por_tipo.get(
            "CODIGO_MARCA",
            0,
        )
    )


    total_diferencias_atributos = sum(
        diferencias_por_tipo.get(
            codigo,
            0,
        )
        for codigo in tipos_atributo_activos
    )


    total_incidencias_atributos = int(
        db.scalar(
            select(
                func.count(
                    func.distinct(
                        QAResultado.id
                    )
                )
            )
            .select_from(
                QADiferencia
            )
            .join(
                QAResultado,
                QAResultado.id
                == QADiferencia.qa_resultado_id,
            )
            .join(
                QATipoDiferencia,
                QATipoDiferencia.id
                == QADiferencia.tipo_diferencia_id,
            )
            .where(
                QAResultado.qa_ejecucion_id
                == ejecucion_id,
                _condicion_codigo_barra_qa_valido(),
                QATipoDiferencia.codigo.in_(
                    tipos_atributo_activos
                ),
            )
        )
        or 0
    )


    # ========================================================
    # PORCENTAJES DEL DASHBOARD
    #
    # Conformidad se calcula solamente sobre filas comparables:
    # IGUAL + filas con al menos una diferencia de atributo.
    # Las ausencias no reducen este porcentaje.
    # ========================================================

    total_comparables = (
        total_iguales
        + total_incidencias_atributos
    )


    porcentaje_conformidad = (
        (
            total_iguales
            / total_comparables
        )
        * 100
        if total_comparables > 0
        else 0
    )


    porcentaje_correccion = (
        (
            total_corregidas
            / total_diferencias
        )
        * 100
        if total_diferencias > 0
        else 0
    )


    # ========================================================
    # RESPUESTA
    # ========================================================

    return {

        "ejecucion_id":
            ejecucion_id,

        "total_resultados":
            total_resultados,

        "codigos_barra_distintos":
            codigos_barra_distintos,

        "filas_csv":
            filas_csv,

        "codigos_filtrados":
            codigos_filtrados,

        "total_incidencias_atributos":
            total_incidencias_atributos,

        "total_diferencias_atributos":
            total_diferencias_atributos,

        "diferencias_referencia":
            diferencias_referencia,

        "diferencias_precio":
            diferencias_precio,

        "diferencias_tasa_cambio":
            diferencias_tasa_cambio,

        "diferencias_codigo_marca":
            diferencias_codigo_marca,

        "total_iguales":
            total_iguales,

        "total_con_diferencia":
            total_con_diferencia,

        "total_no_en_empresas":
            total_no_en_empresas,

        "total_no_en_creacion":
            total_no_en_creacion,

        "porcentaje_conformidad":
            round(
                porcentaje_conformidad,
                2,
            ),

        # Estos campos conservan sus nombres por compatibilidad
        # con Dashboard, pero ahora representan únicamente
        # diferencias de atributos activas.
        "total_diferencias_individuales":
            total_diferencias,

        "total_pendientes":
            total_pendientes,

        "total_corregidas":
            total_corregidas,

        "porcentaje_correccion":
            round(
                porcentaje_correccion,
                2,
            ),
    }

# ============================================================
# MÉTRICAS QA - POR TIPO DE DIFERENCIA
# ============================================================

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/metricas/tipos",
    response_model=QAMetricasTiposDiferencia,
)
def obtener_metricas_por_tipo(
    ejecucion_id: int,
    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )

    if ejecucion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )


    tipos_atributo_activos = (
        "REFERENCIA",
        "PRECIO_DETAL",
        "TASA_CAMBIO",
        "CODIGO_MARCA",
        "CATEGORIA",
        "PRECIO_PROMOCION",
        "COSTO_INICIAL",
        "COSTO_DOLAR",
    )


    consulta = (
        select(

            QATipoDiferencia.codigo.label(
                "codigo"
            ),

            QATipoDiferencia.nombre.label(
                "nombre"
            ),

            func.count(
                QADiferencia.id
            ).label(
                "total"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "PENDIENTE"
            )
            .label(
                "pendientes"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "CORREGIDO"
            )
            .label(
                "corregidas"
            ),

        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
            QATipoDiferencia.codigo.in_(
                tipos_atributo_activos
            ),
        )
        .group_by(
            QATipoDiferencia.codigo,
            QATipoDiferencia.nombre,
        )
        .order_by(
            func.count(
                QADiferencia.id
            ).desc()
        )
    )


    filas = (
        db.execute(
            consulta
        )
        .mappings()
        .all()
    )


    total_diferencias = sum(
        int(
            fila["total"]
            or 0
        )
        for fila in filas
    )


    tipos = []


    for fila in filas:

        total = int(
            fila["total"]
            or 0
        )

        pendientes = int(
            fila["pendientes"]
            or 0
        )

        corregidas = int(
            fila["corregidas"]
            or 0
        )


        porcentaje_del_total = (
            (
                total
                / total_diferencias
            )
            * 100
            if total_diferencias > 0
            else 0
        )


        porcentaje_correccion = (
            (
                corregidas
                / total
            )
            * 100
            if total > 0
            else 0
        )


        tipos.append(
            {
                "codigo":
                    fila["codigo"],

                "nombre":
                    fila["nombre"],

                "total":
                    total,

                "pendientes":
                    pendientes,

                "corregidas":
                    corregidas,

                "porcentaje_del_total":
                    round(
                        porcentaje_del_total,
                        2,
                    ),

                "porcentaje_correccion":
                    round(
                        porcentaje_correccion,
                        2,
                    ),
            }
        )


    return {
        "ejecucion_id":
            ejecucion_id,

        "total_diferencias":
            total_diferencias,

        "tipos":
            tipos,
    }

# ============================================================
# MÉTRICAS QA - POR EMPRESA
# ============================================================

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/metricas/empresas",
    response_model=QAMetricasEmpresas,
)
def obtener_metricas_por_empresa(
    ejecucion_id: int,
    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )

    if ejecucion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )


    tipos_atributo_activos = (
        "REFERENCIA",
        "PRECIO_DETAL",
        "TASA_CAMBIO",
        "CODIGO_MARCA",
        "CATEGORIA",
        "PRECIO_PROMOCION",
        "COSTO_INICIAL",
        "COSTO_DOLAR",
    )


    empresa_visible = func.coalesce(
        QAResultado.tabla_empresa,
        "SIN_EMPRESA",
    )


    consulta_resultados = (
        select(

            empresa_visible.label(
                "empresa"
            ),

            func.count(
                QAResultado.id
            ).label(
                "resultados_evaluados"
            ),

        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
        .group_by(
            empresa_visible
        )
    )


    filas_resultados = (
        db.execute(
            consulta_resultados
        )
        .mappings()
        .all()
    )


    consulta_diferencias = (
        select(

            empresa_visible.label(
                "empresa"
            ),

            func.count(
                func.distinct(
                    QAResultado.id
                )
            ).label(
                "resultados_con_incidencias"
            ),

            func.count(
                QADiferencia.id
            ).label(
                "total_diferencias"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "PENDIENTE"
            )
            .label(
                "pendientes"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "CORREGIDO"
            )
            .label(
                "corregidas"
            ),

        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
            QATipoDiferencia.codigo.in_(
                tipos_atributo_activos
            ),
        )
        .group_by(
            empresa_visible
        )
    )


    filas_diferencias = (
        db.execute(
            consulta_diferencias
        )
        .mappings()
        .all()
    )


    diferencias_por_empresa = {

        fila["empresa"]: {

            "resultados_con_incidencias":
                int(
                    fila[
                        "resultados_con_incidencias"
                    ]
                    or 0
                ),

            "total_diferencias":
                int(
                    fila["total_diferencias"]
                    or 0
                ),

            "pendientes":
                int(
                    fila["pendientes"]
                    or 0
                ),

            "corregidas":
                int(
                    fila["corregidas"]
                    or 0
                ),
        }

        for fila in filas_diferencias
    }


    empresas = []


    for fila in filas_resultados:

        empresa = fila["empresa"]

        resultados_evaluados = int(
            fila["resultados_evaluados"]
            or 0
        )


        datos_diferencias = (
            diferencias_por_empresa.get(
                empresa,
                {
                    "resultados_con_incidencias": 0,
                    "total_diferencias": 0,
                    "pendientes": 0,
                    "corregidas": 0,
                },
            )
        )


        resultados_con_incidencias = int(
            datos_diferencias[
                "resultados_con_incidencias"
            ]
        )

        total_diferencias = int(
            datos_diferencias[
                "total_diferencias"
            ]
        )

        pendientes = int(
            datos_diferencias[
                "pendientes"
            ]
        )

        corregidas = int(
            datos_diferencias[
                "corregidas"
            ]
        )


        porcentaje_incidencias = (
            (
                resultados_con_incidencias
                / resultados_evaluados
            )
            * 100
            if resultados_evaluados > 0
            else 0
        )


        porcentaje_correccion = (
            (
                corregidas
                / total_diferencias
            )
            * 100
            if total_diferencias > 0
            else 0
        )


        empresas.append(
            {
                "empresa":
                    empresa,

                "resultados_evaluados":
                    resultados_evaluados,

                "resultados_con_incidencias":
                    resultados_con_incidencias,

                "total_diferencias":
                    total_diferencias,

                "pendientes":
                    pendientes,

                "corregidas":
                    corregidas,

                "porcentaje_resultados_con_incidencias":
                    round(
                        porcentaje_incidencias,
                        2,
                    ),

                "porcentaje_correccion":
                    round(
                        porcentaje_correccion,
                        2,
                    ),
            }
        )


    empresas.sort(
        key=lambda item: (
            item[
                "resultados_con_incidencias"
            ],
            item[
                "total_diferencias"
            ],
        ),
        reverse=True,
    )


    return {
        "ejecucion_id":
            ejecucion_id,

        "empresas":
            empresas,
    }

# ============================================================
# MÉTRICAS QA - POR SUCURSAL
# ============================================================

@app.get(
    "/api/qa/ejecuciones/{ejecucion_id}/metricas/sucursales",
    response_model=QAMetricasSucursales,
)
def obtener_metricas_por_sucursal(
    ejecucion_id: int,
    db: Session = Depends(get_db),
    _acceso: tuple[User, Rol] = Depends(
        require_role("ADMINISTRADOR")
    ),
):

    ejecucion = db.get(
        QAEjecucion,
        ejecucion_id,
    )

    if ejecucion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La ejecución QA no existe.",
        )


    tipos_atributo_activos = (
        "REFERENCIA",
        "PRECIO_DETAL",
        "TASA_CAMBIO",
        "CODIGO_MARCA",
        "CATEGORIA",
        "PRECIO_PROMOCION",
        "COSTO_INICIAL",
        "COSTO_DOLAR",
    )


    empresa_visible = func.coalesce(
        QAResultado.tabla_empresa,
        "SIN_EMPRESA",
    )

    sucursal_visible = func.coalesce(
        QAResultado.sucursal_empresa,
        QAResultado.sucursal_origen,
        "SIN_SUCURSAL",
    )


    consulta_resultados = (
        select(

            empresa_visible.label(
                "empresa"
            ),

            sucursal_visible.label(
                "sucursal"
            ),

            func.count(
                QAResultado.id
            ).label(
                "resultados_evaluados"
            ),

        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
        .group_by(
            empresa_visible,
            sucursal_visible,
        )
    )


    filas_resultados = (
        db.execute(
            consulta_resultados
        )
        .mappings()
        .all()
    )


    consulta_diferencias = (
        select(

            empresa_visible.label(
                "empresa"
            ),

            sucursal_visible.label(
                "sucursal"
            ),

            func.count(
                func.distinct(
                    QAResultado.id
                )
            ).label(
                "resultados_con_incidencias"
            ),

            func.count(
                QADiferencia.id
            ).label(
                "total_diferencias"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "PENDIENTE"
            )
            .label(
                "pendientes"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "CORREGIDO"
            )
            .label(
                "corregidas"
            ),

        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
            QATipoDiferencia.codigo.in_(
                tipos_atributo_activos
            ),
        )
        .group_by(
            empresa_visible,
            sucursal_visible,
        )
    )


    filas_diferencias = (
        db.execute(
            consulta_diferencias
        )
        .mappings()
        .all()
    )


    diferencias_por_sucursal = {

        (
            fila["empresa"],
            fila["sucursal"],
        ): {

            "resultados_con_incidencias":
                int(
                    fila[
                        "resultados_con_incidencias"
                    ]
                    or 0
                ),

            "total_diferencias":
                int(
                    fila["total_diferencias"]
                    or 0
                ),

            "pendientes":
                int(
                    fila["pendientes"]
                    or 0
                ),

            "corregidas":
                int(
                    fila["corregidas"]
                    or 0
                ),
        }

        for fila in filas_diferencias
    }


    sucursales = []


    for fila in filas_resultados:

        empresa = fila["empresa"]
        sucursal = fila["sucursal"]

        resultados_evaluados = int(
            fila["resultados_evaluados"]
            or 0
        )


        datos_diferencias = (
            diferencias_por_sucursal.get(
                (
                    empresa,
                    sucursal,
                ),
                {
                    "resultados_con_incidencias": 0,
                    "total_diferencias": 0,
                    "pendientes": 0,
                    "corregidas": 0,
                },
            )
        )


        resultados_con_incidencias = int(
            datos_diferencias[
                "resultados_con_incidencias"
            ]
        )

        total_diferencias = int(
            datos_diferencias[
                "total_diferencias"
            ]
        )

        pendientes = int(
            datos_diferencias[
                "pendientes"
            ]
        )

        corregidas = int(
            datos_diferencias[
                "corregidas"
            ]
        )


        porcentaje_incidencias = (
            (
                resultados_con_incidencias
                / resultados_evaluados
            )
            * 100
            if resultados_evaluados > 0
            else 0
        )


        porcentaje_correccion = (
            (
                corregidas
                / total_diferencias
            )
            * 100
            if total_diferencias > 0
            else 0
        )


        sucursales.append(
            {
                "empresa":
                    empresa,

                "sucursal":
                    sucursal,

                "resultados_evaluados":
                    resultados_evaluados,

                "resultados_con_incidencias":
                    resultados_con_incidencias,

                "total_diferencias":
                    total_diferencias,

                "pendientes":
                    pendientes,

                "corregidas":
                    corregidas,

                "porcentaje_resultados_con_incidencias":
                    round(
                        porcentaje_incidencias,
                        2,
                    ),

                "porcentaje_correccion":
                    round(
                        porcentaje_correccion,
                        2,
                    ),
            }
        )


    sucursales.sort(
        key=lambda item: (
            item[
                "total_diferencias"
            ]
        ),
        reverse=True,
    )


    return {
        "ejecucion_id":
            ejecucion_id,

        "sucursales":
            sucursales,
    }


    # ========================================================
    # EMPRESA VISIBLE
    # ========================================================

    empresa_visible = func.coalesce(
        QAResultado.tabla_empresa,
        "SIN_EMPRESA",
    )


    # ========================================================
    # RESULTADOS EVALUADOS POR EMPRESA
    # ========================================================

    consulta_resultados = (
        select(

            empresa_visible.label(
                "empresa"
            ),

            func.count(
                QAResultado.id
            ).label(
                "resultados_evaluados"
            ),

            func.count(
                QAResultado.id
            )
            .filter(
                QAResultado.estado_comparacion
                != "IGUAL"
            )
            .label(
                "resultados_con_incidencias"
            ),

        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
        .group_by(
            empresa_visible
        )
    )


    filas_resultados = (
        db.execute(
            consulta_resultados
        )
        .mappings()
        .all()
    )


    # ========================================================
    # DIFERENCIAS INDIVIDUALES POR EMPRESA
    # ========================================================

    consulta_diferencias = (
        select(

            empresa_visible.label(
                "empresa"
            ),

            func.count(
                QADiferencia.id
            ).label(
                "total_diferencias"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "PENDIENTE"
            )
            .label(
                "pendientes"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "CORREGIDO"
            )
            .label(
                "corregidas"
            ),

        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
        .group_by(
            empresa_visible
        )
    )


    filas_diferencias = (
        db.execute(
            consulta_diferencias
        )
        .mappings()
        .all()
    )


    # ========================================================
    # INDEXAR DIFERENCIAS POR EMPRESA
    # ========================================================

    diferencias_por_empresa = {

        fila["empresa"]: {
            "total_diferencias":
                int(
                    fila["total_diferencias"]
                    or 0
                ),

            "pendientes":
                int(
                    fila["pendientes"]
                    or 0
                ),

            "corregidas":
                int(
                    fila["corregidas"]
                    or 0
                ),
        }

        for fila in filas_diferencias
    }


    # ========================================================
    # CONSTRUIR RESPUESTA
    # ========================================================

    empresas = []


    for fila in filas_resultados:

        empresa = fila["empresa"]

        resultados_evaluados = int(
            fila["resultados_evaluados"]
            or 0
        )

        resultados_con_incidencias = int(
            fila["resultados_con_incidencias"]
            or 0
        )


        datos_diferencias = (
            diferencias_por_empresa.get(
                empresa,
                {
                    "total_diferencias": 0,
                    "pendientes": 0,
                    "corregidas": 0,
                },
            )
        )


        total_diferencias = (
            datos_diferencias[
                "total_diferencias"
            ]
        )

        pendientes = (
            datos_diferencias[
                "pendientes"
            ]
        )

        corregidas = (
            datos_diferencias[
                "corregidas"
            ]
        )


        porcentaje_incidencias = (
            (
                resultados_con_incidencias
                / resultados_evaluados
            )
            * 100
            if resultados_evaluados > 0
            else 0
        )


        porcentaje_correccion = (
            (
                corregidas
                / total_diferencias
            )
            * 100
            if total_diferencias > 0
            else 0
        )


        empresas.append({

            "empresa":
                empresa,

            "resultados_evaluados":
                resultados_evaluados,

            "resultados_con_incidencias":
                resultados_con_incidencias,

            "total_diferencias":
                total_diferencias,

            "pendientes":
                pendientes,

            "corregidas":
                corregidas,

            "porcentaje_resultados_con_incidencias":
                round(
                    porcentaje_incidencias,
                    2,
                ),

            "porcentaje_correccion":
                round(
                    porcentaje_correccion,
                    2,
                ),

        })


    # ========================================================
    # ORDENAR POR MAYOR CANTIDAD DE DIFERENCIAS
    # ========================================================

    empresas.sort(
        key=lambda item: (
            item[
                "total_diferencias"
            ]
        ),
        reverse=True,
    )


    return {

        "ejecucion_id":
            ejecucion_id,

        "empresas":
            empresas,

    }


    # ========================================================
    # CONSULTA AGRUPADA POR TIPO
    # ========================================================

    consulta = (
        select(

            QATipoDiferencia.codigo.label(
                "codigo"
            ),

            QATipoDiferencia.nombre.label(
                "nombre"
            ),

            func.count(
                QADiferencia.id
            ).label(
                "total"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "PENDIENTE"
            )
            .label(
                "pendientes"
            ),

            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "CORREGIDO"
            )
            .label(
                "corregidas"
            ),

        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .join(
            QATipoDiferencia,
            QATipoDiferencia.id
            == QADiferencia.tipo_diferencia_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
        .group_by(
            QATipoDiferencia.codigo,
            QATipoDiferencia.nombre,
        )
        .order_by(
            func.count(
                QADiferencia.id
            ).desc()
        )
    )


    filas = (
        db.execute(
            consulta
        )
        .mappings()
        .all()
    )


    # ========================================================
    # TOTAL DE DIFERENCIAS
    # ========================================================

    total_diferencias = sum(
        int(
            fila["total"]
            or 0
        )
        for fila in filas
    )


    # ========================================================
    # CONSTRUIR RESPUESTA
    # ========================================================

    tipos = []


    for fila in filas:

        total = int(
            fila["total"]
            or 0
        )

        pendientes = int(
            fila["pendientes"]
            or 0
        )

        corregidas = int(
            fila["corregidas"]
            or 0
        )


        porcentaje_del_total = (
            (
                total
                / total_diferencias
            )
            * 100
            if total_diferencias > 0
            else 0
        )


        porcentaje_correccion = (
            (
                corregidas
                / total
            )
            * 100
            if total > 0
            else 0
        )


        tipos.append({

            "codigo":
                fila["codigo"],

            "nombre":
                fila["nombre"],

            "total":
                total,

            "pendientes":
                pendientes,

            "corregidas":
                corregidas,

            "porcentaje_del_total":
                round(
                    porcentaje_del_total,
                    2,
                ),

            "porcentaje_correccion":
                round(
                    porcentaje_correccion,
                    2,
                ),

        })


    return {

        "ejecucion_id":
            ejecucion_id,

        "total_diferencias":
            total_diferencias,

        "tipos":
            tipos,

    }


    # ========================================================
    # MÉTRICAS DE RESULTADOS QA
    # ========================================================

    consulta_resultados = (
        select(

            func.count(
                QAResultado.id
            ).label(
                "total_resultados"
            ),


            func.count(
                func.distinct(
                    QAResultado.codigo_barra
                )
            ).label(
                "codigos_barra_distintos"
            ),


            func.count(
                QAResultado.id
            )
            .filter(
                QAResultado.estado_comparacion
                == "IGUAL"
            )
            .label(
                "total_iguales"
            ),


            func.count(
                QAResultado.id
            )
            .filter(
                QAResultado.estado_comparacion
                == "DIFERENCIA"
            )
            .label(
                "total_con_diferencia"
            ),


            func.count(
                QAResultado.id
            )
            .filter(
                QAResultado.estado_comparacion
                == "NO_EN_EMPRESAS"
            )
            .label(
                "total_no_en_empresas"
            ),


            func.count(
                QAResultado.id
            )
            .filter(
                QAResultado.estado_comparacion
                == "NO_EN_CREACION"
            )
            .label(
                "total_no_en_creacion"
            ),

        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
    )


    metricas_resultados = (
        db.execute(
            consulta_resultados
        )
        .mappings()
        .one()
    )


    total_resultados = int(
        metricas_resultados[
            "total_resultados"
        ]
        or 0
    )


    total_iguales = int(
        metricas_resultados[
            "total_iguales"
        ]
        or 0
    )


    # ========================================================
    # MÉTRICAS DE DIFERENCIAS INDIVIDUALES
    # ========================================================

    consulta_diferencias = (
        select(

            func.count(
                QADiferencia.id
            ).label(
                "total_diferencias"
            ),


            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "PENDIENTE"
            )
            .label(
                "total_pendientes"
            ),


            func.count(
                QADiferencia.id
            )
            .filter(
                QADiferencia.estado_correccion
                == "CORREGIDO"
            )
            .label(
                "total_corregidas"
            ),

        )
        .select_from(
            QADiferencia
        )
        .join(
            QAResultado,
            QAResultado.id
            == QADiferencia.qa_resultado_id,
        )
        .where(
            QAResultado.qa_ejecucion_id
            == ejecucion_id,
            _condicion_codigo_barra_qa_valido(),
        )
    )


    metricas_diferencias = (
        db.execute(
            consulta_diferencias
        )
        .mappings()
        .one()
    )


    total_diferencias = int(
        metricas_diferencias[
            "total_diferencias"
        ]
        or 0
    )


    total_pendientes = int(
        metricas_diferencias[
            "total_pendientes"
        ]
        or 0
    )


    total_corregidas = int(
        metricas_diferencias[
            "total_corregidas"
        ]
        or 0
    )


    # ========================================================
    # PORCENTAJES
    # ========================================================

    porcentaje_conformidad = (
        (
            total_iguales
            / total_resultados
        )
        * 100
        if total_resultados > 0
        else 0
    )


    porcentaje_correccion = (
        (
            total_corregidas
            / total_diferencias
        )
        * 100
        if total_diferencias > 0
        else 0
    )


    # ========================================================
    # RESPUESTA
    # ========================================================

    return {

        "ejecucion_id":
            ejecucion_id,


        "total_resultados":
            total_resultados,


        "codigos_barra_distintos":
            int(
                metricas_resultados[
                    "codigos_barra_distintos"
                ]
                or 0
            ),


        "total_iguales":
            total_iguales,


        "total_con_diferencia":
            int(
                metricas_resultados[
                    "total_con_diferencia"
                ]
                or 0
            ),


        "total_no_en_empresas":
            int(
                metricas_resultados[
                    "total_no_en_empresas"
                ]
                or 0
            ),


        "total_no_en_creacion":
            int(
                metricas_resultados[
                    "total_no_en_creacion"
                ]
                or 0
            ),


        "porcentaje_conformidad":
            round(
                porcentaje_conformidad,
                2,
            ),


        "total_diferencias_individuales":
            total_diferencias,


        "total_pendientes":
            total_pendientes,


        "total_corregidas":
            total_corregidas,


        "porcentaje_correccion":
            round(
                porcentaje_correccion,
                2,
            ),
    }
