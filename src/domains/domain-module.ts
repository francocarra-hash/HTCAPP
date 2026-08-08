/**
 * Domain Module — Development Principles §9 ("El código debe ser desacoplado").
 *
 * Each domain behaves as an independent module with its own pipeline:
 *
 *     Assessment → Classification → Decision (domain bottleneck) → Report
 *
 * A domain module never reads another domain's data. Cross-domain work
 * (multi-domain scoring, P1 selection) happens one level up, in the Decision
 * Engine, which consumes the modules' outputs.
 *
 * The module list is derived from the Canonical: adding a domain to
 * domains.yaml creates its module automatically. No domain is hardcoded here.
 */
import { CompiledCanonical } from '../canonical/compiler';
import { AssessmentInput, TestResult } from '../models/assessment';
import { CapacityState, DomainBottleneck } from '../models/decision';
import { runClassification } from '../engines/classification';
import { findDomainBottlenecks } from '../engines/decision';
import { ClientPopulation } from '../resolvers/standard-resolver';
import { resolveLabel, Language } from '../resolvers/language-resolver';

export interface DomainModuleResult {
  domain_id: string;
  domain_name: string;
  /** Tests that belong to this domain and were actually submitted. */
  test_ids: string[];
  capacity_states: CapacityState[];
  bottleneck: DomainBottleneck | null;
  standards_used: Array<{ standard_id: string; version: string; test_id: string; evidence_refs: string[]; verification_status: string }>;
  warnings: string[];
  /** Per-domain summary lines for the coach report. */
  report_lines: string[];
}

/** Domain a test belongs to, resolved through explicit canonical links only. */
export function domainOfTest(compiled: CompiledCanonical, testId: string): string | null {
  const capacityIds = compiled.capacitiesByTest.get(testId) ?? [];
  const first = capacityIds[0];
  if (!first) return null;
  return compiled.capacityById.get(first)?.domain_id ?? null;
}

/** Splits an assessment's results per domain (no cross-domain leakage). */
export function partitionByDomain(
  compiled: CompiledCanonical,
  results: TestResult[],
): Map<string, TestResult[]> {
  const byDomain = new Map<string, TestResult[]>();
  for (const r of results) {
    const domainId = domainOfTest(compiled, r.test_id);
    if (!domainId) continue; // unknown tests fail loudly later in classification
    byDomain.set(domainId, [...(byDomain.get(domainId) ?? []), r]);
  }
  return byDomain;
}

/**
 * Runs one domain's pipeline in isolation.
 * Only receives that domain's test results — it cannot see the others.
 */
export function runDomainModule(
  compiled: CompiledCanonical,
  domainId: string,
  client: ClientPopulation,
  domainResults: TestResult[],
  language: Language = 'es',
): DomainModuleResult {
  const domain = compiled.domainById.get(domainId);
  if (!domain) throw new Error(`MISSING CANONICAL: unknown domain ${domainId}`);

  const classification = runClassification(compiled, client, domainResults);
  const bottlenecks = findDomainBottlenecks(compiled, classification.states);
  const bottleneck = bottlenecks.find((b) => b.domain_id === domainId) ?? null;

  const capName = (id: string): string => compiled.capacityById.get(id)?.name ?? id;
  const report_lines = classification.states.map((s) => {
    const label = resolveLabel(compiled, 'classifications', s.classification, language);
    const flag = s.critical_component_flag ? ' ⚠ componente crítico' : '';
    return `${capName(s.capacity_id)}: ${label}${flag}`;
  });

  return {
    domain_id: domainId,
    domain_name: domain.name,
    test_ids: domainResults.map((r) => r.test_id),
    capacity_states: classification.states,
    bottleneck,
    standards_used: classification.standardsUsed,
    warnings: classification.warnings,
    report_lines,
  };
}

/**
 * Runs every domain module present in the assessment, independently.
 * Returns one result per domain, in canonical assessment order.
 */
export function runAllDomainModules(
  compiled: CompiledCanonical,
  input: AssessmentInput,
): DomainModuleResult[] {
  const client: ClientPopulation = {
    age: input.client.age,
    sex: input.client.sex,
    activity_level: input.client.activity_level,
  };
  const partitioned = partitionByDomain(compiled, input.test_results);

  return [...partitioned.entries()]
    .sort((a, b) => {
      const oa = compiled.domainById.get(a[0])?.assessment_order ?? 99;
      const ob = compiled.domainById.get(b[0])?.assessment_order ?? 99;
      return oa - ob;
    })
    .map(([domainId, results]) => runDomainModule(compiled, domainId, client, results, input.language));
}
