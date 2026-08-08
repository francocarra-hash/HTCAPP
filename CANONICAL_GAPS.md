# HTC CANONICAL — GAPS & PENDING VALIDATIONS

**Actualizado:** 2026-07-19 · **Canonical v3.1.0** · Requerido por HTC AI Manifest ("Document what was missing").
Nada de esta lista fue inventado. Cada ítem **bloquea** la funcionalidad que lo consume (`MISSING CANONICAL: ...`) o corre marcado **DRAFT**.

> **v3.1.0 (2026-07-19):** se minaron `Evaluation sheets.zip` (HTC_SCORING_RUBRIC,
> HTC_MASTER_ASSESSMENT_FORM, HTC_COACH_QUICK_REFERENCE), el Aerobic System
> REFINED v1.1 y el Movement Standard FINAL. **Se cerraron 16 estándares nuevos**
> (RHR, HR Recovery, HR Drift, Pace Variability, Talk Test, ROM % de norma,
> CARs 0-10, Mobility Integration, Push-Ups/Squats/Rows endurance, CMJ, Broad
> Jump, y los 4 niveles observacionales de Movement). Los 5 dominios ahora son
> clasificables end-to-end.

## A. BLOQUEANTES (el engine falla explícitamente)

| # | Falta | Impacto | Qué debe entregar HTC |
|---|---|---|---|
| A1 | Handgrip fuera de 30–34 años: iGRIPS solo publica la banda 30–34. El SCORING_RUBRIC trae cortes parciales por edad (18-29/30-39/40-49/50+) pero **solo Foundation y Critical** (falta el límite Fn/E) y además **contradice a iGRIPS** en 30-39 (Fnd ≥48 vs ≥55.9) | Grip no clasifica fuera de 30–34 | Tabla completa P5/P25/P75 por edad/sexo y resolución del conflicto rubric vs iGRIPS |
| A2 | 30-Sec Chair Stand: Standards v2 contradictorio; rubric trae solo Fnd/Crit por edad (60-64 ≥14/<8 … 80+ ≥11/<5), sin banda media | Chair Stand inutilizable (PLACEHOLDER) | Bandas completas C/E/Fn/F por edad/sexo |
| A3 | Sin estándar: Single-Leg Squat Score y Cross Crawl Matrix (bandas numéricas "HTC score"), Single Leg Sit-to-Stand, Single Leg Wall Sit, End-Range Dynamometry, CAR Assessment en grados (en la práctica reemplazado por CARs 0-10) | Esos tests puntuales no clasifican — pero los 5 dominios ya tienen cobertura por otros tests | Bandas numéricas, o confirmación de que los reemplazos v3.1.0 son los oficiales |
| A4 | `TEST_SINGLE_LEG_BALANCE`: estándar sin vínculo test↔capacidad (Master Form lo lista bajo observación de Movement, sin asignación explícita) | Test inactivo | Confirmar capacidad |
| A5 | Pathway cuando no hay bottleneck y el goal no es PERFORMANCE ni LONG_TERM_MAINTENANCE | Error explícito | Regla faltante |
| A6 | Tests del BUILD PACKAGE sin definición: `flexibility_cm`, `5xsts_seconds`, `inverted_row_reps` | Casos Diego/María no ejecutables | Definirlos o descartarlos formalmente |

## B. DRAFT (funciona, pendiente de validación HTC)

| # | Ítem | Decisión tomada (a validar) |
|---|---|---|
| B1 | `STANDARD_ROCKPORT_VO2` sin segmentación de población | Banda genérica de MASTER TABLES T3 (ACSM) |
| B2 | `STANDARD_HR_DRIFT`: la tabla da C >10 / E 5-10 / Fn-F <5; el corte F≤2% sale de la nota "Key Changes" del mismo doc | Foundation ≤2 transcripto de esa nota |
| B3 | Agregación multi-test → capacidad | Peor clasificación (conservador); fuente menciona promedios ponderados sin bandas completas |
| B4 | Convención de bordes de banda | Límite inferior inclusivo / superior exclusivo |
| B5 | Movement como P1 → pathway | BUILD (Decision Graph Nodo 20 "P1 within Build") |
| B6 | Fórmula de `system_confidence` | HIGH=100 / MODERATE=70 / LOW=30 promediado |
| B7 | Textos de `language_mapping.yaml` | Transcriptos; validar wording exacto |
| B8 | Mobility Regional Screen → mapeo a `CAP_JOINT_WORKSPACE` | A confirmar |
| B9 | Umbral de dolor "limita significativamente" | Declaración explícita del coach por evento |
| B10 | Enumeración formal de RED_FLAGS | El coach registra el evento; falta lista canónica |
| B11 | Ventanas de reevaluación fuera de T8 | Coach las fija manualmente; v3.1.0 sumó ventanas por test desde los docs de dominio (6-8 sem) |
| B12 | Estándares sin banda Foundation definida | Comportamiento conservador: FOUNDATION inalcanzable hasta que HTC entregue el corte |

## C. DISCREPANCIAS DOCUMENTALES REPORTADAS (resueltas por jerarquía, a confirmar)

1. **Movement 4 vs 5 componentes** (OS 9.1 vs resto) → modelo de 4.
2. **Dominios 5 vs 6** → 5 (aprobado 2026-07-18).
3. **Grip YAML vs iGRIPS** → iGRIPS (aprobado). Nuevo: el SCORING_RUBRIC agrega una **tercera** tabla de grip que también difiere — elevado en A1.
4. **Modelo de decisión** → Decision Graph completo (aprobado). Casos Diego/María superseded.
5. **PLATFORM DATA §17 vs OS 10.3 (scoring)** → OS gana; score como recomendación + confirmación del coach.
6. **00_MASTER_INDEX desactualizado** (Multi-Domain Engine sí existe: OS cap.10).
7. **NUEVO (v3.1.0) — Stability: SCORING_RUBRIC vs Strength Standards v2**: Side Plank (Fnd ≥90 vs ≥120), Biering (Fn 75-119 vs 60-119), Single-Leg Squat (bandas ≥60/45-59/20-44/<20 vs ≥120/60-119/30-59/<30). → Prevalece el doc [STANDARDS] COMPLETE v2 (nivel 3 sobre coach tool). HTC debe unificar.
8. **NUEVO — Dead Hang**: rubric sin split por sexo (Fn 45-59) vs Standards v2 con split (M Fn 40-59 / F Fn 30-44). → Prevalece Standards v2.
9. **NUEVO — Umbral de estrategia**: COACH_QUICK_REFERENCE dice "within 5 points = concurrent" vs OS 10.8 "<10 = concurrent". → Prevalece OS (10).
10. **NUEVO — RHR población**: Aerobic System anota "(age 30-50)"; el rubric no restringe. → Sin restricción (rubric + master form), a confirmar.
