/**
 * Language Resolver — decision logic emits IDs; this module renders them for
 * an audience (COACH/CLIENT) and language (es/en). Missing text fails loudly
 * (Master Instructions: never write reasoning text in code).
 */
import { CompiledCanonical } from '../canonical/compiler';
import { MissingCanonicalError } from '../models/canonical';

export type Audience = 'COACH' | 'CLIENT';
export type Language = 'es' | 'en';

export function resolveReason(
  compiled: CompiledCanonical,
  reasonId: string,
  audience: Audience,
  language: Language,
): string {
  const entry = compiled.raw.languageMapping.reasons[reasonId];
  if (!entry) {
    throw new MissingCanonicalError(
      `Reasoning text for ${reasonId} is missing from canonical/language_mapping.yaml. Ask HTC for it.`,
    );
  }
  const text = entry[audience]?.[language];
  if (!text) {
    throw new MissingCanonicalError(`Reasoning text ${reasonId} missing for audience ${audience} / language ${language}.`);
  }
  return text;
}

export function resolveLabel(
  compiled: CompiledCanonical,
  group: 'classifications' | 'pathways' | 'roles',
  key: string,
  language: Language,
): string {
  const g = compiled.raw.languageMapping.labels[group];
  const entry = g?.[key];
  if (!entry) throw new MissingCanonicalError(`Label ${group}.${key} missing from language_mapping.yaml.`);
  const text = entry[language];
  if (!text) throw new MissingCanonicalError(`Label ${group}.${key} missing language ${language}.`);
  return text;
}
