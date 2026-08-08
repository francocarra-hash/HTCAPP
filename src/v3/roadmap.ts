/**
 * HTC v3 — Development Priority Assignment Engine.
 * Fuente: HTC_DEVELOPMENT_PRIORITY_ASSIGNMENT_ENGINE_v1.0.md
 *
 * Classification → Development Role (P1/P2/Support/Maintain/…) + volumen +
 * constraints de Movement + arquitectura de sesión.
 *
 * Los porcentajes salen del Canonical (DECISION TABLE, la única fuente que
 * satisface la Validation Rule 1 "volume must sum to 100%"). El pseudocódigo
 * del documento usa otros valores y no suma 100 — ver OBS-2.
 */
import {
  Classification, CLASSIFICATION_CODE, DevelopmentRole, DomainKey, DomainResult,
  MissingCanonicalV3Error, MovementResult, ProgrammingConstraint, RoadmapAssignment,
  RoadmapResult, SessionArchitecture,
} from './models';
import { CompiledV3 } from './canonical';

/** Rankea dominios: peor clasificación primero; empate → impact factor; luego scope. */
export function rankDomains(domains: DomainResult[]): DomainResult[] {
  return [...domains].sort((a, b) => {
    // Rule A — por clasificación (código mayor = peor = primero)
    const byClass = CLASSIFICATION_CODE[b.classification] - CLASSIFICATION_CODE[a.classification];
    if (byClass !== 0) return byClass;
    // Rule B — por impact factor (mayor primero)
    const byImpact = b.impact_factor - a.impact_factor;
    if (byImpact !== 0) return byImpact;
    // Rule C — por scope: menos componentes críticos = intervención más focalizada
    return a.critical_components.length - b.critical_components.length;
  });
}

function constraintsFromMovement(
  compiled: CompiledV3,
  movement: MovementResult | null,
): ProgrammingConstraint[] {
  if (!movement) return [];
  const out: ProgrammingConstraint[] = [];
  const reasonByLevel: Record<string, string> = {
    L2_DC: 'REASON_V3_CONSTRAINT_L2',
    L3_MC: 'REASON_V3_CONSTRAINT_L3',
    L4_MPS: 'REASON_V3_CONSTRAINT_L4',
  };
  for (const def of compiled.raw.movementConstraints) {
    const level = movement.levels.find((l) => l.level_id === def.when_level);
    if (!level) continue;
    if (!def.when_classification.includes(level.classification)) continue;
    const reasonId = reasonByLevel[def.when_level];
    if (!reasonId) {
      throw new MissingCanonicalV3Error(`No hay reason_id mapeado para el constraint de ${def.when_level}`);
    }
    out.push({
      type: def.id,
      description: def.description,
      affected_domains: def.affected_domains,
      mitigation: def.mitigation,
      reason_id: reasonId,
    });
  }
  return out;
}

function focusForMovement(
  compiled: CompiledV3,
  movement: MovementResult | null,
): { focus?: string; duration?: [number, number] } {
  if (!movement || !movement.limited_by) return {};
  const f = compiled.raw.movementP1Focus[movement.limited_by];
  if (!f) return {};
  return { focus: f.focus, duration: f.duration_weeks };
}

export function buildRoadmap(
  compiled: CompiledV3,
  domains: DomainResult[],
  movement: MovementResult | null,
  sessionMinutes?: number,
): RoadmapResult {
  if (domains.length === 0) {
    throw new MissingCanonicalV3Error('No hay dominios clasificados para generar el roadmap.');
  }
  const rules = compiled.raw.assignmentRules;
  const warnings: string[] = [];
  const reasonIds: string[] = [];
  const assignments: RoadmapAssignment[] = [];

  const criticals = domains.filter((d) => d.classification === 'CRITICAL');
  const ranked = rankDomains(domains);
  const mv = focusForMovement(compiled, movement);

  const push = (
    d: DomainResult, role: DevelopmentRole, volume: number, reasonId: string, reason: string,
  ): void => {
    const extra = d.domain === 'MOVEMENT' ? mv : {};
    assignments.push({
      domain: d.domain,
      role,
      volume_percent: volume,
      reason,
      reason_id: reasonId,
      ...(extra.focus ? { specific_focus: extra.focus } : {}),
      ...(extra.duration ? { duration_weeks: extra.duration } : {}),
      ...(d.critical_components.length > 0
        ? { success_criteria: `${d.critical_components.join(', ')} ≥ FUNCTIONAL` }
        : {}),
    });
    if (!reasonIds.includes(reasonId)) reasonIds.push(reasonId);
  };

  let ruleApplied: RoadmapResult['rule_applied'];

  if (criticals.length === 1) {
    // ── RULE 1: un solo dominio CRITICAL ───────────────────────────────────
    ruleApplied = 'RULE_SINGLE_CRITICAL';
    const v = rules.RULE_SINGLE_CRITICAL.volumes;
    const critical = criticals[0]!;
    push(critical, 'P1', v.p1, 'REASON_V3_AUTO_P1',
      `${critical.name} CRITICAL${critical.critical_components.length ? ` (componente: ${critical.critical_components.join(', ')})` : ''} — se resuelve primero`);

    const others = ranked.filter((d) => d.domain !== critical.domain);
    let p2Assigned = false;
    let supportAssigned = false;
    for (const d of others) {
      if (!p2Assigned && d.classification === 'EMERGING') {
        push(d, 'P2', v.p2, 'REASON_V3_ROLE_P2', `${d.name} EMERGING — segundo foco`);
        p2Assigned = true;
      } else if (!supportAssigned) {
        push(d, 'SUPPORT', v.support, 'REASON_V3_ROLE_SUPPORT', `${d.name} ${d.classification} — soporte`);
        supportAssigned = true;
      } else {
        push(d, 'MAINTAIN', v.maintain, 'REASON_V3_ROLE_MAINTAIN', `${d.name} ${d.classification} — mantenimiento`);
      }
    }
  } else if (criticals.length > 1) {
    // ── RULE 2: múltiples CRITICAL ─────────────────────────────────────────
    ruleApplied = 'RULE_MULTIPLE_CRITICAL';
    const v = rules.RULE_MULTIPLE_CRITICAL.volumes;
    const rankedCriticals = rankDomains(criticals);
    reasonIds.push('REASON_V3_MULTIPLE_CRITICAL');

    const primary = rankedCriticals[0]!;
    push(primary, 'P1_PRIMARY', v.p1_primary, 'REASON_V3_AUTO_P1',
      `${primary.name} CRITICAL con mayor impact factor (${primary.impact_factor}) — bottleneck primario`);

    const secondaries = rankedCriticals.slice(1);
    const perSecondary = secondaries.length > 0
      ? Number((v.p1_secondary_total / secondaries.length).toFixed(2))
      : 0;
    for (const d of secondaries) {
      push(d, 'P1_SECONDARY', perSecondary, 'REASON_V3_AUTO_P1',
        `${d.name} CRITICAL — esfuerzo P1 compartido`);
    }

    const remaining = ranked.filter((d) => !criticals.some((c) => c.domain === d.domain));
    remaining.forEach((d, idx) => {
      if (idx === 0) {
        push(d, 'SUPPORT', v.support, 'REASON_V3_ROLE_SUPPORT', `${d.name} ${d.classification} — soporte`);
      } else {
        push(d, 'MAINTAIN', v.maintain, 'REASON_V3_ROLE_MAINTAIN', `${d.name} ${d.classification} — mantenimiento`);
      }
    });
  } else {
    // ── RULE 3: sin CRITICAL ───────────────────────────────────────────────
    ruleApplied = 'RULE_NO_CRITICAL';
    const v = rules.RULE_NO_CRITICAL.volumes;
    reasonIds.push('REASON_V3_NO_CRITICAL');
    const volumes = [v.p2, v.support, v.maintain_first, v.maintain_second];
    const roles: DevelopmentRole[] = ['P2', 'SUPPORT', 'MAINTAIN', 'MAINTAIN'];
    const reasons = ['REASON_V3_ROLE_P2', 'REASON_V3_ROLE_SUPPORT', 'REASON_V3_ROLE_MAINTAIN', 'REASON_V3_ROLE_MAINTAIN'];
    ranked.forEach((d, idx) => {
      const role = roles[Math.min(idx, roles.length - 1)]!;
      const volume = volumes[Math.min(idx, volumes.length - 1)]!;
      const reasonId = reasons[Math.min(idx, reasons.length - 1)]!;
      push(d, role, volume, reasonId,
        idx === 0 ? `${d.name} ${d.classification} — dominio más limitado, foco de desarrollo`
                  : `${d.name} ${d.classification}`);
    });
  }

  // ── Constraints de Movement ────────────────────────────────────────────
  const constraints = constraintsFromMovement(compiled, movement);
  for (const c of constraints) if (!reasonIds.includes(c.reason_id)) reasonIds.push(c.reason_id);

  // Validation Rule 4: Movement CRITICAL exige constraints documentados.
  const movementCritical = domains.some((d) => d.domain === 'MOVEMENT' && d.classification === 'CRITICAL');
  if (movementCritical && constraints.length === 0) {
    throw new MissingCanonicalV3Error(
      'Movement es CRITICAL pero no se documentó ningún constraint (Validation Rule 4). ' +
      'Revisar programming_constraints en movement_standard.yaml.',
    );
  }

  // ── Validación de volumen (Validation Rule 1) ──────────────────────────
  // "Volume always sums to 100%" es una regla dura: no admite 99.99 por
  // redondeo. Se reescala proporcionalmente y el residuo del redondeo se
  // asigna al dominio de mayor volumen (largest remainder), de modo que la
  // suma sea exactamente 100 sin inventar porcentajes.
  const rawTotal = assignments.reduce((acc, a) => acc + a.volume_percent, 0);
  let normalized = false;
  if (Math.abs(rawTotal - 100) > 0.01) {
    const factor = 100 / rawTotal;
    for (const a of assignments) a.volume_percent = Number((a.volume_percent * factor).toFixed(2));
    normalized = true;
    warnings.push(
      `El volumen asignado sumaba ${rawTotal}% (regla ${ruleApplied} sobre ${assignments.length} dominios). ` +
      `Se normalizó a 100% (Validation Rule 1). Ver OBS-2.`,
    );
  }

  // Corrección del residuo en aritmética entera (centésimas): sumar flotantes
  // nunca da 100 exacto (33.33+33.33+33.34). Trabajando en centésimas la
  // invariante "suma == 100%" es exacta y determinista.
  if (assignments.length > 0) {
    const cents = assignments.map((a) => Math.round(a.volume_percent * 100));
    const diff = 10000 - cents.reduce((acc, x) => acc + x, 0);
    if (diff !== 0) {
      let biggest = 0;
      for (let i = 1; i < cents.length; i += 1) if (cents[i]! > cents[biggest]!) biggest = i;
      cents[biggest] = cents[biggest]! + diff;
    }
    assignments.forEach((a, i) => { a.volume_percent = cents[i]! / 100; });
  }

  // Validation Rule 2: a lo sumo un P1_PRIMARY
  if (assignments.filter((a) => a.role === 'P1_PRIMARY').length > 1) {
    throw new MissingCanonicalV3Error('Sólo se permite un P1_PRIMARY (Validation Rule 2).');
  }

  // Validation Rule 3: trabajo activo >= 80%
  const active = assignments
    .filter((a) => a.role !== 'MAINTAIN' && a.role !== 'MONITOR' && a.role !== 'DEFER')
    .reduce((acc, a) => acc + a.volume_percent, 0);
  if (active < 80) warnings.push(`Volumen de trabajo activo bajo: ${active.toFixed(1)}% (< 80%).`);

  // ── Arquitectura de sesión ─────────────────────────────────────────────
  const total = sessionMinutes ?? compiled.raw.sessionDefaultMinutes;
  const session: SessionArchitecture = {
    total_minutes: total,
    breakdown: assignments.map((a) => ({
      domain: a.domain,
      role: a.role,
      minutes: Math.round((total * a.volume_percent) / 100),
    })),
    constraints: constraints.map((c) => c.mitigation),
  };

  return {
    rule_applied: ruleApplied,
    assignments,
    constraints,
    session_architecture: session,
    volume_total: 100,
    volume_normalized: normalized,
    validation_warnings: warnings,
    reason_ids: reasonIds,
  };
}
