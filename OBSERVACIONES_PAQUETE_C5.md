# OBSERVACIONES — Paquete C-1 a C-5 (25/07/2026)

**Estado de la implementación: ✅ OS v3.0 IMPLEMENTADO Y FUNCIONANDO**
228 tests en verde · type-check limpio · verificado end-to-end en el browser.

Los 5 conflictos que bloqueaban (C-1 a C-5) están resueltos y transcriptos al
Canonical. Este documento lista **observaciones detectadas al implementar**:
erratas de los ejemplos y decisiones que tomé siguiendo la regla explícita
mayoritaria. Ninguna bloquea el MVP; todas conviene que las confirmes.

---

## OBS-1 · Interpolación vs bandas de la tabla (afecta 9 de 12 tests)

**Qué pasa.** La fórmula de C-2 usa sólo `umbral_critical` y `umbral_foundation`.
En los tests donde `umbral_functional == umbral_foundation` (Dead Hang, Wall Sit,
Push-Up, Inverted Row, los 4 de Mobility, VO2), la interpolación clasifica
FOUNDATION en parte del rango que la tabla rotula FUNCTIONAL.

| Test | Valor | Interpolación (implementado) | Banda de la tabla |
|---|---|---|---|
| Dead Hang | 39 s | 2.90 → **FOUNDATION** | "<40 = Functional" |
| Wall Sit | 51 s | 2.33 → **FOUNDATION** | "<60 = Functional" |
| Hip AROM | 85° | 2.70 → **FOUNDATION** | "<90 = Functional" |

**Qué implementé.** La interpolación, porque es el método designado por C-2 en
los tres documentos y porque el promedio ponderado exige un score numérico.

**Qué necesito de vos.** Confirmar que es correcto que un Dead Hang de 39 s
quede FOUNDATION. Si no, la alternativa es interpolación por tramos (que use los
4 umbrales); es un cambio de configuración, no de código.

---

## OBS-2 · El pseudocódigo del Roadmap no suma 100%

**Qué pasa.** La Validation Rule 1 exige "Volume allocation must sum to 100%",
pero el pseudocódigo del mismo documento asigna valores que casi nunca suman 100:

| Caso | Pseudocódigo | Suma | Tabla de decisión | Suma |
|---|---|---|---|---|
| 1 CRITICAL + 3 otros | 70 + 20 + 5 + 3 | **98%** | 70 + 20 + 5 + 5 | 100% ✓ |
| 1 CRITICAL + 3 functional | 70 + 5 + 3 + 3 | **81%** | — | — |
| 2 CRITICAL | 35 + 35 + 15 + 5 | **90%** | 35 + 35 + 20 + 10 | 100% ✓ |

**Qué implementé.** Los valores de la **tabla de decisión**, que es la única
fuente que satisface la Validation Rule 1. Cuando hay menos de 4 dominios
evaluados el total no llega a 100 y el motor normaliza proporcionalmente,
dejando constancia en el audit trail.

**Qué necesito de vos.** Confirmar que la tabla manda sobre el pseudocódigo
(o corregir el pseudocódigo).

---

## OBS-3 · Dos erratas aritméticas en los ejemplos

Verifiqué los 6 cálculos del ejemplo "Male 28" de la Clinical Specification.
Cuatro dan exacto; dos no:

| Test | Doc dice | Cálculo correcto | Comentario |
|---|---|---|---|
| Handgrip 45 | 1.67 FUNCTIONAL | 1.667 FUNCTIONAL ✓ | |
| Wall Sit 45 | 1.875 FUNCTIONAL | 1.875 FUNCTIONAL ✓ | |
| Push-Up 18 | 1.56 FUNCTIONAL | 1.560 FUNCTIONAL ✓ | |
| Inverted Row 12 | 1.4 EMERGING | 1.400 EMERGING ✓ | |
| **5xSTS 15 s** | 1.88 | **2.25** | La fórmula escrita `((24-15)/(12-24))×3` da −2.25 (signo invertido). Con los umbrales correctos da 2.25 → FUNCTIONAL (misma clase, distinto número). |
| **Dead Hang 35 s** | 2.5 = "FUNCTIONAL" | 2.5 = **FOUNDATION** | 2.5 ≥ 2.25, así que por la propia regla de C-2 es FOUNDATION, no FUNCTIONAL. |

**Impacto:** ninguno en el código (implementé la regla, no los ejemplos). Vale
corregir los ejemplos del documento para que no confundan.

---

## OBS-4 · Redondeo conservador: un bullet contradice la regla

La regla general aparece idéntica en dos documentos: *"cuando Score = exactamente
0.75, 1.5 o 2.25 → asigna la peor clasificación"*. Pero el tercer bullet de la
Clinical Specification dice:

> `Score = 0.75 exactly → EMERGING (not FUNCTIONAL)`

Por la regla general, 0.75 debería ser **CRITICAL** (es el borde entre CRITICAL y
EMERGING, y "la peor" es CRITICAL). El bullet parece un copy-paste del caso 1.5.

**Qué implementé.** La regla general (0.75 → CRITICAL), porque está enunciada dos
veces de forma idéntica y porque el ejemplo del YAML schema la confirma:
RHR 75 → score exactamente 1.5 → EMERGING (la peor de las dos).

---

## OBS-5 · Poblaciones sin cubrir (el sistema se detiene, a propósito)

| Test | Cubre | No cubre |
|---|---|---|
| Handgrip | 20-50 años | **<20 y >50 años** |
| RHR | 30+ años | **<30 años** |
| 5xSTS | 20-65 años | **>65 años** |

Un cliente de 28 años con RHR, o de 55 con handgrip, corta la evaluación con un
mensaje explícito. Es deliberado: el sistema nunca extrapola umbrales. En el
formulario, esos campos aparecen deshabilitados con el motivo.

**Qué necesito de vos.** Las bandas faltantes, sobre todo **handgrip >50 años**
(población frecuente) y **RHR <30**.

---

## OBS-6 · Severidad de 3 red flags no está especificada individualmente

La regla dice *"CRITICAL: Dyspnea/Dizziness/Neuro → STOP; ALERT: Others → FLAG"*.
Por esa regla, estas tres quedan como ALERT (no detienen la evaluación):

- **Evento cardiovascular**
- **Hospitalización reciente**
- **Trastorno neurológico** (distinto de "síntomas neurológicos", que sí es STOP)

Las implementé como ALERT según la regla textual, marcadas como DRAFT en el
Canonical. **Es una decisión clínica tuya**: un evento cardiovascular reciente
clasificado como "continúa con alerta" merece confirmación explícita.

---

## OBS-7 · Diferencias menores entre documentos

1. **Impact factors**: el paquete nuevo (Strength 3.0 · Movement 2.5 · Mobility 2.0 ·
   Aerobic 1.5) reemplaza los del OS v2.0. Implementé los nuevos.
2. **Cirugía reciente**: antes era "<6 semanas → STOP"; ahora "<4 semanas → ALERT".
   Implementé lo nuevo.
3. **Conteo de red flags**: la Clinical Spec dice "8 other clinical red flags",
   la tabla de umbrales lista 8 y el YAML schema 13. Implementé las 13 del schema.
4. **Escenario 1 del Roadmap**: dice "Movement: FUNCTIONAL" y lo asigna P2
   comentando "[EMERGING by worst score]". Con FUNCTIONAL el algoritmo lo manda a
   SUPPORT. Implementé el algoritmo.
5. **Movement con score numérico**: los ejemplos le asignan valores (1.9, 2.8)
   aunque el MVP lo define cualitativo. La estructura ya está lista para los
   umbrales numéricos de v2.0.

---

## Lo que quedó implementado

| Componente | Estado |
|---|---|
| Health Gates transversales (C-1) | ✅ 4 STOP gates + 2 flags + 13 red flags |
| Interpolación 0-3 + redondeo conservador (C-2) | ✅ verificado contra los ejemplos |
| Critical Component Override (C-3) | ✅ con trazabilidad de qué test lo disparó |
| Movement 4 niveles + worst-case (C-4) | ✅ 20 variables de observación con rubric |
| Tabla única de umbrales (C-5) | ✅ 12 tests, 15 poblaciones |
| Roadmap Engine (3 reglas + ranking + constraints) | ✅ los 3 escenarios reproducen |
| Versionado inmutable | ✅ 6 versiones congeladas por assessment |
| Frontend del coach | ✅ formulario + resultado + auditoría |

**Cobertura de tests:** 228 en verde (68 nuevos para v3).
