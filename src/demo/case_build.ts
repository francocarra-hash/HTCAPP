/**
 * Demo — multi-domain scoring (OS 10.3):
 * Stability CRITICAL (10×2.0=20) vs Aerobic Base EMERGING (5×1.0=5)
 * → P1 Stability → Pathway BUILD → estrategia SEQUENTIAL (gap > 10, OS 10.8).
 */
import * as path from 'path';
import { loadCanonical } from '../canonical/loader';
import { compileCanonical } from '../canonical/compiler';
import { runPipeline } from '../pipeline';

const { canonical } = loadCanonical(path.join(__dirname, '..', '..', 'canonical'));
const compiled = compileCanonical(canonical);

const decision = runPipeline(compiled, {
  client: { name: 'Caso Build (scoring multi-dominio)', age: 32, sex: 'MALE' },
  clinical: { events: [] },
  test_results: [
    { test_id: 'TEST_FRONT_PLANK', value: 25, valid: true, confidence: 'HIGH' },
    { test_id: 'TEST_ROCKPORT_WALK', value: 40, valid: true, confidence: 'HIGH' },
  ],
  language: 'es',
  audience: 'COACH',
});

console.log('P1        :', decision.primary_system_bottleneck.capacity_id);
console.log('Pathway   :', decision.pathway);
console.log('Estrategia:', decision.strategy);
console.log('Scores    :', decision.audit_trail.candidate_scores.map((s) => `${s.capacity_id}=${s.score}`).join(', '));
const expected = decision.primary_system_bottleneck.capacity_id === 'CAP_STABILITY' && decision.pathway === 'BUILD' && decision.strategy === 'SEQUENTIAL';
console.log(expected ? '\n✓ MATCH (esperado: CAP_STABILITY / BUILD / SEQUENTIAL)' : '\n✗ NO MATCH');
process.exitCode = expected ? 0 : 1;
