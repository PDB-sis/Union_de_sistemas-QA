---
name: qa-reporte
description: Produce a clear, evidence-based QA summary for PDMC changes or releases, including coverage, test results, blockers, and reproducible defects.
---

# Reporte QA de PDMC

Entrega un informe conciso y verificable sobre el alcance probado. Usa esta skill después de ejecutar QA funcional, de API/backend o de base de datos, o cuando se solicite un resumen de liberación.

## Reglas del informe

- Separa `aprobado`, `fallido`, `bloqueado` y `no ejecutado`. Un comando iniciado sin completar no cuenta como aprobado.
- Enumera el entorno de forma segura (por ejemplo, local, PostgreSQL de pruebas, navegador/versión si se conoce) y los comandos ejecutados. No publiques valores de configuración.
- Resume módulos y casos cubiertos; señala explícitamente las áreas no cubiertas y por qué.
- Por cada defecto, incluye severidad, módulo/ruta, precondiciones sintéticas, pasos mínimos, esperado frente a observado y evidencia disponible. No inventes hallazgos ni asignaciones de severidad sin fundamento.
- Ordena los defectos por impacto y reproducibilidad. Evita reportar la misma causa como varios problemas.
- No incluyas datos de clientes, nombres reales, correos, secretos, tokens, cookies, registros completos ni contenido privado de archivos de entorno.
- No modifiques datos, código ni configuración del sistema solo para generar el informe. No afirmes que algo se validó si solo se revisó estáticamente.

## Formato sugerido

```text
Resumen: [resultado general y alcance]
Entorno: [entorno seguro y dependencias relevantes]
Ejecutado: [comandos y estado]
Cobertura: [flujos/módulos revisados]
Hallazgos: [severidad, ubicación, pasos y esperado/observado; o "Sin hallazgos"]
Pendiente/bloqueado: [casos no ejecutados y causa; o "Ninguno"]
```
