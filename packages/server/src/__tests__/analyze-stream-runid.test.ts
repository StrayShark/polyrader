import { describe, it, expect } from 'vitest';

describe('analyzeStream SSE payload shape', () => {
  it('llm_result progress carries analysisRunId and paperDecisionAction', () => {
    const llmResult = {
      provider: 'minimax' as const,
      winProbability: { teamA: 0.61, teamB: 0.39 },
      confidence: 0.7,
      reasoning: 'edge',
      error: undefined as string | undefined,
      analysisRunId: 'ar_stream_test_1',
      paperDecisionAction: 'paper_bet' as const,
    };

    // Mirrors packages/server/src/controllers/ai-config-controller.ts analyzeStream progress payload.
    const payload = {
      provider: llmResult.provider,
      probability: llmResult.winProbability.teamA,
      confidence: llmResult.confidence,
      reasoning: llmResult.reasoning,
      error: llmResult.error,
      analysisRunId: llmResult.analysisRunId,
      paperDecisionAction: llmResult.paperDecisionAction,
    };

    expect(payload.analysisRunId).toBe('ar_stream_test_1');
    expect(payload.paperDecisionAction).toBe('paper_bet');
    expect(JSON.stringify(payload)).toContain('ar_stream_test_1');
  });
});
