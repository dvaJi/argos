/**
 * Markdown Worker Lifecycle
 *
 * Previously managed KaTeX and Mermaid web workers for markstream-vue.
 * Now a no-op stub — KaTeX is handled by rehype-katex, Mermaid by the
 * mermaid library directly, and code blocks are rendered as plain text.
 * Kept as a module to preserve the import path for callers that haven't
 * been updated yet.
 */

let initialized = false;

function _resetForTesting(): void {
  initialized = false;
}

export async function ensureMarkdownWorkers(): Promise<void> {
  initialized = true;
}

function areMarkdownWorkersInitialized(): boolean {
  return initialized;
}
