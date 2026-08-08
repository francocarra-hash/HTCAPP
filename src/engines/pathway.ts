/**
 * Pathway Engine — Node 13 (Decision Graph) / Platform Data §23 / OS cap.2.
 * Pathway derives from the P1 domain; Perform/Sustain from goal when no
 * dominant bottleneck exists.
 */
import { CompiledCanonical } from '../canonical/compiler';
import { MissingCanonicalError, Pathway } from '../models/canonical';
import { DecisionOutput } from './decision';
import { AssessmentInput } from '../models/assessment';

export function assignPathway(
  compiled: CompiledCanonical,
  input: AssessmentInput,
  decision: DecisionOutput,
): { pathway: Pathway | null; reason_id: string } {
  const primary = decision.primary;

  if (primary.status === 'UNCONFIRMED' || primary.status === 'BLOCKED') {
    // No definitive P1 → no definitive pathway (Assessment-Required).
    return { pathway: null, reason_id: 'REASON_STRATEGY_ASSESSMENT_REQUIRED' };
  }

  if (primary.status === 'CONFIRMED' && primary.domain_id) {
    switch (primary.domain_id) {
      case 'DOMAIN_GENERAL_HEALTH':
        return { pathway: 'RESTORE', reason_id: 'REASON_PATHWAY_RESTORE' };
      case 'DOMAIN_MOBILITY':
        return { pathway: 'MOVE', reason_id: 'REASON_PATHWAY_MOVE' };
      case 'DOMAIN_STRENGTH':
      case 'DOMAIN_AEROBIC':
        return { pathway: 'BUILD', reason_id: 'REASON_PATHWAY_BUILD' };
      case 'DOMAIN_MOVEMENT':
        // DRAFT rule (decision_rules.yaml movement_p1_pathway_rule):
        // Decision Graph Node 20 — Movement may be "P1 within Build".
        return { pathway: 'BUILD', reason_id: 'REASON_PATHWAY_BUILD' };
      default:
        throw new MissingCanonicalError(`No pathway rule exists for P1 domain ${primary.domain_id}.`);
    }
  }

  // No dominant bottleneck (primary.status === 'NONE'):
  if (input.client.primary_goal === 'PERFORMANCE') {
    return { pathway: 'PERFORM', reason_id: 'REASON_PATHWAY_PERFORM' };
  }
  if (input.client.primary_goal === 'LONG_TERM_MAINTENANCE') {
    return { pathway: 'SUSTAIN', reason_id: 'REASON_PATHWAY_SUSTAIN' };
  }
  throw new MissingCanonicalError(
    'No pathway rule covers "no dominant bottleneck" without a PERFORMANCE or ' +
    'LONG_TERM_MAINTENANCE goal (Decision Graph Node 13 defines only those two). ' +
    'Set client.primary_goal or ask HTC for the missing rule.',
  );
}
