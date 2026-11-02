# PDMC en Netlify

Netlify compila y publica la interfaz de PDMC (`PDMC-APP/frontend`) y reenvía `/api/*` a la API de PDMC en el servidor (`https://apiqa.apipalacio.com`). El servidor solo ejecuta la API. Ver `netlify.toml`.

En Netlify basta con `Base directory = deployment/netlify-pdmc`: el comando de compilación, la carpeta publicada y la versión de Node salen de `netlify.toml`.

En el `backend\.env.local` de PDMC en el servidor:

```
PDMC_AUTH_ADDITIONAL_ORIGINS=https://<sitio de PDMC>.netlify.app
PDMC_QA_SSO_DESTINATION=https://<sitio de NEXO QA>.netlify.app
```

En el `.env` del backend de NEXO QA:

```
CYSN_CORS_ORIGINS=https://<sitio de NEXO QA>.netlify.app
```

Limitación: Netlify corta las peticiones reenviadas que tardan más de unos 26 segundos.
