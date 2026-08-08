/**
 * Client Report — simplified output (Platform Data §30.2 required sections).
 * All headings and reason texts come from language_mapping.yaml.
 */
import { CompiledCanonical } from '../canonical/compiler';
import { Decision } from '../models/decision';
import { Language, resolveLabel, resolveReason } from '../resolvers/language-resolver';

export interface ClientReport {
  sections: Array<{ id: string; title: string; content: string[] }>;
}

export function buildClientReport(
  compiled: CompiledCanonical,
  decision: Decision,
  language: Language,
): ClientReport {
  const lm = compiled.raw.languageMapping;
  const title = (id: string): string => {
    const s = lm.client_report_sections.find((x) => x.id === id);
    if (!s) throw new Error(`MISSING CANONICAL: client report section ${id}`);
    return s[language];
  };
  const capName = (id: string): string => compiled.capacityById.get(id)?.name ?? id;

  const profile = decision.capacity_states.map(
    (s) => `${capName(s.capacity_id)}: ${resolveLabel(compiled, 'classifications', s.classification, language)}`,
  );

  const p1 = decision.primary_system_bottleneck;
  const primary = p1.capacity_id ? [capName(p1.capacity_id)] : [];

  const why = decision.reasoning_ids.map((id) => resolveReason(compiled, id, 'CLIENT', language));

  const limits = decision.suggested_relationships
    .filter((r) => r.source_capacity_id === p1.capacity_id)
    .map((r) => capName(r.target_capacity_id));

  const trained = decision.priorities
    .filter((p) => p.role === 'P1' || p.role === 'P2' || p.role === 'P3')
    .map((p) => `${p.role}: ${capName(p.capacity_id)}`);

  const maintained = decision.priorities
    .filter((p) => p.role === 'MAINTAIN')
    .map((p) => capName(p.capacity_id));

  const success = decision.reassessment.exit_criteria ? [decision.reassessment.exit_criteria] : [];
  const reassess = decision.reassessment.weeks != null
    ? [language === 'es' ? `${decision.reassessment.weeks} semanas (o antes si se cumplen los criterios)` : `${decision.reassessment.weeks} weeks (or earlier if criteria are met)`]
    : [];

  return {
    sections: [
      { id: 'CURRENT_PROFILE', title: title('CURRENT_PROFILE'), content: profile },
      { id: 'PRIMARY_PRIORITY', title: title('PRIMARY_PRIORITY'), content: primary },
      { id: 'WHY_IT_MATTERS', title: title('WHY_IT_MATTERS'), content: why },
      { id: 'WHAT_IT_LIMITS', title: title('WHAT_IT_LIMITS'), content: limits },
      { id: 'WHAT_WILL_BE_TRAINED', title: title('WHAT_WILL_BE_TRAINED'), content: trained },
      { id: 'MAINTAINED', title: title('MAINTAINED'), content: maintained },
      { id: 'SUCCESS_CRITERIA', title: title('SUCCESS_CRITERIA'), content: success },
      { id: 'REASSESSMENT', title: title('REASSESSMENT'), content: reassess },
      { id: 'PROGRESS', title: title('PROGRESS'), content: [] },
    ],
  };
}
