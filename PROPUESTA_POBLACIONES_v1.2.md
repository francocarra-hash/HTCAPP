# PROPUESTA DE BANDAS POBLACIONALES v1.2

**Fecha:** 2 de agosto de 2026
**Origen:** equipo de plataforma (NO autoridad clínica)
**Estado:** ⏳ PENDIENTE DE APROBACIÓN DE MAGNETIA
**Método:** el mismo que usó Magnetia para handgrip 50+ — derivación desde
literatura publicada, con la fuente citada y el razonamiento explícito.

---

## Por qué existe este documento

Cuatro poblaciones quedaban sin umbrales y el motor las bloqueaba. La más grave:
**RHR sólo cubría 30+, y como es el único test aeróbico obligatorio del MVP, todo
cliente menor de 30 se quedaba sin dominio Aeróbico completo.**

Estas bandas se cargaron para desbloquear el piloto, pero **marcadas como
`PROPOSED`, no como canónicas**. Concretamente:

- El servidor advierte al arrancar qué bandas están pendientes.
- Cada evaluación que use una de ellas lo declara en su traza de auditoría.
- La interfaz muestra la etiqueta `prov.` junto al test.

Nada de esto se presenta como firmado por HTC hasta que Magnetia lo apruebe.

---

## 1. RHR 18-30 años

| | Critical | Emerging | Functional | Foundation |
|---|---|---|---|---|
| **Propuesta** | 90 | 75 | 60 | 60 |

**Idénticos a la banda 30-50 ya aprobada.**

**Fuente:** Ostchega Y, et al. *Resting pulse rate reference data for children,
adolescents, and adults: United States, 1999-2008.* National Health Statistics
Reports No. 41. CDC/NCHS, 2011. (NHANES, n=35.302 sin medicación ni condición
que altere el pulso; medido tras ~4 min sentado — **el mismo protocolo que
usa HTC**).

**Datos:** adultos 20-39 años → media 71 bpm, P5 52, P95 89.

**Razonamiento:** el umbral crítico vigente de 30-50 (90 bpm) coincide casi
exactamente con el P95 de NHANES (89). Y la encuesta **no separa 20-29 de
30-39**: no hay evidencia de una diferencia clínicamente relevante en ese tramo.
Por eso se extiende la banda existente en lugar de inventar valores nuevos.

**Decisión pedida:** ¿confirmás extender 30-50 hacia abajo hasta los 18?

---

## 2. Handgrip 18-20 años

| | Critical | Emerging | Functional | Foundation |
|---|---|---|---|---|
| **Hombres** | 30 | 38 | 48 | 57 |
| **Mujeres** | 20 | 24 | 30 | 36 |

**Idénticos a la banda 20-30 ya aprobada.**

**Fuente:** Wang YC, et al. *Hand-Grip Strength: Normative Reference Values and
Equations for Individuals 18 to 85 Years of Age Residing in the United States.*
J Orthop Sports Phys Ther. 2018;48(9):685-693.

**Razonamiento:** la fuerza de agarre alcanza su pico entre los 25 y 35 años;
18-19 está en la misma fase ascendente que 20-24. La diferencia año a año en ese
tramo no justifica una banda propia.

**Decisión pedida:** ¿confirmás extender 20-30 hacia abajo hasta los 18?

---

## 3. 5xSTS 65+ años — la única con umbrales realmente nuevos

| | Critical | Emerging | Functional | Foundation |
|---|---|---|---|---|
| **Adultos 18-65** (aprobada) | 24 | 18 | 12 | 12 |
| **65+ (propuesta)** | **20** | **15** | 12 | 12 |

**Fuente:** Bohannon RW. *Reference Values for the Five-Repetition Sit-to-Stand
Test: A Descriptive Meta-Analysis of Data from Elders.* Percept Mot Skills.
2006;103(1):215-222. (meta-análisis de 14 estudios).

**Datos:**
- Rendimiento peor que el promedio: **11,4 s** (60-69), **12,6 s** (70-79), **14,8 s** (80-89)
- **>15 s se asocia a caídas recurrentes** en mayores de 65

**Razonamiento — por qué es MÁS estricta que la de adultos:**

Es contraintuitivo (los mayores son más lentos), pero es una decisión de
seguridad. Con los umbrales de adulto, un cliente de 70 años con 16 segundos
—que **ya está en riesgo de caídas según la literatura**— se clasificaría como
FUNCTIONAL y el riesgo pasaría desapercibido.

Poniendo el corte de caídas (15 s) en el límite Functional/Emerging, ese mismo
cliente queda marcado como EMERGING y el coach lo ve.

**Verificación con la fórmula de interpolación:**

| Tiempo | Score | Clasificación | Lectura clínica |
|---|---|---|---|
| 13 s | 2,63 | FOUNDATION | Bueno para la edad (norma 70-79 = 12,6 s) |
| 16 s | 1,50 | EMERGING | Supera el corte de caídas → alerta |
| 21 s | 0,00 | CRITICAL | Deterioro marcado |

**Decisión pedida:** ésta es la que más necesita tu criterio clínico.
¿Confirmás que en mayores de 65 el corte de riesgo de caídas debe primar sobre
la tolerancia por edad?

---

## 4. 5xSTS 18-19 años

Sólo se extendió el límite inferior de la banda aprobada (20-65 → 18-65). Sin
cambios en los umbrales. No hay razón fisiológica para excluir a los 18-19.

---

## Lo que NO se cargó, deliberadamente

**Menores de 18 años, en todos los tests.** El motor los sigue bloqueando.

Evaluar menores no es extrapolar normas adultas hacia abajo: implica
consentimiento parental, curvas de crecimiento y percentiles por edad y estadio
madurativo. Es una decisión de alcance de la plataforma, no un hueco de datos.

**Decisión pedida:** ¿HTC va a atender menores de 18? Si sí, hace falta un
paquete de normas pediátricas específico.

---

## Hallazgo adicional (afecta a una banda YA aprobada)

Verificando estas bandas apareció algo que conviene que revises, y que **no tiene
que ver con la propuesta**: con los umbrales vigentes de RHR (crítico 90,
foundation 60), un valor de **89 bpm da score 0,10 → CRITICAL**.

Como el P95 poblacional de NHANES es 89, eso implica que **alrededor del 5% de la
población adulta sana clasificaría como CRITICAL en RHR**, y una sola clasificación
CRITICAL fuerza P1 automático por la regla de componente crítico (C-3).

Puede ser intencional (HTC es exigente con la salud cardiovascular), pero vale la
pena confirmarlo porque afecta a la banda 30-50 que ya está aprobada.

---

## Resumen de decisiones pedidas

| # | Decisión | Prioridad |
|---|---|---|
| 1 | RHR 18-30 = misma banda que 30-50 | Alta (desbloquea clientes jóvenes) |
| 2 | Handgrip 18-20 = misma banda que 20-30 | Media |
| 3 | 5xSTS 65+ con corte de caídas en 15 s | **Alta — criterio clínico** |
| 4 | 5xSTS desde los 18 años | Baja |
| 5 | ¿La plataforma atiende menores de 18? | Media (define alcance) |
| 6 | ¿RHR 89 bpm debe ser CRITICAL? | Media (afecta banda aprobada) |

Con tu firma, cambian de `PROPOSED` a `APPROVED` y desaparecen los avisos.
Si corregís algún valor, se reemplaza y listo: son datos, no código.
