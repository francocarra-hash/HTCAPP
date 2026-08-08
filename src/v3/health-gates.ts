/**
 * HTC v3 — Health Gates (C-1: capa transversal, NO dominio).
 *
 * STOP gates  → bloquean la evaluación y derivan a médico.
 * ALERT flags → la evaluación continúa, marcada para revisión del coach.
 *
 * Consume únicamente información clínica. Nunca deriva de rendimiento.
 */
import { z } from 'zod';
import { HealthGateResult, HealthGatesInputSchema, MissingCanonicalV3Error } from './models';
import { CompiledV3 } from './canonical';

/** Fuente única: el schema canónico de models.ts (sin duplicar la forma). */
export type HealthInputV3 = z.infer<typeof HealthGatesInputSchema>;

function compare(op: string, value: number, threshold: number): boolean {
  switch (op) {
    case '>=': return value >= threshold;
    case '>': return value > threshold;
    case '<=': return value <= threshold;
    case '<': return value < threshold;
    default: throw new MissingCanonicalV3Error(`Operador de gate desconocido: ${op}`);
  }
}

export function runHealthGates(compiled: CompiledV3, input: HealthInputV3): HealthGateResult {
  const triggered: HealthGateResult['triggered_stop_gates'] = [];
  const flags: HealthGateResult['alert_flags'] = [];
  const redFlagsPresent: HealthGateResult['red_flags_present'] = [];
  const reasonIds: string[] = [];

  // ── STOP gates declarados en el Canonical ────────────────────────────────
  for (const gate of compiled.raw.stopGates) {
    let hit = false;
    switch (gate.input) {
      case 'parq_positive':
        hit = input.parq_positive === true;
        break;
      case 'systolic_bp':
        hit = input.systolic_bp != null && gate.operator != null && gate.threshold != null
          && compare(gate.operator, input.systolic_bp, gate.threshold);
        break;
      case 'diastolic_bp':
        hit = input.diastolic_bp != null && gate.operator != null && gate.threshold != null
          && compare(gate.operator, input.diastolic_bp, gate.threshold);
        break;
      case 'symptom':
        hit = gate.symptom_id === 'chest_pain' && input.chest_pain === true;
        break;
      default:
        throw new MissingCanonicalV3Error(`Gate ${gate.gate_id} declara un input desconocido: ${gate.input}`);
    }
    if (hit) {
      triggered.push({ gate_id: gate.gate_id, name: gate.name, reason_id: gate.reason_id });
      if (!reasonIds.includes(gate.reason_id)) reasonIds.push(gate.reason_id);
    }
  }

  // ── Red flags clínicas declaradas por el coach ───────────────────────────
  for (const id of input.red_flags) {
    const rf = compiled.redFlagById.get(id);
    if (!rf) {
      throw new MissingCanonicalV3Error(
        `Red flag "${id}" no existe en canonical-v3/health_gates.yaml. ` +
        `Válidas: ${[...compiled.redFlagById.keys()].join(', ')}.`,
      );
    }
    // Severidad efectiva: las red flags condicionales bajan de STOP a ALERT
    // cuando el evento quedó fuera de su ventana temporal
    // (CLINICAL_CONFIRMATIONS #3: agudo/reciente = STOP, crónico estable = ALERT).
    let severity = rf.severity;
    let label = rf.label.es;
    let downgradedFrom: string | undefined;

    const weeks = input.red_flag_weeks_since?.[id];
    if (rf.conditional?.window_weeks != null && weeks != null) {
      if (weeks >= rf.conditional.window_weeks) {
        // Fuera de la ventana: evento crónico/recuperado.
        severity = rf.conditional.outside_window ?? severity;
        downgradedFrom = rf.id;
        // Si el Canonical declara una contraparte crónica, se usa su etiqueta.
        const outsideId = rf.conditional.outside_window_flag_id;
        const outside = outsideId ? compiled.redFlagById.get(outsideId) : undefined;
        if (outside) label = outside.label.es;
      } else {
        severity = rf.conditional.within_window ?? severity;
      }
    }

    redFlagsPresent.push({ id: rf.id, severity, label, ...(downgradedFrom ? { downgraded_by_window: true } : {}) });
    if (severity === 'STOP') {
      triggered.push({ gate_id: rf.id, name: label, reason_id: 'REASON_V3_GATE_RED_FLAG' });
      if (!reasonIds.includes('REASON_V3_GATE_RED_FLAG')) reasonIds.push('REASON_V3_GATE_RED_FLAG');
    } else {
      flags.push({ flag_id: rf.id, name: label, severity: 'ALERT', reason_id: 'REASON_V3_FLAG_RED_FLAG' });
      if (!reasonIds.includes('REASON_V3_FLAG_RED_FLAG')) reasonIds.push('REASON_V3_FLAG_RED_FLAG');
    }
  }

  // ── ALERT flags declarados en el Canonical ───────────────────────────────
  for (const flag of compiled.raw.alertFlags) {
    if (flag.input !== 'current_pain_level') {
      throw new MissingCanonicalV3Error(`Alert flag ${flag.flag_id} declara un input no soportado: ${flag.input}`);
    }
    const pain = input.current_pain_level;
    if (pain == null) continue;
    let hit = false;
    if (flag.operator === 'range' && flag.range) {
      hit = pain >= flag.range[0] && pain <= flag.range[1];
    } else if (flag.threshold != null) {
      hit = compare(flag.operator, pain, flag.threshold);
    }
    if (hit) {
      flags.push({ flag_id: flag.flag_id, name: flag.name, severity: flag.severity, reason_id: flag.reason_id });
      if (!reasonIds.includes(flag.reason_id)) reasonIds.push(flag.reason_id);
    }
  }

  const blocked = triggered.length > 0;
  if (!blocked && flags.length === 0) reasonIds.push('REASON_V3_HEALTH_PASS');

  return {
    status: blocked ? 'BLOCKED' : flags.length > 0 ? 'FLAGGED' : 'PASS',
    triggered_stop_gates: triggered,
    alert_flags: flags,
    red_flags_present: redFlagsPresent,
    action: blocked ? 'MEDICAL_REFERRAL' : 'PROCEED',
    reason_ids: reasonIds,
  };
}
