import { useCallback } from "react";
import { classifyMarkdownLink, type MarkdownLinkContext } from "./linkTypes";
import { useMarkdownLinkNavigation } from "./useMarkdownLinkNavigation";

interface LinkNodeProps {
  node: {
    href?: string;
    url?: string;
    text?: string;
    title?: string | null;
  };
  linkContext?: MarkdownLinkContext;
  children?: React.ReactNode;
}

export function LinkNode({ node, linkContext, children }: LinkNodeProps) {
  const { navigateLink } = useMarkdownLinkNavigation({
    linkContext,
  });

  const href = node.href ?? node.url ?? "";
  const linkText = node.text?.trim() || href;

  const target = classifyMarkdownLink(href);
  const isLocalOrFragment = target.kind === "local-file" || target.kind === "fragment";
  const baseClass = "cursor-pointer underline decoration-from-font hover:opacity-80";
  const colorClass = isLocalOrFragment ? "text-purple-600 dark:text-purple-400" : "text-blue-600 dark:text-blue-400";
  const linkClass = `${baseClass} ${colorClass}`;

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      void navigateLink(href, event.nativeEvent);
    },
    [href, navigateLink],
  );

  return (
    <a href={href} className={linkClass} title={node.title ?? undefined} onClick={handleClick}>
      {children ?? linkText}
    </a>
  );
}
