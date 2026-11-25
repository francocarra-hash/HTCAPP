# Agenda y calendario

## Cambiar una clase

Todo lo que se le puede hacer a la clase de un día está en una sola hoja
(`ClassSheet`, en `web/src/app/Agenda.tsx`). Se abre desde:

- **Ficha del alumno → Agenda**: tocando una fila de "Próximas clases" o
  cualquier día del calendario, de hoy en adelante.
- **Hoy → Agenda**: con "Cambiar esta clase" en la fila del alumno.
- **Ficha del alumno → Pagos**: "Cambiar una clase" lleva a la pestaña Agenda.

Según el día, la hoja ofrece:

| El día…                      | Se puede…                                                     |
|------------------------------|---------------------------------------------------------------|
| tiene clase                  | cambiar la hora (sólo ese día o todas las semanas), pasarla a otro día, cancelarla |
| es un día fijo cancelado     | volver a agendarla                                            |
| tuvo una clase que se pasó   | volver la clase a ese día                                     |
| está libre                   | sumar una clase (recuperatorio, extra)                        |

Cada acción se guarda en el momento; no hay botón "Guardar agenda". Los días
fijos ("Horario fijo") también se guardan solos: al tocar un día, y al salir del
campo de la hora.

No se puede pasar una clase a un día que ya tiene clase.

### Cómo queda guardado

La agenda del alumno (`schedule`) no cambió de formato:

- `weekly`: días fijos con su hora.
- `skip`: fechas de días fijos que no tienen clase (canceladas o pasadas).
- `once`: fechas puntuales. Con `from`, es una clase pasada desde ese día.

| Acción                         | `skip`             | `once`                                              |
|--------------------------------|--------------------|-----------------------------------------------------|
| Cancelar un día fijo           | + la fecha         | —                                                   |
| Pasar una clase a otro día     | + el día original  | + día nuevo, `from` = día original                  |
| Cambiar la hora sólo ese día   | + la fecha         | + la misma fecha con la hora nueva (nota "Cambio de hora") |
| Sumar una clase extra          | —                  | + la fecha, sin `from`                              |

En todos los casos la clase se cuenta una sola vez. La lógica está en
`web/src/app/agendaOps.ts` (funciones puras) y sus pruebas en
`tests/agenda_ops.test.ts`, que la comparan contra `occurrences` del servidor.

## Las clases en el calendario del profe

**Hoy → Agenda → "Ver las clases en mi calendario"** da un enlace para suscribir
el calendario del iPhone, la Mac o Google Calendar a la agenda.

- Es de un solo sentido: los cambios se hacen en la app y el calendario los
  muestra. Cada cuánto se actualiza lo decide el calendario (de unos minutos a
  unas horas).
- Entran las clases de los últimos 30 días y los próximos 180, de los alumnos
  que no están en pausa, de baja ni son de programación a distancia.
- Las clases a la misma hora van en un solo evento, con el nombre de todos.
- Sin hora cargada, la clase figura como evento de todo el día.
- Cada clase dura una hora; se cambia con la variable `HTC_CLASS_MIN` (minutos).
- El enlace no pide usuario ni clave: el calendario del teléfono no puede
  iniciar sesión. Lo protege una clave larga y al azar dentro del enlace. Si se
  comparte por error, "Generar un enlace nuevo" anula el anterior.

Rutas: `GET /api/training/calendar-link`, `POST /api/training/calendar-link/reset`
(profe) y `GET /api/calendar/<clave>.ics` (sin login). Código en
`src/training/calendar.ts` y `src/api/router-calendar.ts`.

Con el plan gratuito de Render el servidor se duerme si nadie lo usa; el
primer pedido del calendario lo despierta y puede fallar por demora. El
calendario vuelve a intentar en su próxima actualización.

## Presente guarda la sesión

Si Nico marca **presente** a un alumno un día que ya pasó (o hoy) y ese día no
tiene sesión cargada, la app la guarda sola para que la clase no se pierda:

- si tenía una rutina **asignada** para ese día, pasa a hecha;
- si no, se guarda una **copia de su sesión anterior** (mismo título y rutina);
- si nunca tuvo una sesión, se guarda una vacía para que la clase figure.

Los compañeros de una clase compartida quedan en la misma sesión nueva. En el
Historial la sesión lleva el aviso "Se guardó sola al marcar presente: igual a
la del 13 nov. Editala si cambió algo".

- **Sacar el presente** (o pasarlo a ausente o "ejercicios") la deshace, salvo
  que alguien la haya tocado: si Nico la editó o corrigió lo realizado, o el
  alumno la respondió, queda.
- **Cargar la sesión después** desde Planificar ("Registrar") o pegando texto la
  reemplaza: no queda repetida.
- **Días que todavía no pasaron:** no se puede marcar presente ni "ejercicios"
  (sí ausente, si avisó).

**"Sumar a alguien a este día"** (Hoy → Agenda) le agenda una clase puntual ese
día, con la hora que se elija (sugiere la de su horario de siempre), sin
marcarle nada: aparece en la lista con Presente, Ausente y Ejercicios para
marcar cuando corresponda. Una clase puntual se muestra aunque el alumno esté
en pausa.

Los presentes que ya estaban marcados antes de este cambio no generan sesiones
solos: para guardar una, se saca y se vuelve a marcar el presente.

Código: `src/training/autosession.ts` (columna `auto_from` en
`training_sessions`, migración 011) y pruebas en
`src/__tests__/auto_sessions.test.ts`.

## Copia de seguridad

**Más → Copia de seguridad** descarga todo lo cargado, para guardarlo fuera de
la app (Drive, iCloud, la compu):

- **Copia completa** (`htc-copia-AAAA-MM-DD.json`): alumnos (sin contraseñas),
  sesiones con su rutina, asistencia, pagos, períodos, informes, lo realizado,
  respuestas, calidad del movimiento, biblioteca de ejercicios y registro de
  cambios. Es la que sirve para recuperar todo.
- **Rutinas para leer** (`htc-rutinas-AAAA-MM-DD.txt`): las rutinas de cada
  alumno con el formato de siempre, de la más nueva a la más vieja, para
  abrirlas sin la app.

La pantalla muestra cuándo se descargó la última copia. Rutas:
`GET /api/training/backup` y `GET /api/training/backup/last` (profe).


### Copia automática por mail (los viernes)

El servidor manda solo, todos los viernes desde las 8 (hora de Buenos Aires),
un mail con la copia completa (`htc-copia-AAAA-MM-DD.json.gz`) y las rutinas en
texto (`htc-rutinas-AAAA-MM-DD.txt`). Si el viernes no pudo, lo reintenta cada
media hora hasta el domingo. Manda una sola por semana.

Se activa con variables de entorno en Render (servicio `htc-platform` →
Environment):

| Variable | Qué va |
|---|---|
| `HTC_SMTP_USER` | la cuenta de Gmail que manda el mail |
| `HTC_SMTP_PASS` | una **contraseña de aplicación** de esa cuenta (no la normal) |
| `HTC_BACKUP_TO` | opcional: a quién se manda (por defecto, a la misma cuenta) |
| `HTC_SMTP_HOST` / `HTC_SMTP_PORT` | opcional: otro servidor de mail (por defecto smtp.gmail.com, 465) |

La contraseña de aplicación se crea en la cuenta de Google → Seguridad →
Verificación en 2 pasos (tiene que estar activada) → Contraseñas de
aplicaciones. Sin `HTC_SMTP_USER` y `HTC_SMTP_PASS` no se manda nada y la app lo
dice en Más → Copia de seguridad, donde también está "Mandar una ahora" para
probar. El servidor tiene que estar prendido (instancia paga de Render): en la
gratuita se duerme y además no deja mandar mails.

Código: `src/training/backup.ts`; pruebas en `src/__tests__/backup.test.ts`.
