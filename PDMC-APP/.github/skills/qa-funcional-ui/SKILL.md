---
name: qa-funcional-ui
description: Plan and execute functional and UI regression QA for PDMC. Use when validating user workflows, pages, forms, navigation, responsive behavior, or browser regressions.
---

# QA funcional y de interfaz de PDMC

Valida los flujos visibles de PDMC desde la perspectiva de sus usuarios. Basa los casos en el comportamiento existente, el código y las pruebas actuales; no des por hecho que una etiqueta, permiso o regla funciona como en otro sistema.

## Procedimiento

1. Identifica el alcance solicitado y los roles, módulos y flujos relacionados. Revisa los componentes, rutas y pruebas existentes antes de proponer casos.
2. Cubre los caminos principales y sus límites: estados vacíos, carga, éxito, validación, error, cancelación, permisos y persistencia después de recargar.
3. Comprueba navegación, etiquetas y mensajes, controles deshabilitados, selección, filtros, paginación y consistencia de los datos que se muestran.
4. Para cambios de interfaz, verifica teclado y foco, nombres accesibles, diálogos y tamaños de pantalla relevantes cuando el entorno lo permita.
5. Ejecuta primero las pruebas más acotadas. Para regresión automatizada del proyecto, usa `npm test`; para las pruebas de interfaz en Edge, consulta `tests/interfaz.browser.mjs` y `tests/admin.browser.mjs`.
6. La prueba de navegador requiere una compilación previa (`npm run build`), Edge instalado y una base PostgreSQL local o `TEST_DATABASE_URL` de pruebas. La prueba crea un esquema aleatorio aislado y lo elimina al finalizar. Usa únicamente una base descartable; no la apuntes a producción.
7. Si no se puede ejecutar una prueba, explica el requisito que falta y deja el resultado como no ejecutado; no lo marques como aprobado.

## Seguridad y datos de prueba

- Usa registros sintéticos, identificadores únicos y cuentas de prueba. No copies datos personales, credenciales, tokens ni registros empresariales a casos o reportes.
- No uses operaciones destructivas ni limpies una base compartida. No ejecutes pruebas de navegador sobre datos reales.
- Nunca muestres valores de `.env.local`, `.secrets/`, cookies o contraseñas en la salida.

## Resultado

Registra por flujo: precondiciones y rol, pasos, resultado esperado, resultado observado y estado (`aprobado`, `fallido`, `bloqueado` o `no ejecutado`). Para un fallo, aporta la ruta/pantalla y evidencia mínima reproducible, sin incluir secretos ni datos reales.
