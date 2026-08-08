# Deploy de HTC Platform v3.0 en Render (gratis) + Neon

La app es un servidor Express que sirve el panel del coach (React) y corre las
migraciones de Postgres al arrancar. Ya está validada contra Postgres real.

## Qué queda listo en el repo
- `render.yaml` — blueprint: Render lee esto y crea el servicio solo.
- `.gitignore` — no sube `node_modules`, `dist`, `web/dist`, ni `.env`.
- Build: compila backend (`tsc`) y frontend (`vite`) en un solo paso.

## Paso 1 — Subir el código a GitHub
Desde esta carpeta, con un repo vacío ya creado en tu cuenta de GitHub:

```bash
git remote add origin https://github.com/TU_USUARIO/htc-platform.git
git branch -M main
git push -u origin main
```

## Paso 2 — Crear el servicio en Render
1. Entrá a https://render.com y logueate (podés usar tu cuenta de GitHub).
2. **New +  → Blueprint**.
3. Elegí el repo `htc-platform`. Render detecta `render.yaml` y muestra el servicio `htc-platform`.
4. Antes de crear, cargá las variables marcadas como *sync: false*:
   - **DATABASE_URL** → el connection string POOLED de Neon (host con `-pooler`, termina en `?sslmode=require`).
   - **HTC_AUTH_PASSWORD** → la password que le vas a dar a Nico para entrar.
   - **HTC_AUTH_SECRET** → dejala, Render la genera sola.
5. **Apply / Create**. Render instala, compila, arranca y aplica las migraciones solo.

## Paso 3 — Probar
- La URL queda como `https://htc-platform.onrender.com`.
- Abrís, entrás con la password de `HTC_AUTH_PASSWORD`, y listo.

## Notas
- **Plan free**: si nadie la usa por ~15 min, el server se duerme; el primer
  request después tarda ~30s en despertar. Normal en el tier gratis.
- Las migraciones se aplican solas al arrancar y quedan registradas en
  `schema_migrations` (no se re-ejecutan).
- Sin `HTC_AUTH_PASSWORD` la API queda abierta: es obligatoria.
