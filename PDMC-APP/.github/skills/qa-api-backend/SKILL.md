---
name: qa-api-backend
description: Test PDMC API routes and backend behavior, including authentication, authorization, validation, business rules, error handling, and audit effects.
---

# QA de API y backend de PDMC

Verifica contratos y reglas del servidor directamente en rutas, servicios y pruebas existentes. Prioriza comportamiento observable y regresiones; no cambies el comportamiento esperado solo para hacer pasar una prueba.

## Procedimiento

1. Delimita rutas, métodos, payloads, respuestas y servicios afectados. Revisa las pruebas cercanas y las reglas de acceso definidas para roles y alcances.
2. Cubre solicitudes válidas e inválidas: campos ausentes o malformados, valores fuera de rango, recursos inexistentes, duplicados, estados incompatibles y fallos de dependencias.
3. Para cada operación sensible, verifica acceso anónimo, sesión inválida, usuario sin permiso, permiso con alcance insuficiente y rol autorizado. Comprueba que la autorización se aplique en el servidor, no solo en la interfaz.
4. Verifica códigos HTTP, forma de respuesta y mensajes sin filtrar detalles internos. Comprueba también persistencia, transacciones, auditoría y ausencia de cambios parciales si la operación falla.
5. Añade o ejecuta pruebas con el patrón `node:test` usado en `tests/*.test.mjs` y `tests/*.integration.mjs`. Usa `npm test` para unitarias; `npm run test:integration` para integración.
6. Las pruebas de integración requieren PostgreSQL de pruebas/local, definido mediante `TEST_DATABASE_URL` o `DATABASE_URL` local. Usan un esquema temporal. Nunca configures credenciales de producción ni ejecutes la suite contra una base compartida.
7. Informa fallos con ruta, método, rol/precondición sintética, entrada no sensible, estado esperado/observado y comando ejecutado. Si una dependencia no está disponible, indica el bloqueo con precisión.

## Protecciones

- No registres ni muestres tokens, cookies, contraseñas, hashes de contraseña, secretos o contenido de `.env.local`.
- Usa datos sintéticos y usuarios de prueba. No realices cargas o acciones administrativas sobre sistemas reales.
- No consideres una ruta segura únicamente porque el cliente o la página oculte un botón; valida la ruta del servidor.
- No marques como exitoso un caso que no se ejecutó o cuya respuesta solo se infirió.
