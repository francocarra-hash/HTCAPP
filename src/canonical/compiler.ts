/**
 * Canonical Compiler — cross-validates referential integrity and precomputes
 * indices for the engines. Fails loudly on any dangling reference.
 */
import {
  Canonical, Capacity, Domain, MissingCanonicalError, Standard, TestDef,
} from '../models/canonical';

export interface CompiledCanonical {
  raw: Canonical;
  domainById: Map<string, Domain>;
  capacityById: Map<string, Capacity>;
  testById: Map<string, TestDef>;
  /** Active capacities per domain, sorted by hierarchy_level ascending. */
  capacitiesByDomain: Map<string, Capacity[]>;
  /** capacity ids linked to each test (explicit links only). */
  capacitiesByTest: Map<string, string[]>;
  standardsByTest: Map<string, Standard[]>;
  /** capacity_id -> capacity_id it depends on (hard dependency). */
  dependsOn: Map<string, string>;
  /** source capacity -> influenced target capacities. */
  influencesBySource: Map<string, string[]>;
  /** Effective impact factor per capacity (capacity override or domain factor). */
  impactFactorOf(capacityId: string): number;
  /** Declared weight of a test within a capacity (undefined when not declared). */
  weightOf(testId: string, capacityId: string): number | undefined;
}

export function compileCanonical(canonical: Canonical): CompiledCanonical {
  const domainById = new Map(canonical.domains.map((d) => [d.id, d]));
  const capacityById = new Map(canonical.capacities.map((c) => [c.id, c]));
  const testById = new Map(canonical.tests.map((t) => [t.id, t]));

  // Referential integrity — never trust names, only explicit ids.
  for (const c of canonical.capacities) {
    if (!domainById.has(c.domain_id)) throw new MissingCanonicalError(`capacity ${c.id} references unknown domain ${c.domain_id}`);
    if (c.parent_capacity_id && !capacityById.has(c.parent_capacity_id)) throw new MissingCanonicalError(`capacity ${c.id} references unknown parent ${c.parent_capacity_id}`);
  }
  for (const l of canonical.links) {
    if (!testById.has(l.test_id)) throw new MissingCanonicalError(`test_capacity_link references unknown test ${l.test_id}`);
    if (!capacityById.has(l.capacity_id)) throw new MissingCanonicalError(`test_capacity_link references unknown capacity ${l.capacity_id}`);
  }
  for (const s of canonical.standards) {
    if (!testById.has(s.test_id)) throw new MissingCanonicalError(`standard ${s.id} references unknown test ${s.test_id}`);
    for (const ref of s.evidence.based_on) {
      if (!canonical.references.some((r) => r.id === ref)) {
        throw new MissingCanonicalError(`standard ${s.id} cites unknown reference ${ref}`);
      }
    }
  }
  for (const d of canonical.dependencies) {
    if (!capacityById.has(d.capacity_id) || !capacityById.has(d.depends_on)) {
      throw new MissingCanonicalError(`dependency ${d.capacity_id} -> ${d.depends_on} references unknown capacity`);
    }
  }
  // Every reason_id used by safety rules must exist in language mapping.
  for (const r of canonical.safetyRules) {
    if (!canonical.languageMapping.reasons[r.reason_id]) {
      throw new MissingCanonicalError(`safety rule ${r.id} uses reason ${r.reason_id} missing from language_mapping.yaml`);
    }
  }

  const capacitiesByDomain = new Map<string, Capacity[]>();
  for (const c of canonical.capacities.filter((x) => x.active)) {
    const arr = capacitiesByDomain.get(c.domain_id) ?? [];
    arr.push(c);
    capacitiesByDomain.set(c.domain_id, arr);
  }
  for (const arr of capacitiesByDomain.values()) arr.sort((a, b) => a.hierarchy_level - b.hierarchy_level);

  const capacitiesByTest = new Map<string, string[]>();
  for (const l of canonical.links) {
    const arr = capacitiesByTest.get(l.test_id) ?? [];
    arr.push(l.capacity_id);
    capacitiesByTest.set(l.test_id, arr);
  }

  const standardsByTest = new Map<string, Standard[]>();
  for (const s of canonical.standards) {
    const arr = standardsByTest.get(s.test_id) ?? [];
    arr.push(s);
    standardsByTest.set(s.test_id, arr);
  }

  const dependsOn = new Map(canonical.dependencies.map((d) => [d.capacity_id, d.depends_on]));

  const influencesBySource = new Map<string, string[]>();
  for (const i of canonical.influences) {
    const arr = influencesBySource.get(i.source_capacity_id) ?? [];
    arr.push(i.target_capacity_id);
    influencesBySource.set(i.source_capacity_id, arr);
  }

  return {
    raw: canonical,
    domainById,
    capacityById,
    testById,
    capacitiesByDomain,
    capacitiesByTest,
    standardsByTest,
    dependsOn,
    influencesBySource,
    weightOf(testId: string, capacityId: string): number | undefined {
      return canonical.links.find((l) => l.test_id === testId && l.capacity_id === capacityId)?.weight;
    },
    impactFactorOf(capacityId: string): number {
      const cap = capacityById.get(capacityId);
      if (!cap) throw new MissingCanonicalError(`impactFactorOf: unknown capacity ${capacityId}`);
      if (cap.impact_factor !== undefined) return cap.impact_factor;
      const domain = domainById.get(cap.domain_id);
      if (!domain) throw new MissingCanonicalError(`impactFactorOf: unknown domain ${cap.domain_id}`);
      return domain.impact_factor;
    },
  };
}
