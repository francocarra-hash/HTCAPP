/**
 * REST API (Express). Single-coach auth for the pilot (api/auth.ts);
 * 409 = canonical incomplete for the requested operation (fail loudly).
 */
import * as path from 'path';
import { Router, Request, Response } from 'express';
import { ZodError } from 'zod';
import { CompiledCanonical } from '../canonical/compiler';
import { MissingCanonicalError, ModuleNotImplementedError } from '../models/canonical';
import { Repository } from '../db/repository';
import { runPipeline } from '../pipeline';
import { buildClientReport } from '../report/client-report';
import { AssessmentInputSchema } from '../models/assessment';
import { authEnabled, authMiddleware, issueToken, verifyPassword } from './auth';
import { inspectBlock2Canonical } from '../canonical/block2-schema';
import { runAllDomainModules } from '../domains/domain-module';

export function createRouter(compiled: CompiledCanonical, repo: Repository): Router {
  const router = Router();
  router.use(authMiddleware);

  const handleError = (res: Response, err: unknown): void => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
      return;
    }
    if (err instanceof MissingCanonicalError) {
      res.status(409).json({ error: 'MISSING_CANONICAL', message: err.message });
      return;
    }
    if (err instanceof ModuleNotImplementedError) {
      res.status(501).json({ error: 'MODULE_NOT_IMPLEMENTED', message: err.message });
      return;
    }
    res.status(500).json({ error: 'SYSTEM_ERROR', message: err instanceof Error ? err.message : 'unknown' });
  };

  router.post('/login', (req: Request, res: Response) => {
    if (!authEnabled()) {
      res.json({ token: null, auth_enabled: false });
      return;
    }
    const { password } = req.body as { password?: string };
    if (!password || !verifyPassword(password)) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS' });
      return;
    }
    res.json({ token: issueToken(), auth_enabled: true });
  });

  router.get('/canonical/version', (_req: Request, res: Response) => {
    res.json({
      canonical_version: compiled.raw.version,
      auth_enabled: authEnabled(),
      // Principio 6: the five component versions currently in force.
      component_versions: compiled.raw.componentVersions,
    });
  });

  /**
   * Delivery status of the BLOCK_2 canonical (15 files).
   * Reports what Magnetia still has to populate; never guesses content.
   */
  router.get('/canonical/block2-status', (_req: Request, res: Response) => {
    const dir = process.env.HTC_BLOCK2_DIR ?? path.join(__dirname, '..', '..', 'canonical-v3');
    const report = inspectBlock2Canonical(dir);
    res.json(report);
  });

  /** Safety catalogue in force (AUTHORITATIVE §9): red flags, gates and flags. */
  router.get('/canonical/safety', (_req: Request, res: Response) => {
    res.json({
      red_flags: compiled.raw.redFlags,
      vital_sign_gates: compiled.raw.vitalSignGates,
      flag_rules: compiled.raw.flagRules,
    });
  });

  /** Aggregation strategy in force (parameterized, see C-2/C-3). */
  router.get('/canonical/aggregation', (_req: Request, res: Response) => {
    res.json(compiled.raw.aggregation);
  });

  // Test catalogue for the assessment form — driven by canonical, never hardcoded in UI.
  router.get('/canonical/tests', (_req: Request, res: Response) => {
    const tests = compiled.raw.tests
      .filter((t) => t.active)
      .map((t) => {
        const standards = (compiled.standardsByTest.get(t.id) ?? []).filter((s) => s.verification_status !== 'PLACEHOLDER');
        const model = standards[0]?.classification_model;
        let input: { kind: 'numeric' | 'ordinal_map' | 'coach_classified' | 'regions'; options?: Array<{ value: string; es: string; en: string }>; criteria?: string } =
          { kind: 'numeric' };
        if (model?.type === 'ALGORITHMIC') input = { kind: 'regions' };
        else if (model?.type === 'ORDINAL_MAP') {
          input = {
            kind: 'ordinal_map',
            options: Object.entries(model.map_labels ?? {}).map(([value, l]) => ({ value, es: l.es, en: l.en })),
          };
        } else if (model?.type === 'COACH_CLASSIFIED') {
          input = { kind: 'coach_classified', criteria: model.basis };
        }
        return {
          id: t.id,
          name: t.name,
          unit: t.unit,
          measurement_type: t.measurement_type,
          core_test: t.core_test,
          sided: t.sided ?? false,
          asymmetry_rule: t.asymmetry_rule ?? null,
          capacities: (compiled.capacitiesByTest.get(t.id) ?? []).map((cid) => {
            const cap = compiled.capacityById.get(cid);
            return { id: cid, name: cap?.name ?? cid, domain_id: cap?.domain_id ?? '' };
          }),
          has_standard: standards.length > 0,
          input,
        };
      });
    res.json({ tests });
  });

  router.get('/clients', async (_req: Request, res: Response) => {
    try {
      const records = await repo.listClients();
      const clients = await Promise.all(records.map(async (c) => {
        const history = await repo.getClientHistory(c.id);
        const last = history[history.length - 1];
        return {
          ...c,
          assessments_count: history.length,
          last_assessment: last
            ? {
                date: last.created_at,
                decision_id: last.decision.decision_id,
                pathway: last.decision.pathway,
                p1: last.decision.primary_system_bottleneck.capacity_id,
                p1_status: last.decision.primary_system_bottleneck.status,
                coach_confirmed: last.decision.coach_confirmation.confirmed,
              }
            : null,
        };
      }));
      res.json({ clients });
    } catch (err) {
      handleError(res, err);
    }
  });

  /**
   * Per-domain assessment (Principio 9): runs each domain module in isolation
   * and returns its own Assessment → Classification → Bottleneck → Report.
   * No cross-domain priority is computed here.
   */
  router.post('/assess/by-domain', (req: Request, res: Response) => {
    try {
      const input = AssessmentInputSchema.parse(req.body);
      res.json({ domains: runAllDomainModules(compiled, input) });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.post('/assess', async (req: Request, res: Response) => {
    try {
      const input = AssessmentInputSchema.parse(req.body);
      const decision = runPipeline(compiled, input);
      const client = await repo.upsertClient(input);
      const stored = await repo.saveAssessment(client.id, input, decision);
      res.status(200).json({ client_id: client.id, assessment_id: stored.id, decision });
    } catch (err) {
      handleError(res, err);
    }
  });

  const OVERRIDE_CATEGORIES = ['MEDICAL', 'MOTIVATIONAL', 'SPORT_CONTEXT', 'LIFESTYLE_CONSTRAINT', 'COACH_JUDGMENT', 'OTHER'];

  router.post('/decisions/:id/confirm', async (req: Request, res: Response) => {
    try {
      const { confirmed, override_reason, override_reason_category, clinical_confidence } = req.body as {
        confirmed?: boolean; override_reason?: string; override_reason_category?: string; clinical_confidence?: number;
      };
      if (typeof confirmed !== 'boolean') {
        res.status(422).json({ error: 'MISSING_FIELDS', message: 'confirmed (boolean) is required' });
        return;
      }
      if (confirmed === false && !override_reason) {
        // Override without reason is prohibited (Platform Data §29).
        res.status(422).json({ error: 'OVERRIDE_REASON_REQUIRED', message: 'Every coach override must record its reason.' });
        return;
      }
      if (confirmed === false && (!override_reason_category || !OVERRIDE_CATEGORIES.includes(override_reason_category))) {
        // Blueprint v3.0 §6: override reason must be categorized for system learning.
        res.status(422).json({ error: 'OVERRIDE_CATEGORY_REQUIRED', message: `override_reason_category must be one of: ${OVERRIDE_CATEGORIES.join(', ')}` });
        return;
      }
      if (clinical_confidence !== undefined && (typeof clinical_confidence !== 'number' || clinical_confidence < 0 || clinical_confidence > 100)) {
        res.status(422).json({ error: 'INVALID_CLINICAL_CONFIDENCE', message: 'clinical_confidence must be a number 0-100' });
        return;
      }
      const stored = await repo.confirmDecision(req.params.id ?? '', {
        confirmed,
        override_reason: override_reason ?? null,
        override_reason_category: override_reason_category ?? null,
        clinical_confidence: clinical_confidence ?? null,
      });
      if (!stored) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.json({ decision_id: req.params.id, coach_confirmation: stored.decision.coach_confirmation });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/clients/:id', async (req: Request, res: Response) => {
    try {
      const client = await repo.getClient(req.params.id ?? '');
      if (!client) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const history = (await repo.getClientHistory(client.id)).map((a) => ({
        assessment_id: a.id,
        date: a.created_at,
        pathway: a.decision.pathway,
        p1: a.decision.primary_system_bottleneck.capacity_id,
        strategy: a.decision.strategy,
        coach_confirmed: a.decision.coach_confirmation.confirmed,
      }));
      res.json({ client, assessments: history });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/decisions/:id', async (req: Request, res: Response) => {
    try {
      const stored = await repo.getDecision(req.params.id ?? '');
      if (!stored) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.json({ decision: stored.decision });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/decisions/:id/audit', async (req: Request, res: Response) => {
    try {
      const stored = await repo.getDecision(req.params.id ?? '');
      if (!stored) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.json({ decision_id: stored.decision.decision_id, audit_trail: stored.decision.audit_trail });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/decisions/:id/report', async (req: Request, res: Response) => {
    try {
      const stored = await repo.getDecision(req.params.id ?? '');
      if (!stored) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const lang = req.query.lang === 'en' ? 'en' : 'es';
      res.json(buildClientReport(compiled, stored.decision, lang));
    } catch (err) {
      handleError(res, err);
    }
  });

  // Out-of-scope modules answer explicitly (Master Instructions — MVP SCOPE).
  for (const route of ['/interventions', '/dosage', '/missions', '/exercise-library']) {
    router.all(route, (_req: Request, res: Response) => {
      handleError(res, new ModuleNotImplementedError(route.slice(1)));
    });
  }

  return router;
}
