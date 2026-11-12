# Progreso y monitoreo de carga — relevamiento, cambios y pendientes

Respuesta a los documentos *Progress & Load Monitoring Engine v1.0* y *Load
Management Extension v1.0*. El motor de evaluación (canonical, engines, v3) no
se tocó: las evaluaciones siguen siendo la única fuente de clasificaciones
formales.

## 1. Cómo estaba (relevamiento)

| Pieza | Qué había | Problema frente al pedido |
|---|---|---|
| `training_sessions.routine` | La rutina escrita por el profe (bloques, ítems, dosis en texto). | Es **lo indicado**. Para sesiones "registradas como hechas" es lo que anotó el profe, sin detalle por serie. |
| `training_completions` | Checks por ejercicio, notas, cómo se sintió (1–5), comentario. | No había esfuerzo de la sesión (sRPE), duración, dolor ni series realizadas. |
| `training_attendance` | Presente / ausente / ejercicios enviados por día. | Asistencia, sin adherencia a lo indicado. |
| `progress.ts` | Evolución por ejercicio leyendo las cantidades del texto. | Mezclaba sesiones con y sin carga externa; el % de "en qué trabaja" podía leerse como reparto del estímulo. |
| Edición de rutina | `PATCH /sessions/:id` reemplazaba la rutina. | No quedaba qué había antes, ni el motivo. |
| Evaluaciones HTC | Vinculadas por id al alumno. | Correcto y separado; no se mostraban junto al progreso. |

## 2. Qué se agregó

### Modelo de datos (migración `009`, sólo agrega tablas)

- **`training_executions`** — lo realizado por ejercicio y sesión: tipo de
  registro (fuerza dinámica, isométrico, movilidad, pliometría, aeróbico,
  control motor), variante, equipamiento (`load_config`), asistencia, peso
  corporal, **foto de lo indicado** (`prescribed`, no cambia si se edita la
  rutina), series (`sets`: repeticiones, carga + unidad, lado, tiempo,
  distancia, altura, velocidad, potencia, FC, RPE, RIR, descanso, ROM, tempo,
  dolor 0–10, estado de la serie, nota), fuente (profe/alumno), calidad del dato
  (completo/incompleto) y versión. Único por (sesión, alumno, ítem): evita
  duplicados.
- **`training_session_responses`** — sRPE (escala CR-10), duración, estado
  (completa/parcial/modificada), fatiga, dolor muscular, dolor + zona,
  recuperación, nota, fuente y versión.
- **`training_change_log`** — cada alta, corrección o baja de lo realizado y
  cada modificación de la programación: antes, después, quién, cuándo, motivo y
  categoría (progresar, mantener, reducir, cambiar ejercicios, adaptar).

Los datos que faltan quedan en `null`; nunca se completan con cero ni con lo
indicado. "Igual que lo indicado" copia la dosis sólo si la persona lo toca.

### Cálculos

- **Comparación en el tiempo**: sólo entre registros del mismo ejercicio, misma
  variante, mismo equipamiento, con o sin carga externa, mismo lado y misma
  unidad. Si cambia alguna de esas condiciones se informa el cambio y no se
  compara directo. Si falta saber el equipamiento, o hay datos incompletos o
  series parciales, la comparación se marca **limitada**.
- Para cada medida: base (valor y fecha), actual, cambio absoluto con unidad y
  `% = (actual − base) / base × 100` sólo si la base es válida y distinta de 0.
- **Volumen de carga** = Σ carga × repeticiones de las series hechas (no de las
  indicadas). Si alguna serie no tiene carga o repeticiones, queda vacío (no
  cero). En unilaterales se informa por lado, nunca sumado.
- **Carga interna** = minutos × sRPE, en UA. Se presenta como carga percibida,
  no como medición fisiológica.
- **Adherencia**: asistencia (clases) separada de adherencia a lo indicado
  (ejercicios hechos sobre indicados, sólo en sesiones con registro).
- **Exposición por capacidad**: "X % de los ejercicios registrados", nunca como
  % del estímulo.
- Un cambio de RPE/RIR solo no se interpreta como mejora ni empeoramiento.
- Interpretaciones fijas y descriptivas ("más tiempo de sostén no equivale a un
  porcentaje igual de fuerza"). Sin diagnósticos, sin ACWR, sin riesgo de
  lesión, sin umbrales numéricos.

### "Para revisar" (patrones descriptivos, no alertas)

Bajó en dos registros comparables seguidos · más esfuerzo con el mismo trabajo ·
síntomas informados (y si se repiten o el último es mayor) · faltan sRPE o
duración · sesiones parciales repetidas · ausencias y rutinas asignadas sin
hacer. Ventana: últimas 4 semanas (el ciclo de HTC). Cada punto muestra los
registros que lo respaldan.

### Pantallas

- **Profe → alumno → Progreso**: Resumen (adherencia, frecuencia, carga interna,
  exposición, y lo anotado en las rutinas como antes) · Ejercicios (lo realizado,
  por condiciones comparables, con base/actual/cambio, gráfico y registros) ·
  Carga (por semana con 7 días / 28 días / todo, exposición filtrable, respuesta
  a cada sesión) · Evaluaciones (las formales, aparte) · Revisar (patrones y
  cambios de la programación con su motivo).
- **Registrar lo realizado**: desde Historial o la última sesión (profe) y desde
  la rutina con el botón de series o el Historial (alumno). El alumno no pisa lo
  que registró el profe.
- **Al terminar la rutina** el alumno responde el esfuerzo de la sesión (0–10) y
  los minutos.
- **Editar una sesión** pide (opcional) por qué: categoría + motivo.

## 3. Otros pedidos de esta tanda

- **Planificar**: selector "Seleccionar alumno" con búsqueda por nombre o
  apellido (sin acentos), "Recientes" con los últimos 5 abiertos (guardados en el
  servidor, sin duplicados, sin alumnos de baja). Una vez elegido queda sólo el
  nombre con "Cambiar" y la opción de sumar a alguien que entrena con él. El
  componente (`StudentPicker`) se puede usar en otras secciones.
- **Mi plan y pagos** (alumno, en Perfil): plan, clases disponibles (contratadas,
  hechas, quedan), próximo pago (importe, moneda, fecha, estado), botón "Pagar con
  Mercado Pago" con el link que carga el profe, "Ya pagué" (le avisa al profe, no
  marca nada como pagado) y pagos anteriores. Usa los mismos datos de Finanzas.
- **Finanzas**: moneda por alumno (US$ o $), link de Mercado Pago por cuota
  (sólo links https de Mercado Pago; se oculta solo al registrar el pago; avisa si
  el importe no coincide con los honorarios) y aviso "a confirmar" cuando el
  alumno dice que pagó (en su ficha y en la campana).

## 4. Pendiente (necesita claves o decisiones)

1. **Mercado Pago automático** (Checkout Pro + notificaciones/webhooks para
   marcar pagos aprobados, pendientes o rechazados sin duplicar): hace falta el
   *Access Token* de producción de la cuenta de Mercado Pago de HTC y la *clave
   secreta* de webhooks. Hoy funciona con links cargados a mano.
2. **Resumen con IA** de los patrones del alumno: hace falta una API key
   (Anthropic) y definir quién la paga. Todo lo que diga tiene que salir de
   registros identificables; la estructura de datos ya lo permite.
3. **Reglas de HTC para "Para revisar"**: hoy son patrones descriptivos sin
   umbrales. Si HTC aprueba umbrales propios (p. ej. cuántas sesiones con dolor
   antes de avisar), se agregan como regla explícita.
4. **Programa** como entidad (`program_id`): la app trabaja sesión por sesión;
   las modificaciones se registran por sesión. Si se quiere agrupar en programas
   (bloques de semanas), es una tabla más.
5. **Tipo de registro por ejercicio en la biblioteca**: hoy se sugiere por la
   capacidad y la dosis y se elige al registrar.

## 5. Tests

`src/__tests__/load_monitoring.test.ts` cubre los 7 escenarios de aceptación
(wall sit 120→150 s, búlgara de peso corporal a con carga, repeticiones sin
carga, RIR 3→1 con mismo trabajo, Copenhagen sin tocar evaluaciones, integridad
histórica al editar la rutina, unilateral por lado) más duplicados, correcciones
versionadas, permisos del alumno, "Mi plan y pagos" sin datos internos, link sólo
de Mercado Pago y recientes de Planificar.
