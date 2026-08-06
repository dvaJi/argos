import { createHighlighter } from "@tanstack/highlight/core";
import { css } from "@tanstack/highlight/languages/css";
import { diff } from "@tanstack/highlight/languages/diff";
import { dockerfile } from "@tanstack/highlight/languages/dockerfile";
import { env } from "@tanstack/highlight/languages/env";
import { html } from "@tanstack/highlight/languages/html";
import { http } from "@tanstack/highlight/languages/http";
import { js } from "@tanstack/highlight/languages/js";
import { json } from "@tanstack/highlight/languages/json";
import { jsx } from "@tanstack/highlight/languages/jsx";
import { markdown } from "@tanstack/highlight/languages/markdown";
import { nginx } from "@tanstack/highlight/languages/nginx";
import { plaintext } from "@tanstack/highlight/languages/plaintext";
import { python } from "@tanstack/highlight/languages/python";
import { shell } from "@tanstack/highlight/languages/shell";
import { sql } from "@tanstack/highlight/languages/sql";
import { toml } from "@tanstack/highlight/languages/toml";
import { ts } from "@tanstack/highlight/languages/ts";
import { tsx } from "@tanstack/highlight/languages/tsx";
import { yaml } from "@tanstack/highlight/languages/yaml";

/**
 * Shared, module-scope highlighter for chat code blocks. TanStack Highlight
 * is synchronous and tree-shakeable: only the languages above are bundled and
 * one instance is reused across every render. Unknown language names fall back
 * to escaped plaintext.
 */
export const highlighter = createHighlighter({
  languages: [
    css,
    diff,
    dockerfile,
    env,
    html,
    http,
    js,
    json,
    jsx,
    markdown,
    nginx,
    plaintext,
    python,
    shell,
    sql,
    toml,
    ts,
    tsx,
    yaml,
  ],
});
