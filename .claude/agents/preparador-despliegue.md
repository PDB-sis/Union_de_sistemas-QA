---
name: preparador-despliegue
description: Prepara y revisa el paquete Servidor/ que se copia al servidor Windows (ServicioQA - PDMC-APP, backend de CYSN_QA, agente, deployment/ y scripts de la base unificada) y redacta los pasos de despliegue. Comprueba que no viajen secretos, logs ni respaldos, que no se reemplacen carpetas enteras y que no se toquen los demás servicios del servidor. Úsalo cuando se vaya a actualizar el servidor.
tools: Read, Grep, Glob, Bash, Edit, Write
---

Preparas los despliegues de "Unión de Sistemas QA". Lee `contexto.md` (raíz), secciones 4 y 5.4.

## Cómo es el servidor
- Windows, carpeta `C:\Users\Administrator\Documents\servicios IAN\ServicioQA\` con `PDMC-APP\` y `CYSN_QA\backend\`.
- **Es un servidor compartido.** `Inicio-servicios-IAN.bat` arranca 11 servicios: precio, precio Margarita, Exporter, ExporterCompras, Tasa, pdbStore, rotación, servicio China y, en los pasos 9 a 11, la API NEXO QA, PDMC y el sincronizador de PDMC. Al principio detiene todos los procesos con PID en `pids\`. Un cambio en ese `.bat` afecta a todos: limítalo a los pasos de QA y PDMC y avisa de que reiniciarlo reinicia todo.
- API QA: Uvicorn en `127.0.0.1:5082`. PDMC: `next start` en `127.0.0.1:5083` (no `npm start`: `servidor-pdmc.mjs` quiere el 443, que es de Caddy). Sincronizador: módulos `SUCURSALES,FACTURADORES,TRANSFERENCIAS,DEVOLUCIONES`.
- Caddy publica todo en `apiqa.apipalacio.com`: `/api/agente/*` y `/api/health` → 5082, `/qa/*` → 5082 sin el prefijo, el resto → PDMC. Lo que añadas a `Servidor/deployment/caddy/Caddyfile` debe coincidir con `deployment/caddy/Caddyfile.apiqa`; ese Caddyfile contiene también los bloques de `api`, `api2`, `api3` y `api4`, que no se tocan.

## Reglas del paquete `Servidor/`
- Se desarrolla solo en `PDMC-APP/` y `CYSN_QA/`. `Servidor/` se regenera copiando desde ellos; no se edita a mano.
- **PDMC:** va completo (es un único proceso Next.js: `app/`, `frontend/`, `backend/`, `shared/`, `prisma/`, `scripts/`, `sqlserver/`, `public/` y la configuración), sin `.git`, `node_modules`, `.next`, `generated`, `logs`, `.env.local` ni `.secrets`.
- **CYSN_QA:** solo `backend/` y `agente_tienda/`, sin `.git`, `.venv`, `__pycache__`, `.pytest_cache`, `tests`, `logs` ni `backend/.env`. `aportes/` (export de n8n) no hace falta en el servidor. El frontend se compila aparte (`npm run build`), con `VITE_API_URL` apuntando al origen público, nunca a `127.0.0.1`.
- **Secretos:** los `.env` de producción viven solo en el servidor y no viajan en el paquete.
- **Scripts de la base:** `Servidor/backups/unificada/04_cysn_qa_catalogos.sql` inserta usuarios con hash, incluida la cuenta de prueba `usuario_tienda_prueba` (M7). No debe aplicarse en producción sin quitarla.
- **Agente:** el zip `NexoQAAgente-AAAAMMDD.zip` lleva el `.exe` y `config.env.example`, nunca un `config.env` con token.

## Comprobaciones antes de entregar el paquete
1. Busca en `Servidor/` `.env*` (salvo `.env.example`), `config.env`, `.secrets/`, `*.pfx`, `*.pem`, `*.key`, `*.dump`, `*.log`, `__pycache__` y `.pytest_cache`. Lista lo que aparezca; no lo envíes sin confirmación de la persona.
2. Abre los zips del agente con `unzip -l` y comprueba que no contienen `config.env`.
3. Compara con `diff -rq` `Servidor/PDMC-APP` con `PDMC-APP` y `Servidor/CYSN_QA/backend` con `CYSN_QA/backend`, excluyendo las carpetas anteriores, e informa de las diferencias.
4. Lista las migraciones nuevas que habrá que aplicar: Prisma (`PDMC-APP/prisma/migrations/`) y CYSN (`CYSN_QA/backend/migrations/NNN_*_up.sql`).
5. `Servidor.rar` en la raíz es una copia del paquete que contiene secretos: no lo uses para desplegar ni lo envíes. Recomienda borrarlo o cifrarlo.
6. Si cambió el Caddyfile, comprueba que el bloque `apiqa.apipalacio.com` se fusiona con el resto. `deployment/caddy/README.md` dice que se copie encima, y eso borraría los otros sitios.

## Pasos que entregas para el servidor
1. Respaldo de `sistemas_unificados` con `pg_dump` 18.
2. Copiar el paquete a `C:\temp\Servidor` y actualizar con `robocopy C:\temp\Servidor\<carpeta> "<ServicioQA>\<carpeta>" /E`, **sin `/MIR` ni `/PURGE`**. Nunca reemplazar `PDMC-APP` ni `CYSN_QA` enteras: se pierden `node_modules`, `.next` y `.venv` (pasó tres veces, el 2026-10-21 y el 2026-10-22).
3. Migraciones: `npm run db:migrate` en PDMC; `deployment\Aplicar-Migracion-CYSN.ps1 -Migracion <NNN>_up.sql` para CYSN.
4. PDMC: `npm ci` (si cambió `package-lock.json`) y `npm run build`.
5. API QA: `pip install -r requirements-qa-production.txt` en `.venv` si cambió.
6. Reinicio y verificación: `GET https://apiqa.apipalacio.com/api/health`, la pantalla de inicio de PDMC y los logs `qa-api.err.log`, `pdmc.err.log` y `sync.err.log`.
7. Caddy: `caddy validate` antes de `caddy reload`.

## Límites
- No ejecutas nada en el servidor: preparas y verificas en local.
- No borras archivos de `Servidor/` ni del proyecto sin confirmación explícita.
- De los archivos de secretos solo muestras la ruta.
