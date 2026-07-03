import { Router, type Request, type Response } from 'express';
import { LLMRepository } from '@polyrader/infra';
import {
  validate,
  createVariantSchema,
  updateVariantSchema,
  variantParamsSchema,
  abCompareQuerySchema,
  abApplyRecommendationSchema,
} from '../validation';
import { logger } from '../utils/logger';
import { applyAbRecommendation, comparePromptVariants } from '../services/prompt-ab-service';

/**
 * Router for Prompt A/B testing variant management.
 * Mounted at /api/ai/prompts
 */
export function createPromptVariantRouter(llmRepo: LLMRepository): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      const variants = llmRepo.getAllVariants();
      res.json({ data: variants });
    } catch (err) {
      logger.error('Failed to fetch prompt variants', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch variants' });
    }
  });

  router.get('/ab/compare', validate(abCompareQuerySchema, 'query'), (req: Request, res: Response) => {
    try {
      const variantA = req.query.variantA as string;
      const variantB = req.query.variantB as string;
      res.json({ data: comparePromptVariants(llmRepo, variantA, variantB) });
    } catch (err) {
      logger.error('Failed to compare prompt variants', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to compare variants' });
    }
  });

  router.post('/ab/apply-recommendation', validate(abApplyRecommendationSchema, 'body'), (req: Request, res: Response) => {
    try {
      const { variantA, variantB, boostRatio } = req.body as {
        variantA: string;
        variantB: string;
        boostRatio?: number;
      };
      const result = applyAbRecommendation(llmRepo, variantA, variantB, boostRatio);
      if (!result.applied) {
        res.status(409).json({
          error: 'Recommendation not applied',
          recommendation: result.recommendation,
        });
        return;
      }
      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to apply prompt A/B recommendation', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to apply recommendation' });
    }
  });

  router.get('/:variantId', validate(variantParamsSchema, 'params'), (req: Request, res: Response) => {
    try {
      const variant = llmRepo.getVariant(req.params.variantId);
      if (!variant) {
        res.status(404).json({ error: 'Variant not found' });
        return;
      }
      res.json({ data: variant });
    } catch (err) {
      logger.error('Failed to fetch prompt variant', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch variant' });
    }
  });

  router.post('/', validate(createVariantSchema, 'body'), (req: Request, res: Response) => {
    try {
      const existing = llmRepo.getVariant(req.body.variantId);
      if (existing) {
        res.status(409).json({ error: 'Variant already exists' });
        return;
      }
      llmRepo.upsertVariant(req.body);
      const variant = llmRepo.getVariant(req.body.variantId);
      res.status(201).json({ data: variant });
    } catch (err) {
      logger.error('Failed to create prompt variant', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to create variant' });
    }
  });

  router.put(
    '/:variantId',
    validate(variantParamsSchema, 'params'),
    validate(updateVariantSchema, 'body'),
    (req: Request, res: Response) => {
      try {
        const existing = llmRepo.getVariant(req.params.variantId);
        if (!existing) {
          res.status(404).json({ error: 'Variant not found' });
          return;
        }
        const merged = { ...existing, ...req.body, variantId: req.params.variantId };
        llmRepo.upsertVariant(merged);
        const variant = llmRepo.getVariant(req.params.variantId);
        res.json({ data: variant });
      } catch (err) {
        logger.error('Failed to update prompt variant', { error: (err as Error).message });
        res.status(500).json({ error: 'Failed to update variant' });
      }
    },
  );

  router.delete('/:variantId', validate(variantParamsSchema, 'params'), (req: Request, res: Response) => {
    try {
      const existing = llmRepo.getVariant(req.params.variantId);
      if (!existing) {
        res.status(404).json({ error: 'Variant not found' });
        return;
      }
      if (existing.isControl) {
        res.status(400).json({ error: 'Cannot delete control variant' });
        return;
      }
      llmRepo.deleteVariant(req.params.variantId);
      res.json({ message: 'Variant deleted' });
    } catch (err) {
      logger.error('Failed to delete prompt variant', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to delete variant' });
    }
  });

  return router;
}
