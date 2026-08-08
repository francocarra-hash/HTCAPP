/**
 * Demo — Decision Graph worked example (Node 21):
 * Hip Workspace Ownership 76% AROM/PROM → CRITICAL → P1 → Pathway MOVE.
 */
import * as path from 'path';
import { loadCanonical } from '../canonical/loader';
import { compileCanonical } from '../canonical/compiler';
import { runPipeline } from '../pipeline';

const { canonical } = loadCanonical(path.join(__dirname, '..', '..', 'canonical'));
const compiled = compileCanonical(canonical);

const decision = runPipeline(compiled, {
  client: { name: 'Caso Move (ejemplo Decision Graph)', age: 32, sex: 'MALE' },
  clinical: { events: [] },
  test_results: [
    { test_id: 'TEST_AROM_PROM_RATIO', value: 76, valid: true, confidence: 'HIGH' },
    { test_id: 'TEST_FRONT_PLANK', value: 90, valid: true, confidence: 'HIGH' },
    { test_id: 'TEST_DEAD_HANG', value: 45, valid: true, confidence: 'HIGH' },
  ],
  language: 'es',
  audience: 'COACH',
});

console.log('P1        :', decision.primary_system_bottleneck.capacity_id);
console.log('Pathway   :', decision.pathway);
console.log('Estrategia:', decision.strategy);
console.log('Confianza :', decision.system_confidence);
console.log('Reevaluar :', decision.reassessment.weeks, 'semanas —', decision.reassessment.exit_criteria);
console.log('\nRazonamiento:');
for (const t of decision.reasoning_text) console.log(' •', t);
const expected = decision.primary_system_bottleneck.capacity_id === 'CAP_WORKSPACE_OWNERSHIP' && decision.pathway === 'MOVE';
console.log(expected ? '\n✓ MATCH (esperado: CAP_WORKSPACE_OWNERSHIP / MOVE)' : '\n✗ NO MATCH');
process.exitCode = expected ? 0 : 1;
