/**
 * BLOCK_2 Canonical schema — 15-file structure defined by
 * BLOCK_2_CANONICAL_YAML_SCHEMA.md (Magnetia, 2026-07-21).
 *
 * This module implements the CONTAINER, not the content: it knows which files
 * must exist, the common header every file carries, the declared dependency
 * graph, and the compilation checklist. It contains no HTC knowledge.
 *
 * Purpose: be ready the day Magnetia delivers the populated files. Until then
 * `inspectBlock2Canonical()` reports exactly what is missing, so the gap is
 * measurable instead of assumed.
 *
 * Status of the real data: NOT POPULATED (BLOCK_2 "Next Steps: Populate each
 * YAML file with complete data from OS v3.0"; FINAL_SUMMARY checklist
 * "15 YAML files creados (pending población)").
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

/** The 15 canonical files, in the order declared by BLOCK_2. */
export const BLOCK2_FILES = [
  'domains.yaml',
  'capacities.yaml',
  'tests.yaml',
  'standards.yaml',
  'classification-rules.yaml',
  'aggregation-rules.yaml',
  'decision-rules.yaml',
  'pathways.yaml',
  'protocols.yaml',
  'variables.yaml',
  'metrics.yaml',
  'safety-rules.yaml',
  'translations-es.yaml',
  'report-copy.yaml',
  'assessment-version-snapshot.yaml',
] as const;
export type Block2File = (typeof BLOCK2_FILES)[number];

/** Common header required on every file (BLOCK_2 "STANDARD STRUCTURE"). */
export const Block2HeaderSchema = z.object({
  version: z.string(),
  last_updated: z.string(),
  effective_date: z.string(),
  source_document: z.string(),
  canonical: z.boolean(),
  metadata: z.object({
    description: z.string().optional(),
    rationale: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    linked_documents: z.array(z.string()).optional(),
  }).optional(),
});
export type Block2Header = z.infer<typeof Block2HeaderSchema>;

/** Root key each file must expose, per BLOCK_2 "Content structure". */
export const BLOCK2_ROOT_KEYS: Record<Block2File, string> = {
  'domains.yaml': 'domains',
  'capacities.yaml': 'capacities',
  'tests.yaml': 'tests',
  'standards.yaml': 'standards',
  'classification-rules.yaml': 'rules',
  'aggregation-rules.yaml': 'domains',
  'decision-rules.yaml': 'rules',
  'pathways.yaml': 'pathways',
  'protocols.yaml': 'protocols',
  'variables.yaml': 'variables',
  'metrics.yaml': 'metrics',
  'safety-rules.yaml': 'safety_gates',
  'translations-es.yaml': 'translations',
  'report-copy.yaml': 'templates',
  'assessment-version-snapshot.yaml': 'assessment_metadata',
};

/** Dependency graph declared in BLOCK_2 "Dependencies & Cross-References". */
export const BLOCK2_DEPENDENCIES: Partial<Record<Block2File, Block2File[]>> = {
  'domains.yaml': ['capacities.yaml', 'aggregation-rules.yaml'],
  'capacities.yaml': ['tests.yaml'],
  'tests.yaml': ['protocols.yaml', 'variables.yaml', 'metrics.yaml', 'standards.yaml'],
  'classification-rules.yaml': ['standards.yaml', 'aggregation-rules.yaml'],
  'decision-rules.yaml': ['pathways.yaml'],
};

export interface Block2FileStatus {
  file: Block2File;
  present: boolean;
  headerValid: boolean;
  rootKeyPresent: boolean;
  entryCount: number | null;
  issues: string[];
}

export interface Block2Report {
  directory: string;
  populated: boolean;
  filesPresent: number;
  filesExpected: number;
  files: Block2FileStatus[];
  /** BLOCK_2 "Implementation Checklist" items that can be machine-checked. */
  checklist: Array<{ item: string; passed: boolean; detail?: string }>;
  blockingSummary: string;
}

function countEntries(node: unknown): number | null {
  if (Array.isArray(node)) return node.length;
  if (node && typeof node === 'object') return Object.keys(node as object).length;
  return null;
}

/**
 * Inspects a directory that should contain the 15 BLOCK_2 files.
 * Never throws for missing data: it reports. The caller decides.
 */
export function inspectBlock2Canonical(dir: string): Block2Report {
  const files: Block2FileStatus[] = [];
  const versions = new Set<string>();
  const effectiveDates = new Set<string>();
  const allIds = new Map<string, string[]>();

  for (const file of BLOCK2_FILES) {
    const full = path.join(dir, file);
    const status: Block2FileStatus = {
      file, present: false, headerValid: false, rootKeyPresent: false, entryCount: null, issues: [],
    };

    if (!fs.existsSync(full)) {
      status.issues.push('File not delivered.');
      files.push(status);
      continue;
    }
    status.present = true;

    let doc: Record<string, unknown>;
    try {
      doc = (yaml.load(fs.readFileSync(full, 'utf8')) ?? {}) as Record<string, unknown>;
    } catch (e) {
      status.issues.push(`YAML syntax error: ${e instanceof Error ? e.message : 'unknown'}`);
      files.push(status);
      continue;
    }

    const header = Block2HeaderSchema.safeParse(doc);
    status.headerValid = header.success;
    if (!header.success) {
      status.issues.push(`Header invalid: ${header.error.issues.map((i) => i.path.join('.')).join(', ')} missing/invalid.`);
    } else {
      versions.add(header.data.version);
      effectiveDates.add(header.data.effective_date);
    }

    const rootKey = BLOCK2_ROOT_KEYS[file];
    const root = doc[rootKey];
    status.rootKeyPresent = root !== undefined;
    if (root === undefined) {
      status.issues.push(`Missing root key "${rootKey}".`);
    } else {
      status.entryCount = countEntries(root);
      if (status.entryCount === 0) status.issues.push(`Root key "${rootKey}" is empty.`);
      // Collect declared IDs for the duplicate check.
      const ids: string[] = [];
      const collect = (n: unknown): void => {
        if (Array.isArray(n)) n.forEach(collect);
        else if (n && typeof n === 'object') {
          const o = n as Record<string, unknown>;
          if (typeof o.id === 'string') ids.push(o.id);
          Object.values(o).forEach(collect);
        }
      };
      collect(root);
      allIds.set(file, ids);
    }
    files.push(status);
  }

  const present = files.filter((f) => f.present).length;

  // Duplicate IDs across files (BLOCK_2 checklist item).
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const [file, ids] of allIds) {
    for (const id of ids) {
      const prev = seen.get(id);
      if (prev && prev !== file) duplicates.push(`${id} (${prev} & ${file})`);
      else seen.set(id, file);
    }
  }

  const missingDeps: string[] = [];
  for (const [file, deps] of Object.entries(BLOCK2_DEPENDENCIES)) {
    if (!files.find((f) => f.file === file)?.present) continue;
    for (const dep of deps ?? []) {
      if (!files.find((f) => f.file === dep)?.present) missingDeps.push(`${file} → ${dep}`);
    }
  }

  const checklist = [
    { item: 'All 15 files created', passed: present === BLOCK2_FILES.length, detail: `${present}/${BLOCK2_FILES.length} present` },
    { item: 'All version numbers match', passed: versions.size <= 1, detail: versions.size ? `versions: ${[...versions].join(', ')}` : 'no headers read' },
    { item: 'All effective dates match', passed: effectiveDates.size <= 1, detail: effectiveDates.size ? `dates: ${[...effectiveDates].join(', ')}` : 'no headers read' },
    { item: 'No duplicate IDs across files', passed: duplicates.length === 0, detail: duplicates.slice(0, 5).join('; ') || 'none found' },
    { item: 'Declared dependencies resolve', passed: missingDeps.length === 0, detail: missingDeps.join('; ') || 'all resolve' },
    { item: 'YAML syntax validation passes', passed: files.every((f) => !f.issues.some((i) => i.startsWith('YAML syntax error'))) },
  ];

  const populated = present === BLOCK2_FILES.length && files.every((f) => f.issues.length === 0);
  const missing = files.filter((f) => !f.present).map((f) => f.file);

  return {
    directory: dir,
    populated,
    filesPresent: present,
    filesExpected: BLOCK2_FILES.length,
    files,
    checklist,
    blockingSummary: populated
      ? 'BLOCK_2 canonical is fully populated and structurally valid.'
      : `BLOCK_2 canonical NOT usable: ${missing.length} of ${BLOCK2_FILES.length} files not delivered` +
        (missing.length ? ` (${missing.join(', ')})` : '') +
        '. Awaiting population by Magnetia (BLOCK_2 "Next Steps").',
  };
}

/** Human-readable report for CLI / API output. */
export function formatBlock2Report(report: Block2Report): string {
  const lines: string[] = [
    `BLOCK_2 CANONICAL — ESTADO DE ENTREGA`,
    `Directorio: ${report.directory}`,
    `Archivos: ${report.filesPresent}/${report.filesExpected}`,
    '',
    'ARCHIVOS:',
  ];
  for (const f of report.files) {
    const mark = f.present && f.issues.length === 0 ? 'OK  ' : f.present ? 'WARN' : 'FALTA';
    const count = f.entryCount != null ? ` (${f.entryCount} entradas)` : '';
    lines.push(`  [${mark.padEnd(5)}] ${f.file}${count}${f.issues.length ? ' — ' + f.issues.join(' ') : ''}`);
  }
  lines.push('', 'CHECKLIST DE COMPILACIÓN (BLOCK_2):');
  for (const c of report.checklist) {
    lines.push(`  [${c.passed ? 'x' : ' '}] ${c.item}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  lines.push('', report.blockingSummary);
  return lines.join('\n');
}
