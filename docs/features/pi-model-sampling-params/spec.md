# Pi Model Sampling Parameters

Last reviewed: 2026-08-13

## Background

Pi 0.84.0 added support for arbitrary OpenAI-compatible model sampling parameters via `samplingParams` in model definitions, model overrides, extension providers, and stream options. In pi-ai, `Model.samplingParams?: Record<string, unknown>` supplies default sampling parameters merged into the request body as-is (per-request keys override). Argos embeds Pi as its agent runtime but currently has no way to pass custom sampling parameters (temperature, top_p, frequency_penalty, presence_penalty, etc.) to Pi models; the Pi worker's registered model only carries id/name/api/input/contextWindow/maxTokens/cost.

## Goal

Let users configure arbitrary OpenAI-compatible sampling parameters per model and have them reach the Pi worker's model registration as pi-ai `samplingParams`.

## Success Criteria

- `ModelConfig.samplingParams?: Record<string, unknown>` added and persisted via the existing model-config store.
- `MODEL_META.samplingParams?: Record<string, unknown>` added so model definitions can carry defaults.
- `PiWorkerProvider.model.samplingParams?: Record<string, unknown>` added to the worker protocol.
- `workerProvider()` in `pi-provider-execution.ts` forwards the resolved sampling params (model-config override takes precedence over the model definition) to the worker.
- The Pi worker registers the model with `samplingParams` (flows through the existing spread).
- `ModelConfigDialog` gains a "Sampling Parameters (JSON)" textarea that validates JSON on save.
- Daemon typecheck, renderer typecheck (via desktop/web), and lint/format pass.

## Non-Goals

- No per-prompt/stream sampling overrides; default sampling params at model level only (matches pi-ai `Model.samplingParams` semantics).
- No change to the legacy (non-Pi) provider completion path.
- No new persistence format: reuse `daemonConfigPresenter` model-config store and the existing `MODEL_META` provider persistence.

## References

- Pi changelog 0.84.0 "Advanced custom model sampling": `docs/models.md#sampling-parameters`.
- `Model.samplingParams` in `pi-ai/dist/types.d.ts` (comment: default sampling parameters merged per-request).

## Open Questions

None.