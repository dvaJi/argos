# Plan: Pi Model Sampling Parameters

## Approach

Add an optional `Record<string, unknown>` field at each layer of the existing model-config pipeline so sampling parameters set in the model settings dialog reach the Pi worker's model registration.

1. **Shared types**:
   - `ModelConfig.samplingParams?: Record<string, unknown>` in `packages/shared/src/types/presenters/legacy.presenters.d.ts`.
   - `MODEL_META.samplingParams?: Record<string, unknown>` in `packages/shared/src/types/presenters/llmprovider.presenter.d.ts`.
2. **Protocol** (`apps/daemon/src/host/piWorkerProtocol.ts`): `PiWorkerProvider.model.samplingParams?: Record<string, unknown>`.
3. **Daemon** (`apps/daemon/src/host/pi-provider-execution.ts`): in `workerProvider()`, read `configPresenter.getModelConfig(modelId, provider.id).samplingParams` and prefer it over `model.samplingParams` from the model definition; include the resolved value on the returned worker provider model.
4. **Worker** (`apps/daemon/src/host/piWorker.ts`): the registered model object spreads `...config.provider.model`, so `samplingParams` reaches pi-ai automatically. No code change required beyond the type.
5. **UI** (`packages/ui/src/components/settings/ModelConfigDialog.tsx`): add a JSON textarea bound to a draft string; initialize from `config.samplingParams` (JSON), parse and validate on save, surface a parse error, store as `config.samplingParams`.

## Data Flow

```text
ModelConfigDialog (Sampling Parameters JSON)
  -> setModelConfig -> daemonConfigPresenter.setModelConfig -> modelConfigs store (persisted)
  -> workerProvider() reads getModelConfig().samplingParams (overrides MODEL_META.samplingParams)
  -> PiWorkerInit.provider.model.samplingParams
  -> piWorker.ts createAgentSession model registration spread
  -> pi-ai Model.samplingParams -> merged into each request body
```

## Affected Files

- `packages/shared/src/types/presenters/legacy.presenters.d.ts`
- `packages/shared/src/types/presenters/llmprovider.presenter.d.ts`
- `apps/daemon/src/host/piWorkerProtocol.ts`
- `apps/daemon/src/host/pi-provider-execution.ts`
- `apps/daemon/src/host/piWorker.ts` (type-only, if any)
- `packages/ui/src/components/settings/ModelConfigDialog.tsx`

## Compatibility

- `samplingParams` is optional everywhere; existing configs and providers are unaffected.
- JSON values pass through unmodified; invalid JSON is rejected at the UI, not silently dropped.

## Test Strategy

- Daemon: extend `apps/daemon/test/piWorker.test.ts` (init payload) or a focused unit test asserting `workerProvider()` forwards model-config sampling params into `PiWorkerProvider`.
- Typecheck: `bun run typecheck` (desktop covers the UI) + `apps/daemon` typecheck.
- Full daemon test suite.