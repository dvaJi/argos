/**
 * Ambient types for the Cloudflare Workers runtime modules accessed from
 * server-side code. The full runtime/globals are emitted by `wrangler types`
 * into `worker-configuration.d.ts` (generated); this file only declares the
 * `cloudflare:workers` module import used by the OAuth callback so that
 * `tsc --noEmit` resolves without pulling the generated runtime globals into
 * the DOM-lib type graph.
 */
declare module "cloudflare:workers" {
  export const env: {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    OAUTH_DEEPLINK_SCHEME?: string;
  };
}
