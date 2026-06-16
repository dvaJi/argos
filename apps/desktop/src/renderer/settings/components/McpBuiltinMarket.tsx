import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";
import { Separator } from "@shadcn/components/ui/separator";
import { useLegacyPresenter } from "@api/legacy/presenters";
import { useToast } from "@/components/use-toast";

interface McpBuiltinMarketProps {
  embedded?: boolean;
  onBack?: () => void;
}

type MarketItem = {
  uuid: string;
  created_at: string;
  updated_at: string;
  name: string;
  author_name: string;
  title: string;
  description: string;
  content?: string;
  server_key: string;
  config_name?: string;
  server_url?: string;
};

export default function McpBuiltinMarket({ embedded = false, onBack }: McpBuiltinMarketProps) {
  const mcpP = useLegacyPresenter("mcpPresenter");
  const { toast } = useToast();

  const [items, setItems] = useState<MarketItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showPullToLoad, setShowPullToLoad] = useState(false);
  const [canPullMore, setCanPullMore] = useState(false);
  const [installedServers, setInstalledServers] = useState<Set<string>>(new Set());
  const [apiKeyInput, setApiKeyInput] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadApiKey = async () => {
    try {
      const key = await mcpP.getMcpRouterApiKey?.();
      setApiKeyInput(key || "");
    } catch {}
  };

  const saveApiKey = async () => {
    try {
      const newKey = apiKeyInput.trim();
      await mcpP.setMcpRouterApiKey?.(newKey);
      if (newKey) {
        await mcpP.updateMcpRouterServersAuth?.(newKey);
      }
      toast({ title: "Saved" });
    } catch (e) {
      toast({ title: "Operation failed", description: String(e), variant: "destructive" });
    }
  };

  const openHowToGetKey = () => {
    window.open("https://mcprouter.co/settings/keys", "_blank");
  };

  const checkInstalledServers = async (currentItems: MarketItem[]) => {
    const installed = new Set<string>();
    for (const item of currentItems) {
      try {
        const isInstalled = await mcpP.isServerInstalled?.("mcprouter", item.server_key);
        if (isInstalled) installed.add(item.server_key);
      } catch (e) {
        console.error("Failed to check installation status:", e);
      }
    }
    setInstalledServers(installed);
  };

  const fetchPage = async (forcePull = false) => {
    if (loading || (!hasMore && !forcePull)) return;
    setLoading(true);
    setShowPullToLoad(false);

    try {
      const data = await mcpP.listMcpRouterServers?.(page, 20);
      const list = data?.servers || [];
      if (list.length === 0) {
        setHasMore(false);
        setCanPullMore(false);
        return;
      }
      const newItems = [...items, ...list];
      setItems(newItems);
      setPage((p) => p + 1);
      await checkInstalledServers(newItems);
      if (forcePull) {
        setHasMore(true);
        setCanPullMore(true);
      }
    } catch (e) {
      toast({ title: "Operation failed", description: String(e), variant: "destructive" });
      if (forcePull) setCanPullMore(false);
    } finally {
      setLoading(false);
    }
  };

  const onScroll = () => {
    const el = scrollContainerRef.current;
    if (!el || loading) return;

    const { scrollTop, clientHeight, scrollHeight } = el;
    const nearBottom = scrollTop + clientHeight >= scrollHeight - 400;

    if (hasMore && nearBottom) {
      fetchPage();
      return;
    }

    if (!hasMore) {
      const atBottom = scrollTop + clientHeight >= scrollHeight - 50;
      const overScroll = scrollTop + clientHeight > scrollHeight;
      const contentTooShort = scrollHeight <= clientHeight;

      if ((atBottom || overScroll || contentTooShort) && !canPullMore) {
        setCanPullMore(true);
        setShowPullToLoad(true);
      }

      if (canPullMore && (overScroll || (contentTooShort && scrollTop > 0))) {
        fetchPage(true);
      }
    }
  };

  const install = async (item: MarketItem) => {
    try {
      if (!apiKeyInput.trim()) {
        toast({
          title: "API Key Required",
          description: "Please enter your MCP Router API key first.",
          variant: "destructive",
        });
        return;
      }
      await mcpP.setMcpRouterApiKey?.(apiKeyInput.trim());
      const ok = await mcpP.installMcpRouterServer?.(item.server_key);
      if (ok) {
        toast({ title: "Installed successfully" });
        setInstalledServers((prev) => new Set([...prev, item.server_key]));
      } else {
        toast({ title: "Installation failed", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Installation failed", description: String(e), variant: "destructive" });
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadApiKey();
      await fetchPage();
      setTimeout(() => {
        const el = scrollContainerRef.current;
        if (el && !hasMore) {
          const contentTooShort = el.scrollHeight <= el.clientHeight;
          if (contentTooShort && items.length > 0) {
            setCanPullMore(true);
            setShowPullToLoad(true);
          }
        }
      }, 100);
    };
    init();
  }, []);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="p-4 sticky top-0 z-10 flex items-center gap-2">
        {embedded && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onBack}>
            <Icon icon="lucide:chevron-left" className="w-4 h-4 mr-1" />
            Back
          </Button>
        )}

        <div className="flex flex-col">
          <div className="font-medium">MCP Market</div>
          <a
            href="https://mcprouter.co/"
            target="_blank"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Powered by mcprouter.co
          </a>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Input
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            type="password"
            placeholder="API Key"
            className="w-64"
          />
          <Button size="sm" onClick={saveApiKey}>
            Save
          </Button>
        </div>
      </div>

      <div className="px-4 text-xs text-muted-foreground">
        Enter your API key to install servers.{" "}
        <Button
          variant="link"
          size="sm"
          className="text-xs p-0 h-auto font-normal text-primary hover:underline"
          onClick={openHowToGetKey}
        >
          How to get a key
        </Button>
        <Separator className="mt-4" />
      </div>

      <div className="flex-1 overflow-auto" ref={scrollContainerRef} onScroll={onScroll}>
        <div className="p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 items-stretch">
          {items.map((item) => (
            <div
              key={item.uuid}
              className="border rounded-lg p-3 bg-card hover:bg-accent/30 transition-colors flex flex-col h-full"
            >
              <div className="text-xs text-muted-foreground">{item.author_name}</div>
              <div className="text-sm font-semibold mt-1 line-clamp-1" title={item.title}>
                {item.title}
              </div>
              <div
                className="text-xs mt-1 text-muted-foreground line-clamp-3 min-h-0 overflow-hidden"
                title={item.description}
              >
                {item.description}
              </div>
              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between mt-auto">
                <span className="text-xs font-mono px-2 py-0.5 bg-muted rounded truncate" title={item.server_key}>
                  {item.server_key}
                </span>
                <Button
                  size="sm"
                  variant={installedServers.has(item.server_key) ? "secondary" : "outline"}
                  disabled={installedServers.has(item.server_key)}
                  onClick={() => install(item)}
                  title={installedServers.has(item.server_key) ? "Installed" : "Install"}
                  className="w-full md:w-auto"
                >
                  <Icon
                    icon={installedServers.has(item.server_key) ? "lucide:check" : "lucide:download"}
                    className="w-3.5 h-3.5 mr-1"
                  />
                  {installedServers.has(item.server_key) ? "Installed" : "Install"}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            <Icon icon="lucide:loader-2" className="inline w-4 h-4 animate-spin mr-1" />
            Loading...
          </div>
        )}
        {showPullToLoad && !loading && (
          <div className="py-4 text-center text-xs text-muted-foreground">Pull down to load more</div>
        )}
        {!hasMore && !showPullToLoad && items.length > 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">No more items</div>
        )}
        {!loading && items.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">No items available</div>
        )}
      </div>
    </div>
  );
}
