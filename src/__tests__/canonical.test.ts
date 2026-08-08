import { loadCanonical } from '../canonical/loader';
import { compileCanonical } from '../canonical/compiler';
import { CANONICAL_DIR, compiled } from './helpers';
import { MissingCanonicalError } from '../models/canonical';

describe('Canonical loader', () => {
  test('loads all canonical files without structural errors', () => {
    const { canonical } = loadCanonical(CANONICAL_DIR);
    expect(canonical.version).toBe('3.1.0');
  });

  test('loads the 5 Operating System domains (approved resolution C2)', () => {
    const c = compiled();
    expect(c.raw.domains.map((d) => d.id).sort()).toEqual([
      'DOMAIN_AEROBIC', 'DOMAIN_GENERAL_HEALTH', 'DOMAIN_MOBILITY', 'DOMAIN_MOVEMENT', 'DOMAIN_STRENGTH',
    ]);
  });

  test('General Health is the only gatekeeper domain', () => {
    const gk = compiled().raw.domains.filter((d) => d.is_gatekeeper);
    expect(gk.map((d) => d.id)).toEqual(['DOMAIN_GENERAL_HEALTH']);
  });

  test('every capacity belongs to a known domain and hierarchy is ordered', () => {
    const c = compiled();
    for (const [domainId, caps] of c.capacitiesByDomain) {
      expect(c.domainById.has(domainId)).toBe(true);
      const levels = caps.map((x) => x.hierarchy_level);
      expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    }
  });

  test('Strength hierarchy follows Master Tables T1 order', () => {
    const caps = compiled().capacitiesByDomain.get('DOMAIN_STRENGTH')!.map((c) => c.id);
    expect(caps).toEqual([
      'CAP_HEALTH_STRENGTH_MARKERS', 'CAP_STABILITY', 'CAP_FORCE_PRODUCTION',
      'CAP_FORCE_ENDURANCE', 'CAP_FORCE_EXPRESSION',
    ]);
  });

  test('Stability carries its own impact factor 2.0 (OS 10.2 TIER 3B)', () => {
    expect(compiled().impactFactorOf('CAP_STABILITY')).toBe(2.0);
  });

  test('capacities without override inherit the domain impact factor', () => {
    expect(compiled().impactFactorOf('CAP_AEROBIC_BASE')).toBe(1.0);
    expect(compiled().impactFactorOf('CAP_WORKSPACE_OWNERSHIP')).toBe(1.8);
  });

  test('all test_capacity_links reference existing tests and capacities', () => {
    const c = compiled();
    for (const l of c.raw.links) {
      expect(c.testById.has(l.test_id)).toBe(true);
      expect(c.capacityById.has(l.capacity_id)).toBe(true);
    }
  });

  test('all standards cite existing references (evidence trail)', () => {
    const c = compiled();
    const refIds = new Set(c.raw.references.map((r) => r.id));
    for (const s of c.raw.standards) {
      for (const ref of s.evidence.based_on) expect(refIds.has(ref)).toBe(true);
    }
  });

  test('dependency chain matches Master Tables T4', () => {
    const c = compiled();
    expect(c.dependsOn.get('CAP_FORCE_PRODUCTION')).toBe('CAP_STABILITY');
    expect(c.dependsOn.get('CAP_WORKSPACE_OWNERSHIP')).toBe('CAP_JOINT_WORKSPACE');
    expect(c.dependsOn.get('CAP_RECOVERY_CAPACITY')).toBe('CAP_THRESHOLD_CAPACITY');
    expect(c.dependsOn.get('CAP_MOTOR_PROBLEM_SOLVING')).toBe('CAP_MOVEMENT_COORDINATION');
  });

  test('safety rule reason IDs all resolve in language mapping (compiler check)', () => {
    const c = compiled();
    for (const r of c.raw.safetyRules) {
      expect(c.raw.languageMapping.reasons[r.reason_id]).toBeDefined();
    }
  });

  test('DRAFT standards produce load warnings', () => {
    const { warnings } = loadCanonical(CANONICAL_DIR);
    expect(warnings.some((w) => w.id === 'STANDARD_ROCKPORT_VO2')).toBe(true);
  });

  test('missing canonical directory fails loudly', () => {
    expect(() => loadCanonical('C:/nonexistent-canonical')).toThrow(MissingCanonicalError);
  });

  test('compiler rejects a canonical with dangling references', () => {
    const { canonical } = loadCanonical(CANONICAL_DIR);
    const broken = {
      ...canonical,
      links: [...canonical.links, { test_id: 'TEST_FAKE', capacity_id: 'CAP_FAKE', verification_status: 'VERIFIED' as const, source: 'x' }],
    };
    expect(() => compileCanonical(broken)).toThrow(MissingCanonicalError);
  });

  test('pathway catalogue is the 5-pathway Operating System model', () => {
    expect(compiled().raw.decisionRules.pathways.values).toEqual(['RESTORE', 'MOVE', 'BUILD', 'PERFORM', 'SUSTAIN']);
  });

  test('priority role catalogue matches Platform Data §19', () => {
    expect(compiled().raw.decisionRules.priority_roles.values).toEqual(
      ['P1', 'P2', 'P3', 'SUPPORT', 'MAINTAIN', 'DEFER', 'MONITOR', 'UNCONFIRMED'],
    );
  });
});
