"""Crea el primer administrador de NEXO QA en una base recién instalada.

    python -m app.crear_administrador --usuario admin --nombre "Administración QA" [--email ...]

La contraseña se toma de CYSN_ADMIN_PASSWORD o se pide por teclado (mínimo 12 caracteres);
nunca se escribe en la línea de órdenes. Si el usuario ya existe no se modifica.
"""
from __future__ import annotations

import argparse
import getpass
import os
import sys

from sqlalchemy import select

MIN_PASSWORD = 12


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.crear_administrador", description=__doc__.split("\n\n")[0])
    parser.add_argument("--usuario", required=True, help="Nombre de usuario para iniciar sesión.")
    parser.add_argument("--nombre", required=True, help="Nombre visible.")
    parser.add_argument("--email", default=None)
    args = parser.parse_args(argv)

    password = os.getenv("CYSN_ADMIN_PASSWORD") or getpass.getpass("Contraseña del administrador: ")
    if len(password) < MIN_PASSWORD:
        print(f"Error: la contraseña debe tener al menos {MIN_PASSWORD} caracteres.", file=sys.stderr)
        return 1

    # Importación diferida: --help no necesita .env ni conexión.
    from app.db.database import SessionLocal
    from app.models.rol import Rol
    from app.models.user import User
    from app.security import hash_password

    with SessionLocal() as db:
        rol = db.scalar(select(Rol).where(Rol.nombre == "ADMINISTRADOR"))
        if rol is None:
            print("Error: falta el rol ADMINISTRADOR (catálogo inicial de la base).", file=sys.stderr)
            return 1
        if db.scalar(select(User).where(User.username == args.usuario)) is not None:
            print(f"El usuario {args.usuario!r} ya existe; no se modificó.")
            return 0
        db.add(User(rol_id=rol.id, username=args.usuario, nombre=args.nombre, email=args.email,
                    password_hash=hash_password(password), activo=True))
        db.commit()
    print(f"Administrador {args.usuario!r} creado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
