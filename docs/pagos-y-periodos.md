# Pagos y períodos

## Qué cambió

Antes, cada pago traía sus clases: registrar el pago de un paquete sumaba esas
clases al saldo, aunque el paquete ya estuviera contado. Pagar dos veces el
mismo paquete (o pagar el paquete que ya estaba en el saldo inicial) duplicaba
las sesiones.

Ahora hay dos operaciones separadas:

1. **Crear un período** (paquete de clases, mes o programación). Es lo único que
   suma clases. Si el período ya existe (mismo mes, o paquete que arranca el
   mismo día), no se crea otro.
2. **Registrar un pago** de un período. Sólo cambia lo abonado y el saldo de ese
   período. Nunca crea ni cambia sesiones incluidas, realizadas o restantes.

Sumar clases a un período ya creado es explícito ("Cambiar clases o importe") y
queda en el registro de cambios con el motivo.

## Formulario de pago

- **Período que se paga**: sugiere el período pendiente más antiguo y muestra
  mes, importe, pagado y saldo para confirmar. Se puede elegir un período
  anterior (ya pagado) y hacer pagos parciales.
- **Fecha en que recibiste el pago** (`paid_on`): la fecha efectiva.
- **Fecha de registro** (`created_at`): la pone el servidor al guardar.
- Si no hay período pendiente, "Crear período nuevo" abre el formulario del
  período, aparte, con su propio botón.

## Saldo del paquete

`saldo inicial + clases de los períodos − clases tomadas`, contando los
paquetes que arrancan desde `cuenta_desde` y que no estaban ya en el saldo
inicial (`in_opening`).

Un período ya empezado con saldo pendiente (incluido un pago parcial) aparece
como deuda en "Para cobrar".

## Migración 010 y revisión de registros viejos

La migración copia cada pago viejo a un período, 1 a 1, igual que como los
contaba la app: **los saldos no cambian al migrar**. Verificado con una copia de
los datos de producción: 16 saldos de paquete comparados, 0 diferencias.

En Finanzas aparece "Revisar períodos" con los períodos viejos cuyas clases
parecen duplicadas: cuando se registró el pago todavía le quedaban más clases
que una semana de entrenamiento (lo normal es pagar después de la primera clase
del paquete nuevo, con 0 o −1 clases restantes). Para cada uno muestra el
motivo, los pagos con sus fechas, el saldo actual y el corregido, y la
corrección propuesta. Nada cambia hasta confirmar:

- **Corregir (unir)**: el pago pasa al paquete anterior y el período repetido
  se borra. Los pagos y las asistencias quedan.
- **Corregir (saldo inicial)**: el período queda con su pago pero sus clases no
  se suman, porque ya estaban en el saldo inicial.
- **Está bien así**: por ejemplo, un paquete pagado por adelantado.

Todo queda en `training_change_log`.

Con los datos al 13/11/2026 aparecen dos casos:

- **Ari**: pagos del 30/10 y 3/11 de 4 clases con 1 clase por semana. Le
  figuran 5 clases; corregido, 1.
- **Luli**: el saldo inicial (7 al 6/11) ya contaba el paquete en curso y el pago
  del 12/11 sumó 8 más. Le figuran 13; corregido, 5.

## API

- `POST /api/training/charges` crea un período (`409 PERIOD_EXISTS` si ya
  existe).
- `PATCH /api/training/charges/:id` cambia clases o importe, con `reason`.
- `DELETE /api/training/charges/:id` borra un período (sólo si no tiene pagos).
- `GET /api/training/charges/review` lista los registros viejos para revisar.
- `POST /api/training/charges/:id/resolve` recibe
  `{action: 'merge', into} | {action: 'opening'} | {action: 'keep'}`.
- `POST /api/training/payments` registra un pago y requiere `charge_id`. Ignora
  `classes` y `period`.
