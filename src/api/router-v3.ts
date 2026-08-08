/**
 * HTC v3 — REST API (OS v3.0, C-1..C-5 resueltos).
 *
 * Protegida por el mismo authMiddleware que el resto de la plataforma:
 * son datos clínicos y no pueden quedar expuestos.
 */
import * as path from 'path';
import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { CompiledV3, loadCanonicalV3, compileCanonicalV3, resolveReasonV3 } from '../v3/canonical';
import { runAssessmentV3 } from '../v3/pipeline';
import { AssessmentV3InputSchema, MissingCanonicalV3Error } from '../v3/models';
import { V3Repository } from '../v3/repository';
import { buildClientReportV3 } from '../v3/client-report';
import { authMiddleware } from './auth';

export function loadCompiledV3(): CompiledV3 {
  const dir = process.env.HTC_CANONICAL_V3_DIR ?? path.join(__dirname, '..', '..', 'canonical-v3');
  return compileCanonicalV3(loadCanonicalV3(dir));
}

/** Categorías de override (Blueprint v3.0 §6 — aprendizaje del sistema). */
const OVERRIDE_CATEGORIES = [
  'MEDICAL', 'MOTIVATIONAL', 'SPORT_CONTEXT', 'LIFESTYLE_CONSTRAINT', 'COACH_JUDGMENT', 'OTHER',
];

export function createRouterV3(compiled: CompiledV3, repo: V3Repository): Router {
  const router = Router();

  // Datos clínicos: misma protección que el resto de la plataforma.
  router.use(authMiddleware);

  const fail = (res: Response, err: unknown): void => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
      return;
    }
    if (err instanceof MissingCanonicalV3Error) {
      res.status(409).json({ error: 'MISSING_CANONICAL', message: err.message });
      return;
    }
    res.status(500).json({ error: 'SYSTEM_ERROR', message: err instanceof Error ? err.message : 'unknown' });
  };

  // ── Canonical ────────────────────────────────────────────────────────────
  router.get('/canonical/versions', (_req: Request, res: Response) => {
    res.json({ versions: compiled.raw.versions, warnings: compiled.warnings });
  });

  router.get('/canonical/catalogue', (_req: Request, res: Response) => {
    res.json({
      domains: compiled.raw.domains.map((d) => ({
        key: d.key, name: d.name, order: d.order, impact_factor: d.impact_factor,
        scale: d.scale ?? d.scale_mvp, critical_component_rule: d.critical_component_rule,
      })),
      tests: compiled.raw.tests.map((t) => ({
        key: t.key, name: t.name, domain: t.domain, unit: t.unit,
        weight: t.weight ?? null, is_inverse: t.is_inverse,
        optional_in_mvp: t.optional_in_mvp ?? false,
        requires_medical_clearance: t.requires_medical_clearance ?? false,
        populations: t.populations.map((p) => ({
          id: p.id, sex: p.sex, age_min: p.age_min, age_max: p.age_max,
          umbral_critical: p.umbral_critical, umbral_foundation: p.umbral_foundation,
        })),
      })),
      movement_levels: compiled.movementLevelsOrdered.map((l) => ({
        level_id: l.level_id, name: l.name, sequence_number: l.sequence_number,
        description: l.description,
        observation_variables: l.observation_variables,
        needs_coordination_ceiling: l.level_id === 'L3_MC',
        needs_problem_solving_ceiling: l.level_id === 'L4_MPS',
      })),
      challenge_order: compiled.raw.challengeOrder,
      red_flags: compiled.raw.redFlags.map((f) => ({
        id: f.id,
        label: f.label,
        severity: f.severity,
        // Las condicionales necesitan que el coach informe la antigüedad.
        window_weeks: f.conditional?.window_weeks ?? null,
      })),
      classification: compiled.raw.classificationConfig,
      override_categories: OVERRIDE_CATEGORIES,
    });
  });

  /** Rubrics completos: el coach clasifica con el criterio canónico a la vista. */
  router.get('/canonical/rubrics', (_req: Request, res: Response) => {
    res.json({ rubrics: compiled.raw.rubrics });
  });

  // ── Evaluación ───────────────────────────────────────────────────────────
  router.post('/assess', async (req: Request, res: Response) => {
    try {
      const input = AssessmentV3InputSchema.parse(req.body);
      const result = runAssessmentV3(compiled, input);
      await repo.save(result);
      res.status(200).json({ assessment: result });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/assessments', async (_req: Request, res: Response) => {
    try {
      res.json({ assessments: await repo.list() });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/assessments/:id', async (req: Request, res: Response) => {
    try {
      const stored = await repo.get(req.params.id ?? '');
      if (!stored) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.json({ assessment: stored.assessment, coach_confirmation: stored.coach_confirmation });
    } catch (err) {
      fail(res, err);
    }
  });

  /**
   * Confirmación u override del coach.
   * HTC es coach-led: la plataforma recomienda, el coach decide. Todo override
   * exige razón y categoría, que quedan registradas (Platform Data §29).
   */
  router.post('/assessments/:id/confirm', async (req: Request, res: Response) => {
    try {
      const { confirmed, override_reason, override_reason_category, clinical_confidence } = req.body as {
        confirmed?: boolean; override_reason?: string;
        override_reason_category?: string; clinical_confidence?: number;
      };
      if (typeof confirmed !== 'boolean') {
        res.status(422).json({ error: 'MISSING_FIELDS', message: 'confirmed (boolean) es obligatorio' });
        return;
      }
      if (confirmed === false) {
        if (!override_reason || !override_reason.trim()) {
          res.status(422).json({ error: 'OVERRIDE_REASON_REQUIRED', message: 'Todo override debe registrar su razón.' });
          return;
        }
        if (!override_reason_category || !OVERRIDE_CATEGORIES.includes(override_reason_category)) {
          res.status(422).json({
            error: 'OVERRIDE_CATEGORY_REQUIRED',
            message: `override_reason_category debe ser una de: ${OVERRIDE_CATEGORIES.join(', ')}`,
          });
          return;
        }
      }
      if (clinical_confidence !== undefined &&
          (typeof clinical_confidence !== 'number' || clinical_confidence < 0 || clinical_confidence > 100)) {
        res.status(422).json({ error: 'INVALID_CLINICAL_CONFIDENCE', message: 'clinical_confidence debe ser 0-100' });
        return;
      }

      const stored = await repo.confirm(req.params.id ?? '', {
        confirmed,
        override_reason: override_reason ?? null,
        override_reason_category: override_reason_category ?? null,
        clinical_confidence: clinical_confidence ?? null,
        confirmed_at: new Date().toISOString(),
      });
      if (!stored) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.json({ assessment_id: req.params.id, coach_confirmation: stored.coach_confirmation });
    } catch (err) {
      fail(res, err);
    }
  });

  /** Reporte en lenguaje simple para el cliente. */
  router.get('/assessments/:id/report', async (req: Request, res: Response) => {
    try {
      const stored = await repo.get(req.params.id ?? '');
      if (!stored) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const lang = req.query.lang === 'en' ? 'en' : 'es';
      res.json(buildClientReportV3(compiled, stored.assessment, lang));
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}

/** Renderiza un reason_id (usado por el reporte). */
export { resolveReasonV3 };
