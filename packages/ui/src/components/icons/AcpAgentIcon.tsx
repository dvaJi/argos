import { useEffect, useMemo, useRef, useState } from "react";
import { createConfigClient } from "#api/ConfigClient";

const ACP_REGISTRY_ICON_PREFIX = "https://cdn.agentclientprotocol.com/registry/";

const iconMarkupCache = new Map<string, string | Promise<string>>();

interface AcpAgentIconProps {
  agentId?: string;
  icon?: string;
  alt?: string;
  customClass?: string;
  tone?: "default" | "muted";
  fallbackText?: string;
}

function normalizeSvgMarkup(markup: string): string {
  const trimmed = markup.trim();
  if (!trimmed.startsWith("<svg")) {
    throw new Error("Invalid ACP registry icon markup");
  }
  return trimmed;
}

async function resolveIconMarkup(agentId: string, iconUrl: string): Promise<string> {
  const floatingButtonApi = (
    window as Window & {
      floatingButtonAPI?: {
        getAcpRegistryIconMarkup?: (agentId: string, iconUrl: string) => Promise<string>;
      };
    }
  ).floatingButtonAPI;

  if (typeof floatingButtonApi?.getAcpRegistryIconMarkup === "function") {
    return await floatingButtonApi.getAcpRegistryIconMarkup(agentId, iconUrl);
  }

  return await createConfigClient().getAcpRegistryIconMarkup(agentId, iconUrl);
}

export default function AcpAgentIcon({
  agentId = "",
  icon = "",
  alt = "",
  customClass = "w-4 h-4",
  tone = "default",
  fallbackText = "",
}: AcpAgentIconProps) {
  const [svgMarkup, setSvgMarkup] = useState("");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const requestSeq = useRef(0);

  const trimmedIcon = icon.trim();
  const trimmedAgentId = agentId.trim();

  const isThemeableRegistryIcon = useMemo(
    () => trimmedIcon.startsWith(ACP_REGISTRY_ICON_PREFIX) && trimmedIcon.endsWith(".svg"),
    [trimmedIcon],
  );

  const fallbackLabel = useMemo(() => {
    const value = fallbackText.trim();
    return value ? value.slice(0, 1).toUpperCase() : "?";
  }, [fallbackText]);

  const toneClass = tone === "muted" ? "text-muted-foreground" : "text-foreground";

  const shouldRenderInlineSvg = Boolean(svgMarkup) && isThemeableRegistryIcon;
  const shouldRenderImage = Boolean(trimmedIcon) && !shouldRenderInlineSvg && !isThemeableRegistryIcon;

  useEffect(() => {
    const seq = ++requestSeq.current;
    setSvgMarkup("");
    setImageLoadFailed(false);

    if (!trimmedIcon || !trimmedAgentId || !isThemeableRegistryIcon) return;

    let cancelled = false;

    const load = async () => {
      try {
        const cacheKey = `${trimmedAgentId}:${trimmedIcon}`;
        const cached = iconMarkupCache.get(cacheKey);
        if (typeof cached === "string") {
          if (!cancelled) setSvgMarkup(cached);
          return;
        }

        let pending = cached;
        if (!pending) {
          pending = resolveIconMarkup(trimmedAgentId, trimmedIcon)
            .then((markup) => {
              const normalized = markup ? normalizeSvgMarkup(markup) : "";
              if (normalized) {
                iconMarkupCache.set(cacheKey, normalized);
              } else {
                iconMarkupCache.delete(cacheKey);
              }
              return normalized;
            })
            .catch((error) => {
              iconMarkupCache.delete(cacheKey);
              throw error;
            });

          iconMarkupCache.set(cacheKey, pending);
        }

        const markup = await pending;
        if (!cancelled && seq === requestSeq.current) {
          setSvgMarkup(markup);
        }
      } catch (error) {
        if (!cancelled && seq === requestSeq.current) {
          console.warn("[ACP] Failed to load themed registry icon:", error);
          setSvgMarkup("");
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [trimmedAgentId, trimmedIcon, isThemeableRegistryIcon]);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ${customClass} ${toneClass}`}
    >
      {shouldRenderInlineSvg && (
        <span
          className="acp-registry-icon h-full w-full"
          style={{ display: "block", color: "inherit" }}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      )}
      {shouldRenderImage && !imageLoadFailed && (
        <img src={icon} alt={alt} className="h-full w-full object-contain" onError={() => setImageLoadFailed(true)} />
      )}
      {!shouldRenderInlineSvg && !(shouldRenderImage && !imageLoadFailed) && (
        <span className="flex h-full w-full items-center justify-center rounded-md bg-muted/70 text-[0.72em] font-semibold">
          {fallbackLabel}
        </span>
      )}
    </span>
  );
}
