import hashlib
import os
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash


# Configuración recomendada por pwdlib.
# Actualmente utiliza Argon2 para generar hashes seguros.
password_hash = PasswordHash.recommended()


JWT_ALGORITHM = "HS256"
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 30


def hash_password(password: str) -> str:
    """
    Genera un hash seguro a partir de una contraseña en texto plano.

    La contraseña original nunca debe almacenarse en PostgreSQL.
    El valor retornado por esta función es el que se guardará
    posteriormente en user.password_hash.
    """
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """
    Verifica si una contraseña en texto plano corresponde
    con el hash almacenado.

    Retorna:
        True  -> la contraseña coincide.
        False -> la contraseña no coincide.
    """
    return password_hash.verify(password, hashed_password)


def hash_token_agente(token: str) -> str:
    """
    SHA-256 hexadecimal del token de un agente de tienda.

    Es el valor guardado en agente_sucursal.token_hash; el token
    original solo lo conoce el config.env de la sucursal.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _get_jwt_secret_key() -> str:
    """
    Obtiene la clave privada usada para firmar/verificar JWT.

    La clave debe existir únicamente en el entorno local/servidor
    mediante JWT_SECRET_KEY. Nunca debe escribirse en el código.
    """
    secret_key = os.getenv("JWT_SECRET_KEY")

    if not secret_key:
        raise RuntimeError(
            "JWT_SECRET_KEY no está configurada en el entorno."
        )

    return secret_key


def create_access_token(user_id: int) -> str:
    """
    Genera un access token JWT para un usuario autenticado.

    El claim 'sub' identifica al usuario por su id.
    La autorización por rol todavía no se resuelve desde el token;
    FastAPI consultará PostgreSQL para obtener el estado real del usuario.
    """
    ahora = datetime.now(timezone.utc)
    expira = ahora + timedelta(
        minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": ahora,
        "exp": expira,
    }

    return jwt.encode(
        payload,
        _get_jwt_secret_key(),
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    """
    Verifica firma y expiración del access token.

    Si el token es inválido, expiró o no es de tipo access,
    se lanza InvalidTokenError.
    """
    payload = jwt.decode(
        token,
        _get_jwt_secret_key(),
        algorithms=[JWT_ALGORITHM],
    )

    if payload.get("type") != "access":
        raise InvalidTokenError("Tipo de token inválido.")

    return payload
