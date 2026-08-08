# HTC Platform — Guía de Deploy (Piloto)

**Estado del código:** OS v3.0 · Thresholds v1.1 · Clinical Spec v1.1 · 274 tests en verde.
**Objetivo:** piloto cerrado con 1 coach y 5-10 clientes reales.

---

## ⚠️ Leer primero: qué está verificado y qué no

| Componente | Estado |
|---|---|
| Motor de decisión, clasificación, health gates, roadmap | ✅ 274 tests |
| API + frontend | ✅ verificado end-to-end en navegador |
| Repositorio **in-memory** | ✅ cubierto por tests |
| Repositorio **PostgreSQL** (`PgRepository`, `PgV3Repository`) | ⚠️ **escrito pero NUNCA ejecutado contra una base real** |
| Migraciones SQL | ⚠️ idem: nunca aplicadas contra Postgres real |

**Esto es lo primero a validar en el deploy.** El SQL compila y sigue el mismo
contrato que la versión in-memory, pero nadie lo corrió. Ver "Checklist de
validación" abajo: hasta que esos pasos pasen, no se puede usar con clientes reales.

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | **Sí (piloto)** | `postgres://user:pass@host:5432/htc`. Sin ella corre in-memory y **pierde todo al reiniciar**. |
| `HTC_AUTH_PASSWORD` | **Sí (hosteado)** | Contraseña del coach. Sin ella **la API queda abierta** — datos clínicos expuestos. |
| `HTC_AUTH_SECRET` | Recomendada | Secreto de firma de tokens. Obligatoria si hay más de una instancia. |
| `PORT` | No | Default 3000. |
| `PGSSL` | No | `disable` para Postgres local sin TLS. |
| `HTC_CANONICAL_DIR` | No | Default `./canonical` (modelo v2, histórico). |
| `HTC_CANONICAL_V3_DIR` | No | Default `./canonical-v3` (**modelo vigente**). |

Las migraciones (`migrations/*.sql`, incluida `003_v3_assessments.sql`) se aplican
**solas al arrancar** cuando hay `DATABASE_URL`, y quedan registradas en
`schema_migrations`. Manual: `DATABASE_URL=... npm run migrate`.

---

## Build

```bash
npm install
npm run build                       # backend → dist/
cd web && npm install && npm run build && cd ..   # frontend → web/dist/
npm start                           # sirve API + frontend en :3000
```

Node 18+. El backend sirve el frontend compilado desde `web/dist`.

---

## Opción A — Railway (recomendada, ~USD 10-20/mes)

1. railway.app → nuevo proyecto → **Add PostgreSQL** (genera `DATABASE_URL`).
2. **Add Service → GitHub repo** apuntando a `htc-platform/`.
3. Build: `npm install && npm run build && cd web && npm install && npm run build`
   Start: `npm start`
4. Variables: `DATABASE_URL` (referencia al plugin), `HTC_AUTH_PASSWORD`, `HTC_AUTH_SECRET`.
5. El dominio `*.up.railway.app` sirve frontend + API con HTTPS.

## Opción B — Local (Docker para la base)

```bash
docker run -d --name htc-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=htc -p 5432:5432 postgres:16

export DATABASE_URL="postgres://postgres:postgres@localhost:5432/htc"
export PGSSL=disable
export HTC_AUTH_PASSWORD="elegir-una-contraseña"
npm start
```

---

## ✅ Checklist de validación (obligatorio antes del piloto)

Correr **en este orden**. Los primeros cuatro son los que nunca se probaron.

### 1. Migraciones
```bash
DATABASE_URL=... npm start
```
- [ ] El log dice `PostgreSQL connected; migrations applied: 001..., 002..., 003...`
- [ ] En la base existen: `clients`, `assessments`, `decisions`, `audit_log`, `v3_assessments`
- [ ] Reiniciar: ahora dice `schema up to date` (no reaplica)

### 2. Persistencia real (el riesgo principal)
- [ ] Crear una evaluación desde la UI
- [ ] **Reiniciar el servidor**
- [ ] La evaluación sigue en el listado y se abre igual que antes
- [ ] `SELECT count(*) FROM v3_assessments;` devuelve 1

### 3. Inmutabilidad (Principio 6)
- [ ] En la traza de auditoría figuran las 6 versiones congeladas
- [ ] `SELECT result->'version_snapshot' FROM v3_assessments;` coincide con la UI
- [ ] Reabrir la evaluación no recalcula nada

### 4. Confirmación / override del coach
- [ ] Confirmar una evaluación → `coach_confirmed = true` en la base
- [ ] Intentar override sin razón → la API responde 422
- [ ] Override con razón y categoría → se guarda `override_reason_category`

### 5. Autenticación
- [ ] Con `HTC_AUTH_PASSWORD` seteada, aparece la pantalla de login
- [ ] `curl https://.../api/v3/assessments` sin token → **401**
- [ ] Con contraseña incorrecta → no entra

### 6. Casos clínicos (smoke test)
- [ ] Mujer 55, handgrip 26 → banda `FEMALE_50_60`, score 1.8, FUNCTIONAL
- [ ] Evento cardiovascular a 1 semana → evaluación **bloqueada**
- [ ] El mismo a 6 semanas → continúa, marcado como crónico
- [ ] Presión sistólica 190 → bloqueada, deriva a médico

### 7. Suite completa
```bash
npm test        # 274 tests
npm run type-check
```

---

## Si algo falla en los pasos 1-4

Es el escenario esperado: ese código nunca se ejecutó. Los puntos frágiles:

- **Tipos de `pg`**: `jsonb` vuelve como objeto o string según configuración —
  `PgV3Repository.get()` ya contempla ambos casos.
- **`gen_random_uuid()`**: requiere PostgreSQL 13+. En versiones anteriores hay
  que habilitar `pgcrypto`.
- **Timestamps**: `pg` devuelve `Date`; el repositorio los serializa a ISO.
- **Constraint `override_requires_reason`**: si un override entra sin razón, la
  base lo rechaza. Es intencional (defensa en profundidad).

---

## Después del deploy

- Correr el checklist entero y anotar resultados.
- Cambiar `HTC_AUTH_PASSWORD` por una contraseña real (no la de prueba).
- Hacer un backup de la base antes del primer cliente.
- Si van a usar la plataforma **varios coaches**: hoy hay un único password y
  no se registra quién hizo cada evaluación (`v3_assessments` no tiene
  `coach_id`). Con un solo coach no hace falta; con varios, hay que agregarlo
  antes de empezar a medir acuerdo coach/algoritmo.
