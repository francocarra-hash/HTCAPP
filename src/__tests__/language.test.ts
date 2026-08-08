import { resolveLabel, resolveReason } from '../resolvers/language-resolver';
import { buildClientReport } from '../report/client-report';
import { runPipeline } from '../pipeline';
import { compiled, input } from './helpers';
import { MissingCanonicalError } from '../models/canonical';

describe('Language Resolver — IDs to text, never generated in code', () => {
  test('resolves coach reason in Spanish', () => {
    const t = resolveReason(compiled(), 'REASON_PATHWAY_MOVE', 'COACH', 'es');
    expect(t).toContain('Mobility');
  });

  test('resolves client reason in English', () => {
    const t = resolveReason(compiled(), 'REASON_PATHWAY_MOVE', 'CLIENT', 'en');
    expect(t).toContain('Move');
  });

  test('coach and client audiences get different texts', () => {
    const coach = resolveReason(compiled(), 'REASON_HEALTH_OVERRIDE', 'COACH', 'es');
    const client = resolveReason(compiled(), 'REASON_HEALTH_OVERRIDE', 'CLIENT', 'es');
    expect(coach).not.toBe(client);
  });

  test('unknown reason id FAILS LOUDLY', () => {
    expect(() => resolveReason(compiled(), 'REASON_DOES_NOT_EXIST', 'COACH', 'es')).toThrow(MissingCanonicalError);
  });

  test('resolves classification and pathway labels in both languages', () => {
    expect(resolveLabel(compiled(), 'classifications', 'EMERGING', 'es')).toContain('desarrollo');
    expect(resolveLabel(compiled(), 'pathways', 'BUILD', 'en')).toContain('Build');
    expect(resolveLabel(compiled(), 'roles', 'MAINTAIN', 'es')).toContain('Mantener');
  });

  test('decision reasoning_text renders every reasoning_id', () => {
    const d = runPipeline(compiled(), input({
      test_results: [{ test_id: 'TEST_AROM_PROM_RATIO', value: 76, valid: true, confidence: 'HIGH' }],
    }));
    expect(d.reasoning_text).toHaveLength(d.reasoning_ids.length);
    expect(d.reasoning_text.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
  });
});

describe('Client Report — Platform Data §30.2 sections', () => {
  const decision = () => runPipeline(compiled(), input({
    test_results: [
      { test_id: 'TEST_AROM_PROM_RATIO', value: 76, valid: true, confidence: 'HIGH' },
      { test_id: 'TEST_FRONT_PLANK', value: 90, valid: true, confidence: 'HIGH' },
    ],
  }));

  test('report contains the 9 required sections in order', () => {
    const rep = buildClientReport(compiled(), decision(), 'es');
    expect(rep.sections.map((s) => s.id)).toEqual([
      'CURRENT_PROFILE', 'PRIMARY_PRIORITY', 'WHY_IT_MATTERS', 'WHAT_IT_LIMITS',
      'WHAT_WILL_BE_TRAINED', 'MAINTAINED', 'SUCCESS_CRITERIA', 'REASSESSMENT', 'PROGRESS',
    ]);
  });

  test('primary priority section names the P1 capacity', () => {
    const rep = buildClientReport(compiled(), decision(), 'es');
    const primary = rep.sections.find((s) => s.id === 'PRIMARY_PRIORITY')!;
    expect(primary.content[0]).toBe('Workspace Ownership');
  });

  test('report renders in English with English titles', () => {
    const rep = buildClientReport(compiled(), decision(), 'en');
    expect(rep.sections.find((s) => s.id === 'PRIMARY_PRIORITY')!.title).toBe('Your Primary Priority');
  });

  test('maintained section lists Functional+ capacities', () => {
    const rep = buildClientReport(compiled(), decision(), 'es');
    const maintained = rep.sections.find((s) => s.id === 'MAINTAINED')!;
    expect(maintained.content).toContain('Stability');
  });

  test('reassessment section shows the canonical 6-week window', () => {
    const rep = buildClientReport(compiled(), decision(), 'es');
    const reassess = rep.sections.find((s) => s.id === 'REASSESSMENT')!;
    expect(reassess.content[0]).toContain('6 semanas');
  });
});
