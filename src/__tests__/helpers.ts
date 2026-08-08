import * as path from 'path';
import { loadCanonical } from '../canonical/loader';
import { compileCanonical, CompiledCanonical } from '../canonical/compiler';
import { AssessmentInput } from '../models/assessment';

export const CANONICAL_DIR = path.join(__dirname, '..', '..', 'canonical');

let cached: CompiledCanonical | null = null;
export function compiled(): CompiledCanonical {
  if (!cached) {
    const { canonical } = loadCanonical(CANONICAL_DIR);
    cached = compileCanonical(canonical);
  }
  return cached;
}

export function baseClient(over: Partial<AssessmentInput['client']> = {}): AssessmentInput['client'] {
  return { name: 'Test Client', age: 32, sex: 'MALE', ...over };
}

export function input(partial: Partial<AssessmentInput> & Pick<AssessmentInput, 'test_results'>): AssessmentInput {
  return {
    client: baseClient(),
    clinical: { events: [] },
    language: 'es',
    audience: 'COACH',
    ...partial,
  } as AssessmentInput;
}
