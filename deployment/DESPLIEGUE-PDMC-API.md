# Despliegue: PDMC solo API (PDMC-API) e interfaz en Netlify

El servidor deja de ejecutar la interfaz de PDMC (Next.js en `ServicioQA\PDMC-APP`) y pasa a ejecutar solo la API (`ServicioQA\PDMC-API`, Hono) en el mismo puerto, 5083. Caddy no cambia. La interfaz la publica Netlify (`deployment/netlify-pdmc`). NEXO QA no cambia.

`ServicioQA\PDMC-APP` no se toca: sirve para volver atrás.

Ejecutar todo en PowerShell **como administrador**.

## 1. Antes: quién pierde accesos y respaldo (solo lectura + copia)

La migración `20261030120000_sin_alcance_nacional` retira las asignaciones operativas sin ubicación (por ejemplo «Mejora Continua · Nacional»). Se guardan en la auditoría, pero hay que reasignar una región a esas personas.

```powershell
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
& $psql -U postgres -d sistemas_unificados -c "SELECT u.email, a.rol FROM pdmc.""AsignacionAcceso"" a JOIN pdmc.""Usuario"" u ON u.id=a.""usuarioId"" WHERE a.""ubicacionId"" IS NULL AND a.rol<>'ADMINISTRADOR';"
& 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' -U postgres -d sistemas_unificados -n pdmc -Fc -f "C:\temp\pdmc-antes-api-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

## 2. Copiar el paquete

```powershell
Remove-Item C:\temp\Servidor -Recurse -Force -ErrorAction SilentlyContinue
# Copiar la carpeta Servidor (sin comprimir) a C:\temp\Servidor y luego:
robocopy 'C:\temp\Servidor' 'C:\Users\Administrator\Documents\servicios IAN\ServicioQA' /E /XD .git .secrets __pycache__ .pytest_cache generated node_modules /XF .env .env.local config.env /NFL /NDL /NP
```

## 3. Instalar la API en paralelo (PDMC sigue funcionando)

```powershell
$Q = 'C:\Users\Administrator\Documents\servicios IAN\ServicioQA'
Copy-Item "$Q\PDMC-APP\.env.local" "$Q\PDMC-API\backend\.env.local"
cd "$Q\PDMC-API"
npm ci --omit=dev
npm run db:generate -w backend
npm run db:status -w backend      # debe decir que falta 20261030120000_sin_alcance_nacional
```

Prueba en otro puerto (Ctrl+C para cerrarla):

```powershell
cd "$Q\PDMC-API\backend"; $env:PORT='5084'; $env:PDMC_HOST='127.0.0.1'; node --import tsx src/server.ts
# En otra ventana: debe responder 401 (pide sesión)
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:5084/api/panel
```

## 4. Cambio

```powershell
cd "$Q\PDMC-API"
npm run db:migrate -w backend
```

1. Guardar una copia del `.bat` que se usa para arrancar y reemplazarlo por `ServicioQA\deployment\Inicio-servicios-IAN.bat` (pasos 10 y 11 apuntan a `PDMC-API`).
2. Ejecutar el `.bat`.
3. Comprobar: `PDMC-API\logs\pdmc.out.log` dice «PDMC API lista en http://127.0.0.1:5083», `PDMC-API\logs\sync.out.log` registra ejecuciones y `https://apiqa.apipalacio.com/api/panel` responde 401.
4. Subir los cambios a GitHub (`PDB-sis/Union_de_sistemas-QA`) para que Netlify compile la interfaz nueva. Hasta que termine (unos minutos), la entrada de Netlify no muestra PDMC.
5. Entrar en `https://sistemaunionqa.netlify.app`: inicio de sesión, transferencias, devoluciones, inventario, «Actualizar ahora», administración y botón hacia NEXO QA.
6. Reasignar una región a las personas que salieron en el paso 1.
7. `deployment\Revisar-Datos-Bodega.ps1` debe seguir cuadrando.

## Volver atrás

- Arranque: volver a poner el `.bat` guardado (o `ServicioQA\deployment\Inicio-servicios-IAN.anterior.bat`) y ejecutarlo. Arranca el PDMC anterior desde `PDMC-APP`.
- Netlify: en Deploys, publicar el despliegue anterior.
- Base de datos: la versión anterior funciona con la migración aplicada. Solo si hiciera falta, restaurar el respaldo del paso 1 con `pg_restore`.

`ServicioQA\PDMC-APP` se borra cuando pase una semana sin incidencias.
