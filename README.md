# HTC Platform

Sistema de decisión física HTC (Hit The Climax), implementado fielmente desde la
documentación HTC. **El software no define HTC: lo ejecuta.** Todo el
conocimiento vive en YAML canónico; el código no contiene ningún umbral, regla
ni texto clínico.

## Modelo vigente: OS v3.0 (C-1 a C-5 resueltos)

```
Health Gates → Clasificación 0-3 → Movement → Roadmap → Reporte
```

| Decisión | Implementación |
|---|---|
| **C-1** Health transversal | 4 STOP gates (PAR-Q+, PAS ≥180, PAD ≥110, dolor torácico) + 13 red flags + flags de dolor. Health nunca compite por prioridad. |
| **C-2** Escala 0-3 | Interpolación `((v − crítico)/(foundation − crítico))×3` con clamp y redondeo conservador. |
| **C-3** Componente crítico | Override automático del dominio a CRITICAL, con trazabilidad del test que lo disparó. |
| **C-4** Movement | 4 niveles jerárquicos, 20 variables de observación con rubric; dominio = peor nivel. |
| **C-5** Umbrales | Tabla única: 12 tests, 15 poblaciones. |

Canonical en `canonical-v3/` · motor en `src/v3/` · API en `/api/v3/*`.

El **modelo v2** (Decision Graph, 5 pathways) queda accesible en `canonical/` y
`/api/*` porque las evaluaciones históricas nunca se recalculan (Principio 6).

**Fuera de alcance** (responden `MODULE NOT IMPLEMENTED`): prescripción de
ejercicios, dosificación, daily missions, exercise library.

## Despliegue

| Variable | Para qué | Obligatoria |
|---|---|---|
| `HTC_AUTH_PASSWORD` | Login del coach. **Sin ella la API queda abierta**: obligatoria en cualquier deploy hosteado. | Sí (hosting) |
| `DATABASE_URL` | PostgreSQL. Sin ella todo corre en memoria y se pierde al reiniciar. | Sí (piloto) |
| `HTC_TOKEN_SECRET` | Firma de los tokens de sesión. | Recomendada |
| `PGSSL=disable` | Postgres local sin TLS. | No |
| `PORT` | Puerto (default 3000). | No |

Las migraciones (incluida `003_v3_assessments.sql`) corren solas al arrancar
cuando hay `DATABASE_URL`.

## Comandos

```bash
npm install
npm run type-check   # 0 errores (TypeScript strict)
npm run build        # compila a dist/
npm test             # 247 tests (unit + integración + e2e)
npm run demo:move    # caso documentado: Workspace Ownership 76% → P1 → MOVE
npm run demo:build   # scoring multi-dominio: Stability crítica → P1 → BUILD
npm run dev          # API en :3000 (ts-node)
```

## API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/assess` | Corre el pipeline completo → decisión + Reasoning Card |
| POST | `/decisions/:id/confirm` | Confirmación/override del coach (override exige razón) |
| GET | `/clients/:id` | Historial del cliente |
| GET | `/decisions/:id` | Decisión completa |
| GET | `/decisions/:id/audit` | Traza de auditoría (estándares, reglas, evidencia, versión canónica) |
| GET | `/decisions/:id/report?lang=es\|en` | Client Report (9 secciones, Platform Data §30.2) |
| GET | `/canonical/version` | Versión del canonical cargado |

Errores: `400` input inválido · `409 MISSING_CANONICAL` (dato canónico faltante —
el sistema nunca inventa) · `422` campos/razón de override faltantes ·
`501 MODULE_NOT_IMPLEMENTED` · `500` error de sistema.

## Arquitectura

```
canonical/*.yaml  ← única fuente de conocimiento HTC (versionada)
src/canonical/    loader (validación Zod, fail-loudly) + compiler (índices)
src/engines/      classification / safety / decision / pathway
src/resolvers/    standard-resolver / language-resolver
src/pipeline.ts   orquesta la secuencia de capas (nunca se saltea una)
src/report/       Client Report
src/api/          Express REST
src/db/           repositorio (in-memory) + migrations/001_init.sql (PostgreSQL)
```

Reglas de oro implementadas:
- Safety se evalúa **antes** que todo y consume solo información clínica.
- Un único P1 (Regla 18.7). Confianza LOW ⇒ prohibido P1 definitivo (18.6).
- Causa antes que manifestación (11.2); dependencias bloquean P1 (18.3).
- Toda decisión emite IDs de razonamiento; el texto sale de `language_mapping.yaml`.
- Todo override del coach exige razón registrada (Platform Data §29).
- Estándares PLACEHOLDER lanzan error; DRAFT advierten.

## Estado del Canonical

Transcripto desde los documentos fuente con `verification_status` por entrada.
**Huecos y validaciones pendientes de HTC:** ver [CANONICAL_GAPS.md](CANONICAL_GAPS.md).

## Base de datos y piloto

Con `DATABASE_URL` seteada el sistema usa **PostgreSQL** (migraciones automáticas
al arrancar; `npm run migrate` manual). Sin ella corre in-memory (solo dev).
Auth de coach: seteando `HTC_AUTH_PASSWORD` se activa el login (token firmado,
12h). Ver [DEPLOY.md](DEPLOY.md) para el checklist de piloto y
[../PARA_HTC_RESUMEN_CONFLICTOS.md](../PARA_HTC_RESUMEN_CONFLICTOS.md) para las
decisiones que Magnetia/HTC debe responder antes de salir (grip por edad es la
única bloqueante).

## Frontend del coach (`web/`)

React + Tailwind + Vite (stack según Quick Reference v3.0). Pantallas MVP:
Dashboard → Nueva Evaluación (formulario generado desde el catálogo canónico;
tests sin estándar aparecen deshabilitados con "Falta estándar HTC") →
Reasoning Card (confianzas system/clinical, confirmación u override con
categoría del Blueprint §6 y razón obligatoria, scoring OS 10.3, auditoría) →
Client Report es/en.

```bash
cd web && npm install && npm run build   # produce web/dist
npm run build && npm start               # Express sirve API (/api) + frontend en :3000
# desarrollo: npm run dev (backend) + cd web && npm run dev (Vite :5173 con proxy)
```

## Pendiente para fases siguientes

Auth, PostgreSQL activo, knowledge engine, fases por criterio de salida,
dashboard predictivo, coach override learning (Product Spec v3.0) — y completar
los huecos canónicos de CANONICAL_GAPS.md con HTC.
