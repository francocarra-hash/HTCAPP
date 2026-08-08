/**
 * Verificación del ejemplo "Male 28" de HTC_PLATFORM_CLINICAL_SPECIFICATION_v1.1.
 * Contrasta lo que calcula el motor contra lo que afirma el documento.
 */
import * as path from 'path';
import { loadCanonicalV3, compileCanonicalV3 } from '../v3/canonical';
import { scoreTest } from '../v3/classification';

const c = compileCanonicalV3(loadCanonicalV3(path.join(__dirname, '..', '..', 'canonical-v3')));
const client = { name: 'Male 28', age: 28, sex: 'MALE' as const };

const casos: Array<[string, number, string]> = [
  ['HANDGRIP', 45, '1.67 FUNCTIONAL'],
  ['SIT_TO_STAND_5X', 15, '2.75 FOUNDATION'],
  ['DEAD_HANG', 35, '2.5 FUNCTIONAL'],
  ['WALL_SIT', 45, '1.875 FUNCTIONAL'],
  ['PUSHUP', 18, '1.56 FUNCTIONAL'],
  ['INVERTED_ROW', 12, '1.4 EMERGING'],
];

console.log('EJEMPLO MALE 28 — Clinical Spec v1.1\n');
let sum = 0;
let w = 0;
for (const [key, val, esperado] of casos) {
  const r = scoreTest(c, key, val, client);
  const test = c.testByKey.get(key)!;
  const weight = test.weight ?? 1;
  sum += r.score_0_3 * weight;
  w += weight;
  const ok = esperado.startsWith(r.score_0_3.toFixed(2)) || esperado.includes(r.classification);
  console.log(
    `${key.padEnd(18)} ${String(val).padStart(3)} → ${r.score_0_3.toFixed(4).padStart(7)} ` +
    `${r.classification.padEnd(11)} | spec: ${esperado.padEnd(18)} ${ok ? '' : '  <-- DIFIERE'}`,
  );
}
console.log(`\nPeso total: ${w}  (spec dice 11.5)`);
console.log(`Weighted score: ${(sum / w).toFixed(4)}  (spec dice 1.945 → FUNCTIONAL)`);
