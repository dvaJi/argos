import { useCallback, useMemo, useState, Fragment, type ReactNode } from "react";
import { Icon } from "@iconify/react";
import { highlighter } from "./highlight";

export interface CodeBlockNodeData {
  type?: "code_block";
  language?: string;
  code: string;
  raw?: string;
  diff?: boolean;
  originalCode?: string;
  updatedCode?: string;
}

interface CodeBlockProps {
  node: CodeBlockNodeData;
  isDark?: boolean;
  darkTheme?: string;
  lightTheme?: string;
  themes?: string[];
  showHeader?: boolean;
  isShowPreview?: boolean;
  showCopyButton?: boolean;
  showExpandButton?: boolean;
  showPreviewButton?: boolean;
  showFontSizeButtons?: boolean;
  monacoOptions?: Record<string, unknown>;
  className?: string;
  /** Optional pre-highlighted React nodes; when omitted the block is tokenized in-app. */
  children?: ReactNode;
  onPreviewCode?: (payload: {
    id: string;
    artifactType: string;
    artifactTitle: string;
    language: string;
    node: { code: string };
  }) => void;
}

const HEADER_BUTTON_CLASSES =
  "flex h-[22px] w-[22px] items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dc-motion-fast) ease-(--dc-ease-out-soft) hover:bg-foreground/10 hover:text-foreground";

function HighlightedCode({ code, lang }: { code: string; lang: string }) {
  const { tokens } = useMemo(() => highlighter.tokenize(code, { lang }), [code, lang]);
  return (
    <>
      {tokens.map((token, index) =>
        token.className ? (
          <span key={index} className={`th-${token.className}`}>
            {token.value}
          </span>
        ) : (
          <Fragment key={index}>{token.value}</Fragment>
        ),
      )}
    </>
  );
}

export function CodeBlock({ node, showHeader = true, showCopyButton = true, className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(node.code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [node.code]);

  const lang = node.language || "";

  return (
    <div
      className={`not-prose my-[0.65rem] overflow-hidden rounded-xl border border-border bg-muted/75 ${className ?? ""}`}
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted py-1 pl-[0.7rem] pr-1.5">
          <span className="min-w-0 truncate font-mono text-[0.6875rem] text-muted-foreground">{lang || "text"}</span>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label={wrapped ? "Disable line wrapping" : "Enable line wrapping"}
              aria-pressed={wrapped}
              onClick={() => setWrapped((prev) => !prev)}
              className={HEADER_BUTTON_CLASSES}
            >
              <Icon icon="lucide:wrap-text" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {showCopyButton && (
              <button type="button" aria-label="Copy code" onClick={handleCopy} className={HEADER_BUTTON_CLASSES}>
                <Icon icon={copied ? "lucide:check" : "lucide:copy"} className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
      <pre
        data-wrap={wrapped}
        className={`m-0 overflow-auto px-2.5 py-2 text-[0.75rem] leading-5 ${wrapped ? "whitespace-pre-wrap wrap-anywhere" : ""}`}
      >
        <code className={`font-mono ${lang ? `language-${lang}` : ""}`}>
          {children ?? <HighlightedCode code={node.code} lang={lang} />}
        </code>
      </pre>
    </div>
  );
}
