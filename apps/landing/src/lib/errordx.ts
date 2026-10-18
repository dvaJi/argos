/**
 * ErrorDX client tracking (Sentry-compatible ingest).
 *
 * Initialized once at module load from `src/router.tsx`; the DSN is injected
 * at build time through `VITE_ERRORDX_DSN` (see `.env.example`). Without a
 * DSN the SDK is never loaded, so local/dev builds stay silent.
 */

const dsn: string | undefined = import.meta.env.VITE_ERRORDX_DSN;

export function initErrorDx() {
  if (import.meta.env.SSR || !dsn) return;

  void import("@sentry/browser").then(({ init }) => {
    init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 1.0,
    });
  });
}

export function captureError(error: unknown, context?: { tags?: Record<string, string> }) {
  if (import.meta.env.SSR || !dsn) return;

  void import("@sentry/browser").then((Sentry) => {
    Sentry.captureException(error, context);
  });
}
