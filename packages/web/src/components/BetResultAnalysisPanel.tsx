import { useEffect } from 'react';
import { Badge, Button } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';
import { useReviewStore } from '../stores/review-store';
import { cn } from '../utils/cn';
import { LoadingSpinner } from './LoadingState';

function formatMetric(value: number | null, digits = 3): string {
  return value === null ? '—' : value.toFixed(digits);
}

function JsonArtifact({ title, value }: { title: string; value: string }) {
  let formatted = value;
  try {
    formatted = JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    // Raw provider output can be invalid JSON and must remain inspectable.
  }
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs font-medium">{title}</div>
      <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-[10px] leading-relaxed text-muted-foreground">
        {formatted}
      </pre>
    </div>
  );
}

export function BetResultAnalysisPanel({ betId }: { betId: string }) {
  const { t, locale } = useI18n();
  const {
    resultAnalysis,
    isAnalyzingResult,
    resultAnalysisError,
    fetchResultAnalysis,
    analyzeBetResult,
  } = useReviewStore();

  useEffect(() => {
    void fetchResultAnalysis(betId);
  }, [betId, fetchResultAnalysis]);

  const response = resultAnalysis?.response;
  const valid = resultAnalysis?.status === 'valid' && response;

  return (
    <section className="space-y-3 border-t border-border pt-4" data-testid="bet-result-analysis">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">{t('review.llmResultAnalysis')}</h4>
          <p className="text-xs text-muted-foreground">{t('review.llmResultAnalysisHint')}</p>
        </div>
        <Button
          variant={resultAnalysis ? 'outline' : 'default'}
          size="sm"
          disabled={isAnalyzingResult}
          onClick={() => void analyzeBetResult(betId, {
            locale,
            force: resultAnalysis?.status === 'valid',
          })}
        >
          {isAnalyzingResult && <LoadingSpinner className="h-3.5 w-3.5" size={14} />}
          {isAnalyzingResult
            ? t('review.llmAnalyzing')
            : resultAnalysis?.status === 'valid'
              ? t('review.llmReanalyze')
              : t('review.llmAnalyze')}
        </Button>
      </div>

      {resultAnalysisError && (
        <div className="rounded-md border border-red/30 bg-red/5 px-3 py-2 text-xs text-red">
          {resultAnalysisError}
        </div>
      )}

      {resultAnalysis && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={resultAnalysis.status === 'valid' ? 'green' : resultAnalysis.status === 'invalid' || resultAnalysis.status === 'failed' ? 'red' : 'secondary'}>
            {t(`review.llmStatus_${resultAnalysis.status}`)}
          </Badge>
          <span>{resultAnalysis.provider ?? '—'} · {resultAnalysis.model ?? '—'}</span>
          <span>{resultAnalysis.promptVersion}</span>
          <span className="font-mono text-[10px]">{resultAnalysis.promptHash.slice(0, 18)}</span>
        </div>
      )}

      {valid && (
        <div className="space-y-4">
          <div className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{t(`review.llmVerdict_${response.verdict.decisionQuality}`)}</div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {t('review.llmProcessScore')} {(response.verdict.processScore * 100).toFixed(0)}%
              </div>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{response.verdict.summary}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] text-muted-foreground">{t('review.llmCalibration')}</div>
              <div className="mt-1 text-sm font-medium">{t(`review.llmCalibration_${response.calibration.assessment}`)}</div>
              <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                Brier {formatMetric(response.calibration.brierScore)}
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] text-muted-foreground">{t('review.llmPriceQuality')}</div>
              <div className="mt-1 text-sm font-medium">{t(`review.llmPrice_${response.priceQuality.assessment}`)}</div>
              <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                CLV {formatMetric(response.priceQuality.closingLineValue)}
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-[10px] text-muted-foreground">{t('review.llmRiskDiscipline')}</div>
              <div className="mt-1 text-sm font-medium">{t(`review.llmRisk_${response.riskDiscipline.assessment}`)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {response.riskDiscipline.reasonCodes.join(' · ') || '—'}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium">
              {t('review.llmAttribution')} · {t(`review.llmPrimary_${response.attribution.primary}`)}
            </div>
            {response.attribution.factors.map((factor) => (
              <div key={`${factor.code}-${factor.evidenceIds.join('-')}`} className="rounded-md border border-border px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{factor.code}</span>
                  <span className={cn(
                    'text-[10px]',
                    factor.impact === 'positive' && 'text-green',
                    factor.impact === 'negative' && 'text-red',
                    factor.impact === 'neutral' && 'text-muted-foreground',
                  )}>
                    {factor.category} · {factor.impact}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{factor.summary}</p>
                <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                  {factor.evidenceIds.join(' · ')}
                </p>
              </div>
            ))}
          </div>

          {response.lessons.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium">{t('review.llmLessons')}</div>
              {response.lessons.map((lesson) => (
                <div key={lesson.code} className="flex gap-3 rounded-md border border-border px-3 py-2 text-xs">
                  <Badge variant={lesson.priority === 'high' ? 'red' : lesson.priority === 'medium' ? 'yellow' : 'secondary'}>
                    {lesson.priority}
                  </Badge>
                  <div>
                    <div className="font-medium">{lesson.code}</div>
                    <p className="mt-0.5 text-muted-foreground">{lesson.action}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {response.suggestedErrorTags.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium">{t('review.llmSuggestedErrorTags')}</div>
              <div className="flex flex-wrap gap-2">
                {response.suggestedErrorTags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {t(`review.errorTag_${tag}`)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <p className="rounded-md border border-border px-3 py-2 text-xs leading-relaxed">
            {response.summary}
          </p>
        </div>
      )}

      {resultAnalysis && resultAnalysis.status !== 'valid' && resultAnalysis.validationErrors.length > 0 && (
        <div className="space-y-1 rounded-md border border-red/30 bg-red/5 p-3 text-xs text-red">
          {resultAnalysis.validationErrors.map((item, index) => (
            <div key={`${item.path}-${index}`}>{item.code} · {item.path} · {item.message}</div>
          ))}
        </div>
      )}

      {resultAnalysis && (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-xs font-medium">{t('review.llmStandardArtifacts')}</summary>
          <div className="mt-3 grid gap-3">
            <JsonArtifact title={t('review.llmStandardInput')} value={resultAnalysis.inputJson} />
            <JsonArtifact
              title={t('review.llmStandardOutput')}
              value={resultAnalysis.normalizedResponseJson ?? resultAnalysis.rawResponse ?? '{}'}
            />
            <JsonArtifact title={t('review.llmOutputSchema')} value={resultAnalysis.outputSchemaJson} />
            <div className="space-y-1">
              <div className="text-xs font-medium">{t('review.llmSystemPrompt')}</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-[10px] leading-relaxed text-muted-foreground">
                {resultAnalysis.systemPrompt}
              </pre>
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
