# Entrada de PDMC en Netlify

Netlify reenvía todo a PDMC en el servidor (`https://apiqa.apipalacio.com`). Ver `netlify.toml`.

En el `.env.local` de PDMC en el servidor:

```
PDMC_AUTH_ADDITIONAL_ORIGINS=https://<sitio de PDMC>.netlify.app
PDMC_QA_SSO_DESTINATION=https://<sitio de NEXO QA>.netlify.app
```

En el `.env` del backend de NEXO QA:

```
CYSN_CORS_ORIGINS=https://<sitio de NEXO QA>.netlify.app
```

Limitación: Netlify corta las peticiones reenviadas que tardan más de unos 26 segundos.
