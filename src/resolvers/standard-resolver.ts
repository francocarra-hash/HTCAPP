/**
 * Standard Resolver — finds the applicable HTC Standard for a test result and
 * client population. PLACEHOLDER standards fail loudly; missing populations
 * fail loudly. Never invents thresholds.
 */
import { CompiledCanonical } from '../canonical/compiler';
import { MissingCanonicalError, Standard } from '../models/canonical';

export interface ClientPopulation { age: number; sex: 'MALE' | 'FEMALE'; activity_level?: string }

function populationMatches(std: Standard, client: ClientPopulation): boolean {
  const p = std.population;
  if (p == null) return true; // source does not restrict population
  if (p.sex != null && p.sex !== client.sex) return false;
  if (p.age_min != null && client.age < p.age_min) return false;
  if (p.age_max != null && client.age > p.age_max) return false;
  if (p.activity_level != null && p.activity_level !== (client.activity_level ?? null)) return false;
  return true;
}

export function resolveStandard(
  compiled: CompiledCanonical,
  testId: string,
  client: ClientPopulation,
  warnings: string[],
): Standard {
  const candidates = compiled.standardsByTest.get(testId) ?? [];
  if (candidates.length === 0) {
    throw new MissingCanonicalError(
      `No standard exists for test ${testId} in canonical/standards.yaml. Ask HTC for it before classifying this test.`,
    );
  }
  // Prefer the most specific match: population-restricted standards first.
  const matching = candidates
    .filter((s) => populationMatches(s, client))
    .sort((a, b) => Number(b.population != null) - Number(a.population != null));
  const std = matching[0];
  if (!std) {
    throw new MissingCanonicalError(
      `No standard for test ${testId} matches population (age ${client.age}, ${client.sex}` +
      `${client.activity_level ? `, ${client.activity_level}` : ''}). ` +
      `Available: ${candidates.map((s) => s.id).join(', ')}. Ask HTC for the missing population band.`,
    );
  }
  if (std.verification_status === 'PLACEHOLDER') {
    throw new MissingCanonicalError(
      `Standard ${std.id} is PLACEHOLDER (${std.notes ?? 'incomplete thresholds'}) and cannot be used for real decisions.`,
    );
  }
  if (std.verification_status === 'DRAFT') {
    warnings.push(`DRAFT standard used: ${std.id} — pending HTC validation (${std.source}).`);
  }
  return std;
}
