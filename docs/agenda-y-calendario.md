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
