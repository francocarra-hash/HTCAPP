/**
 * Canonical Loader — reads canonical/*.yaml, validates every entry, fails
 * loudly on structural errors. DRAFT entries produce warnings; PLACEHOLDER
 * entries load but the engines refuse to use them for real decisions.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import {
  AggregationConfigSchema, Canonical, CapacitySchema, ComponentVersionsSchema, DomainSchema,
  DecisionRulesSchema, DependencySchema, CrossDomainInfluenceSchema, FlagRuleSchema,
  MissingCanonicalError, ReasonEntrySchema, ReassessmentWindowSchema, RedFlagSchema,
  ReferenceSchema, SafetyRuleSchema, StandardSchema, TestCapacityLinkSchema, TestSchema,
  VitalSignGateSchema,
} from '../models/canonical';

export interface LoadWarning { file: string; id: string; message: string }

function readYaml(dir: string, file: string): unknown {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) {
    throw new MissingCanonicalError(`${file} not found in ${dir}. Canonical is incomplete; ask HTC for it.`);
  }
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

function validateArray<T>(schema: z.ZodType<T>, items: unknown[], file: string): T[] {
  return items.map((item, i) => {
    const res = schema.safeParse(item);
    if (!res.success) {
      throw new MissingCanonicalError(
        `${file} entry #${i} failed validation: ${res.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`,
      );
    }
    return res.data;
  });
}

export function loadCanonical(dir: string): { canonical: Canonical; warnings: LoadWarning[] } {
  const warnings: LoadWarning[] = [];

  const index = readYaml(dir, 'index.yaml') as {
    system?: { canonical_version?: string };
    component_versions?: unknown;
  };
  const version = index?.system?.canonical_version;
  if (!version) throw new MissingCanonicalError('index.yaml missing system.canonical_version');

  // Principio 6: the five component versions must exist to freeze an assessment.
  const cvRes = ComponentVersionsSchema.safeParse(index?.component_versions);
  if (!cvRes.success) {
    throw new MissingCanonicalError(
      `index.yaml component_versions invalid or missing (Development Principles §6): ` +
      cvRes.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '),
    );
  }

  const domainsRaw = (readYaml(dir, 'domains.yaml') as { domains?: unknown[] })?.domains ?? [];
  const capacitiesRaw = (readYaml(dir, 'capacities.yaml') as { capacities?: unknown[] })?.capacities ?? [];
  const testsRaw = (readYaml(dir, 'tests.yaml') as { tests?: unknown[] })?.tests ?? [];
  const linksRaw = (readYaml(dir, 'test_capacity_links.yaml') as { test_capacity_links?: unknown[] })?.test_capacity_links ?? [];
  const standardsRaw = (readYaml(dir, 'standards.yaml') as { standards?: unknown[] })?.standards ?? [];
  const relationships = readYaml(dir, 'relationships.yaml') as {
    dependencies?: unknown[]; cross_domain_influences?: unknown[];
  };
  const decisionRulesRaw = readYaml(dir, 'decision_rules.yaml') as Record<string, unknown>;
  const safetyFile = readYaml(dir, 'safety_rules.yaml') as {
    safety_rules?: unknown[];
    red_flags?: Record<string, unknown>;
    vital_sign_gates?: unknown[];
    flag_rules?: unknown[];
  };
  const safetyRaw = safetyFile?.safety_rules ?? [];

  // Red flags arrive grouped (medical / contraindications / screening) plus
  // metadata keys; flatten only the array groups.
  const redFlagsRaw: unknown[] = Object.entries(safetyFile?.red_flags ?? {})
    .filter(([, v]) => Array.isArray(v))
    .flatMap(([, v]) => v as unknown[]);
  const criteriaRaw = readYaml(dir, 'criteria.yaml') as { reassessment_windows?: unknown[] };
  const langRaw = readYaml(dir, 'language_mapping.yaml') as Canonical['languageMapping'] & { reasons: Record<string, unknown> };
  const referencesRaw = (readYaml(dir, 'references.yaml') as { references?: unknown[] })?.references ?? [];

  const canonical: Canonical = {
    version,
    componentVersions: cvRes.data,
    aggregation: (() => {
      const res = AggregationConfigSchema.safeParse(decisionRulesRaw?.aggregation);
      if (!res.success) {
        throw new MissingCanonicalError(
          `decision_rules.yaml aggregation config invalid: ${res.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`,
        );
      }
      return res.data;
    })(),
    redFlags: validateArray(RedFlagSchema, redFlagsRaw, 'safety_rules.yaml (red_flags)'),
    vitalSignGates: validateArray(VitalSignGateSchema, safetyFile?.vital_sign_gates ?? [], 'safety_rules.yaml (vital_sign_gates)'),
    flagRules: validateArray(FlagRuleSchema, safetyFile?.flag_rules ?? [], 'safety_rules.yaml (flag_rules)'),
    domains: validateArray(DomainSchema, domainsRaw, 'domains.yaml'),
    capacities: validateArray(CapacitySchema, capacitiesRaw, 'capacities.yaml'),
    tests: validateArray(TestSchema, testsRaw, 'tests.yaml'),
    links: validateArray(TestCapacityLinkSchema, linksRaw, 'test_capacity_links.yaml'),
    standards: validateArray(StandardSchema, standardsRaw, 'standards.yaml'),
    dependencies: validateArray(DependencySchema, relationships?.dependencies ?? [], 'relationships.yaml'),
    influences: validateArray(CrossDomainInfluenceSchema, relationships?.cross_domain_influences ?? [], 'relationships.yaml'),
    decisionRules: (() => {
      const res = DecisionRulesSchema.safeParse(decisionRulesRaw);
      if (!res.success) {
        throw new MissingCanonicalError(`decision_rules.yaml failed validation: ${res.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
      }
      return res.data;
    })(),
    safetyRules: validateArray(SafetyRuleSchema, safetyRaw, 'safety_rules.yaml').sort((a, b) => a.priority - b.priority),
    reassessmentWindows: validateArray(ReassessmentWindowSchema, criteriaRaw?.reassessment_windows ?? [], 'criteria.yaml'),
    languageMapping: {
      default_language: langRaw.default_language,
      languages: langRaw.languages,
      audiences: langRaw.audiences,
      labels: langRaw.labels as Canonical['languageMapping']['labels'],
      reasons: Object.fromEntries(
        Object.entries(langRaw.reasons ?? {}).map(([id, entry]) => {
          const res = ReasonEntrySchema.safeParse(entry);
          if (!res.success) throw new MissingCanonicalError(`language_mapping.yaml reason ${id} invalid: ${res.error.message}`);
          return [id, res.data];
        }),
      ),
      client_report_sections: langRaw.client_report_sections,
    },
    references: validateArray(ReferenceSchema, referencesRaw, 'references.yaml'),
  };

  for (const s of canonical.standards) {
    if (s.verification_status === 'DRAFT') {
      warnings.push({ file: 'standards.yaml', id: s.id, message: 'DRAFT standard: usable but pending HTC validation.' });
    }
    if (s.verification_status === 'PLACEHOLDER') {
      warnings.push({ file: 'standards.yaml', id: s.id, message: 'PLACEHOLDER standard: engines will refuse to use it.' });
    }
  }
  if (canonical.aggregation.test_to_capacity.verification_status === 'DRAFT') {
    warnings.push({
      file: 'decision_rules.yaml',
      id: 'aggregation.test_to_capacity',
      message: `DRAFT aggregation strategy in force: ${canonical.aggregation.test_to_capacity.strategy}` +
        ` / critical_component=${canonical.aggregation.test_to_capacity.critical_component} — pending C-2/C-3 resolution.`,
    });
  }
  return { canonical, warnings };
}
