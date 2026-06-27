import {
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { createSessionClient } from "@api/SessionClient";
import { useArtifactStore } from "@/stores/artifact";
import { showReference, hideReference } from "@/stores/reference";
import { useThemeStore } from "@/stores/theme";
import { useUiSettingsStore, getFormattedCodeFontFamily } from "@/stores/uiSettingsStore";
import { nanoid } from "nanoid";
import { LinkNode } from "./LinkNode";
import { CodeBlock, type CodeBlockNodeData } from "./CodeBlock";
import { MermaidBlock } from "./MermaidBlock";
import { useMarkdownLinkNavigation } from "./useMarkdownLinkNavigation";
import type { MarkdownLinkContext } from "./linkTypes";

import "katex/dist/katex.min.css";
import "./code-highlight.css";

interface MarkdownRendererProps {
  content: string;
  debug?: boolean;
  messageId?: string;
  threadId?: string;
  linkContext?: MarkdownLinkContext;
  smoothStreaming?: boolean;
  onCopy?: (text: string) => void;
}

interface ReferenceNodeData {
  id: string;
  url?: string;
  text?: string;
}

/**
 * Recursively extract plain text from ReactNode children. Guards against
 * children being an array (which would comma-join via String()) or React
 * elements (which stringify to "[object Object]").
 */
function extractNodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractNodeText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

/**
 * Strip a single trailing newline from the last text segment of ReactNode
 * children so highlighted code blocks don't render an extra blank line.
 */
function stripTrailingNewline(node: ReactNode): ReactNode {
  if (typeof node === "string") return node.replace(/\n$/, "");
  if (Array.isArray(node) && node.length > 0) {
    const next = node.slice();
    next[next.length - 1] = stripTrailingNewline(next[next.length - 1]);
    return next;
  }
  return node;
}

// Stable plugin arrays so ReactMarkdown doesn't re-render from new references each pass.
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeKatex, rehypeHighlight];

export function MarkdownRenderer({
  content,
  messageId,
  threadId,
  linkContext,
  smoothStreaming = true,
}: MarkdownRendererProps) {
  const themeStore = useThemeStore();
  const uiSettingsStore = useUiSettingsStore();
  const artifactStore = useArtifactStore();
  const sessionClient = useMemo(() => createSessionClient(), []);
  const referenceNodeRef = useRef<HTMLElement | null>(null);

  const fallbackMessageId = useMemo(() => `artifact-msg-${nanoid()}`, []);
  const fallbackThreadId = useMemo(() => `artifact-thread-${nanoid()}`, []);

  const effectiveMessageId = messageId ?? fallbackMessageId;
  const effectiveThreadId = threadId ?? fallbackThreadId;

  const effectiveLinkContext = useMemo<MarkdownLinkContext>(() => {
    if (linkContext) return linkContext;
    return { source: "chat", sessionId: threadId };
  }, [linkContext, threadId]);

  const { navigateLink } = useMarkdownLinkNavigation({
    linkContext: effectiveLinkContext,
  });

  const searchResultsPromiseRef = useRef<ReturnType<typeof sessionClient.getSearchResults> | null>(null);

  const getSearchResults = useCallback(() => {
    searchResultsPromiseRef.current ??= sessionClient.getSearchResults(effectiveMessageId);
    return searchResultsPromiseRef.current;
  }, [sessionClient, effectiveMessageId]);

  useEffect(() => {
    searchResultsPromiseRef.current = null;
  }, [effectiveMessageId]);

  const codeFontFamily = getFormattedCodeFontFamily();

  const [debouncedContent, setDebouncedContent] = useState(content);
  const contentRevisionRef = useRef(0);
  const fastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const revision = ++contentRevisionRef.current;

    const apply = (rev: number, value: string) => {
      if (rev === contentRevisionRef.current) {
        setDebouncedContent(value);
      }
    };

    if (smoothStreaming && content.length > 12_000) {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      slowTimerRef.current = setTimeout(() => apply(revision, content), 96);
    } else {
      if (fastTimerRef.current) clearTimeout(fastTimerRef.current);
      fastTimerRef.current = setTimeout(() => apply(revision, content), 32);
    }

    return () => {
      if (fastTimerRef.current) clearTimeout(fastTimerRef.current);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, [content, smoothStreaming]);

  const handleReferenceClick = useCallback(
    (nodeId: string, event?: MouseEvent) => {
      getSearchResults().then((results) => {
        const index = parseInt(nodeId, 10) - 1;
        if (index >= 0 && index < results.length) {
          void navigateLink(results[index].url, event);
        }
      });
    },
    [getSearchResults, navigateLink],
  );

  const handleReferenceHover = useCallback(
    (nodeId: string, element: HTMLElement | null) => {
      hideReference();
      getSearchResults().then((results) => {
        const index = parseInt(nodeId, 10) - 1;
        if (index >= 0 && index < results.length && element) {
          showReference(results[index], element.getBoundingClientRect());
        }
      });
    },
    [getSearchResults],
  );

  const handlePreviewCode = useCallback(
    (nodeData: CodeBlockNodeData) => {
      artifactStore.showArtifact(
        {
          id: `code-${effectiveMessageId}-${nanoid()}`,
          type: "text/plain",
          title: nodeData.language ?? "Code",
          language: nodeData.language,
          content: nodeData.code,
          status: "loaded",
        },
        effectiveMessageId,
        effectiveThreadId,
        { force: true },
      );
    },
    [artifactStore, effectiveMessageId, effectiveThreadId],
  );

  const components = useMemo(
    () => ({
      a: ({
        href,
        children,
      }: AnchorHTMLAttributes<HTMLAnchorElement> & {
        children?: ReactNode;
      }) => {
        const textContent = typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
        return (
          <LinkNode node={{ href, text: textContent }} linkContext={effectiveLinkContext}>
            {children}
          </LinkNode>
        );
      },
      code: ({
        className: codeClassName,
        children,
        ..._rest
      }: HTMLAttributes<HTMLElement> & {
        children?: ReactNode;
        node?: unknown;
      }) => {
        const match = /language-(\w+)/.exec(codeClassName ?? "");
        const language = match?.[1];
        const codeString = extractNodeText(children).replace(/\n$/, "");

        if (language === "mermaid") {
          return <MermaidBlock node={{ language: "mermaid", code: codeString }} />;
        }

        if (language) {
          return (
            <CodeBlock
              node={{
                type: "code_block",
                language,
                code: codeString,
                raw: codeString,
              }}
              isDark={themeStore.isDark}
              darkTheme="vitesse-dark"
              lightTheme="vitesse-light"
              monacoOptions={{ fontFamily: codeFontFamily }}
              onPreviewCode={
                handlePreviewCode as unknown as (payload: {
                  id: string;
                  artifactType: string;
                  artifactTitle: string;
                  language: string;
                  node: { code: string };
                }) => void
              }
            >
              {stripTrailingNewline(children)}
            </CodeBlock>
          );
        }

        return (
          <code className={codeClassName} {..._rest}>
            {children}
          </code>
        );
      },
      sup: ({ children, ...rest }: HTMLAttributes<HTMLElement> & { children?: ReactNode }) => {
        const textContent = typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
        const id = textContent.replace(/[[\\]]/g, "");

        if (/^\d+$/.test(id)) {
          return (
            <sup
              ref={(el) => {
                referenceNodeRef.current = el;
              }}
              className="cursor-pointer text-blue-600 dark:text-blue-400 hover:opacity-80"
              onClick={(e) => handleReferenceClick(id, e.nativeEvent)}
              onMouseEnter={() => handleReferenceHover(id, referenceNodeRef.current)}
              onMouseLeave={() => hideReference()}
              {...rest}
            >
              {children}
            </sup>
          );
        }

        return <sup {...rest}>{children}</sup>;
      },
    }),
    [
      effectiveLinkContext,
      themeStore.isDark,
      codeFontFamily,
      handlePreviewCode,
      handleReferenceClick,
      handleReferenceHover,
    ],
  );

  return (
    <div className="prose prose-zinc prose-sm dark:prose-invert w-full max-w-none break-all markdown-renderer">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components as Record<string, ComponentType<unknown>>}
      >
        {debouncedContent}
      </ReactMarkdown>
    </div>
  );
}
