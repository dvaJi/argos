/**
 * Cloudflare Worker entry wrapping the TanStack Start server handler with
 * ErrorDX (Sentry-compatible) request tracking.
 *
 * The DSN is read from the `ERRORDX_DSN` Worker binding at runtime - set it
 * with `wrangler secret put ERRORDX_DSN`. Without it the wrapper stays
 * passive and requests pass through untouched.
 */
import { withSentry } from "@sentry/cloudflare";
import serverEntry from "@tanstack/react-start/server-entry";

interface Env {
  ERRORDX_DSN?: string;
}

export default withSentry<Env>(
  (env) => ({
    dsn: env.ERRORDX_DSN,
    environment: "production",
    tracesSampleRate: 1.0,
  }),
  serverEntry,
);
