# Tasks: Pi Model Sampling Parameters

1. [x] Add `samplingParams` to `ModelConfig` (legacy.presenters.d.ts) and `MODEL_META` (llmprovider.presenter.d.ts).
2. [x] Add `samplingParams` to `PiWorkerProvider.model` (piWorkerProtocol.ts).
3. [x] Forward resolved sampling params in `workerProvider()` (pi-provider-execution.ts).
4. [x] Verify `piWorker.ts` registration passes `samplingParams` through (typecheck).
5. [x] Add "Sampling Parameters (JSON)" textarea to `ModelConfigDialog.tsx` with JSON validation.
6. [x] Add daemon test coverage for the sampling params forwarding (config round-trip + worker init payload).
7. [x] Run daemon typecheck + test suite, root typecheck/lint/format.
8. [ ] Mark tasks complete; move folder to `docs/archives/` after merge.