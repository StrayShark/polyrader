# Standard LLM Analysis Contract

Status: Current design contract
Version: `analysis.v1`
Last updated: 2026-07-21

## 1. Objective

Every LLM analysis must be reproducible, provider-neutral, schema-valid, and safe to
feed into the local simulated betting engine. Both the model input and model output
are immutable artifacts of an analysis run.

The contract replaces the current loose combination of Markdown context, best-effort
JSON extraction, and provider-specific response parsing.

## 2. Run Identity

Every run has one immutable identity:

```text
runId = ar_<game>_<matchId>_<marketId>_<timestamp>_<nonce>
```

Required version and integrity fields:

- `contractVersion`: `analysis.v1`
- `promptVersion`: semantic version such as `cs2.match-winner.v1.0.0`
- `responseSchemaVersion`: `analysis-response.v1`
- `dataSnapshotHash`: SHA-256 of the canonical input snapshot
- `promptHash`: SHA-256 of system prompt, user envelope, and output schema
- `gameAdapterVersion`: version of the game-specific normalizer
- `marketAdapterVersion`: version of the market parser and settlement rules

The same run ID must connect prompt artifacts, provider responses, normalized report,
paper-order decision, simulated bet, and settlement.

## 3. Standard Prompt Package

The runtime sends three separate artifacts. Providers may encode them differently at
transport level, but their semantic content must be identical.

### 3.1 System prompt

```text
You are an esports probability analyst operating inside a local simulated-betting
training tool.

Use only facts supplied in INPUT. Do not invent missing rosters, rankings, patches,
maps, prices, or results. Every material claim must reference one or more factId
values from INPUT.dataSnapshot.facts.

Return only JSON that validates against OUTPUT_SCHEMA. Do not return Markdown,
commentary, code fences, or hidden chain-of-thought. Provide only a concise
rationaleSummary, evidence references, uncertainty, and risk codes.

This is a simulated decision. Do not advise deposits, withdrawals, real-money bets,
or attempts to bypass product risk limits. The runtime, not the model, determines the
final simulated stake.
```

### 3.2 User input envelope

The user message is canonical JSON, not a prose template:

```json
{
  "contractVersion": "analysis.v1",
  "runId": "ar_dota2_8906069414_match-winner_20260721T120000Z_a1b2",
  "promptVersion": "dota2.match-winner.v1.0.0",
  "game": "dota2",
  "locale": "zh-CN",
  "generatedAt": "2026-07-21T12:00:00.000Z",
  "match": {
    "matchId": "8906069414",
    "eventId": "league-42",
    "eventName": "Example League",
    "startsAt": "2026-07-22T10:00:00.000Z",
    "format": "BO3",
    "status": "scheduled",
    "participants": [
      { "participantId": "team-a", "name": "Team A", "side": "a" },
      { "participantId": "team-b", "name": "Team B", "side": "b" }
    ]
  },
  "market": {
    "marketId": "market-1",
    "kind": "match_winner",
    "line": null,
    "outcomes": [
      { "outcomeId": "team-a", "label": "Team A", "marketProbability": 0.54 },
      { "outcomeId": "team-b", "label": "Team B", "marketProbability": 0.46 }
    ],
    "liquidityUsd": 8200,
    "observedAt": "2026-07-21T11:59:30.000Z"
  },
  "dataSnapshot": {
    "dataSnapshotHash": "sha256:...",
    "completeness": 0.88,
    "freshnessSeconds": 1800,
    "facts": [
      {
        "factId": "team-a-rating",
        "entityType": "team",
        "source": "opendota",
        "observedAt": "2026-07-21T11:50:00.000Z",
        "field": "rating",
        "value": 1542.5
      }
    ],
    "missing": ["confirmed_lineup"]
  },
  "policy": {
    "minimumCompleteness": 0.7,
    "minimumConfidence": 0.6,
    "minimumEdge": 0.05,
    "lowLiquidityThresholdUsd": 1000,
    "allowedActions": ["recommend_outcome", "pass"]
  }
}
```

Rules:

- Keys are stable and ordered before hashing.
- Numbers use JSON numbers, not percentages or formatted strings.
- Missing data is explicit. Zero must never mean unknown.
- Game-specific facts live in `dataSnapshot.facts`; the common envelope stays stable.
- Market probabilities are normalized before entering the prompt.
- No API key, wallet identifier, private path, or raw personal account data enters the prompt.

### 3.3 Output schema

The model response must validate strictly. Unknown top-level fields are rejected.

```json
{
  "contractVersion": "analysis-response.v1",
  "runId": "ar_dota2_8906069414_match-winner_20260721T120000Z_a1b2",
  "prediction": {
    "outcomes": [
      { "outcomeId": "team-a", "probability": 0.59 },
      { "outcomeId": "team-b", "probability": 0.41 }
    ]
  },
  "confidence": {
    "score": 0.68,
    "grade": "medium",
    "reasonCodes": ["ROSTER_UNCONFIRMED"]
  },
  "recommendation": {
    "action": "recommend_outcome",
    "outcomeId": "team-a"
  },
  "evidence": [
    {
      "factIds": ["team-a-rating"],
      "direction": "supports",
      "impact": "medium",
      "summary": "Team A has the stronger current rating."
    }
  ],
  "risks": [
    {
      "code": "ROSTER_UNCONFIRMED",
      "severity": "medium",
      "summary": "The final starting roster has not been confirmed."
    }
  ],
  "rationaleSummary": "Team A has a modest evidence-backed advantage, reduced by roster uncertainty."
}
```

Validation invariants:

- Outcome IDs must exactly match the input market.
- Probabilities must be finite, within `[0, 1]`, and sum to `1 +/- 0.001`.
- Confidence must be within `[0, 1]`.
- `recommend_outcome` requires a valid `outcomeId`; `pass` requires `null`.
- Every evidence item must reference valid input `factId` values.
- `rationaleSummary`, evidence summaries, and risk summaries have bounded lengths.
- The response must not include model-supplied stake, wallet, order, or real-money actions.

## 4. Provider Transport Rules

- Use native structured output or JSON Schema when the provider supports it.
- Otherwise send the exact schema and parse strict JSON only.
- One bounded repair attempt is allowed for syntactic JSON errors. The repair prompt,
  response, and validation errors must also be stored.
- Do not use a greedy `{...}` regex with silent defaults.
- Schema failure creates an `invalid_response` run. It cannot create a simulated bet.
- Provider metadata, token usage, latency, and raw response are wrapped by the runtime,
  not trusted from model output.

## 5. Normalized Analysis Report

The runtime combines the validated model response with trusted metadata:

```text
AnalysisReport
  identity: runId, game, matchId, marketId, versions, hashes
  provenance: provider, model, prompt artifact IDs, response artifact ID
  dataQuality: completeness, freshness, missing facts, source coverage
  prediction: normalized outcomes, confidence, evidence, risks
  marketComparison: market probabilities, model probabilities, edge
  decision: paper_bet | pass plus deterministic reason codes
  audit: validation status, repair count, latency, token usage, timestamps
```

The UI must show both the standard report and read-only Prompt/Raw Response tabs.
Hidden reasoning is never requested or displayed.

## 6. Deterministic Simulated-Order Boundary

The model recommendation is advisory. `PaperDecisionEngine` independently applies:

1. Schema and evidence validation.
2. Game-board release state.
3. Minimum data completeness and freshness.
4. Market identity and settlement-rule availability.
5. Minimum confidence and edge.
6. Liquidity warning and maximum stake reduction.
7. Per-game, per-provider, daily, and portfolio exposure limits.
8. Idempotency on `(runId, provider, marketId, outcomeId, policyVersion)`.

The resulting simulated order stores model probability, market probability, edge,
stake policy, amount, price, report ID, and full rejection/pass reason codes.

## 7. Persistence Plan

Introduce append-only tables in a new migration:

- `analysis_runs`
- `analysis_prompt_artifacts`
- `analysis_response_artifacts`
- `analysis_reports`
- `analysis_run_events`

Extend or replace legacy `llm_analyses` references with `run_id`, `game`, `market_id`,
`contract_version`, and `validation_status`. Extend simulated bets with `run_id`,
`report_id`, `policy_version`, `game`, `market_kind`, `model_probability`,
`market_probability`, and `edge_at_entry`.

Raw prompt and response artifacts are immutable. Normalized reports may be superseded
only by a new report version linked to the same run.

## 8. Error Taxonomy

| Code | Meaning | Paper order allowed |
| --- | --- | --- |
| `INPUT_INCOMPLETE` | Required normalized facts are missing | No |
| `MARKET_UNALIGNED` | Market cannot be linked to the match | No |
| `PROMPT_BUILD_FAILED` | Canonical prompt package could not be created | No |
| `PROVIDER_FAILED` | Provider request failed or timed out | No |
| `INVALID_RESPONSE` | JSON or schema validation failed | No |
| `EVIDENCE_INVALID` | Evidence references unknown facts | No |
| `POLICY_REJECTED` | Valid analysis failed deterministic risk policy | No |
| `PAPER_ORDER_CREATED` | Local simulated order was created | Yes |
| `SETTLEMENT_PENDING` | Order exists but authoritative result is unavailable | Existing order only |

## 9. Acceptance Tests

- Golden prompt snapshot for each game and supported market kind.
- Cross-provider response-schema fixtures.
- Invalid probability, unknown outcome, hallucinated fact, and oversized text rejection.
- Hash stability and prompt version tests.
- Duplicate-run idempotency test.
- No bet from failed/invalid/low-quality reports.
- One complete prompt-to-paper-order trace for every released game board.
