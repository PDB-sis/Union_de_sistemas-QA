# Caddy: API QA

Este archivo es infraestructura del servidor y no se ejecuta dentro de los proyectos.

1. Instalar Caddy para Windows como servicio.
2. Crear `C:\Caddy\logs`.
3. Copiar `Caddyfile.apiqa` a `C:\Caddy\Caddyfile`.
4. Validar: `caddy validate --config C:\Caddy\Caddyfile`.
5. Recargar: `caddy reload --config C:\Caddy\Caddyfile`.

Caddy abrirá HTTPS automáticamente para `apiqa.apipalacio.com` y reenviará al backend QA en `127.0.0.1:5082`. Antes de iniciarlo, asegure que los puertos TCP 80 y 443 estén abiertos y que el backend esté limitado a localhost.

Los frontends públicos (PDMC y QA) requieren dominios propios adicionales. No se incluyen aquí porque aún no se definieron.