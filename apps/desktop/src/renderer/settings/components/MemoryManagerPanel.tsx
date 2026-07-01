import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Badge } from "@shadcn/components/ui/badge";
import { Input } from "@shadcn/components/ui/input";
import { Textarea } from "@shadcn/components/ui/textarea";
import { ScrollArea } from "@shadcn/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shadcn/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@shadcn/components/ui/alert-dialog";
import { createMemoryClient, type MemoryClient } from "@api/MemoryClient";
import { useToast } from "@/components/use-toast";
import { AGENT_MEMORY_CATEGORIES, type AgentMemoryCategory } from "@shared/types/agent-memory";
import type { MemoryAddResult, MemoryItem, MemoryStatusDto } from "@shared/contracts/routes";

const ADD_CATEGORY_NONE = "none";
const IMPORTANCE_VALUES: Record<string, number> = { low: 0.3, medium: 0.5, high: 0.8 };

type CategoryFilter = AgentMemoryCategory | "all" | "uncategorized";

function statusVariant(status: MemoryItem["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "error" || status === "conflicted") return "destructive";
  if (status === "embedded") return "default";
  if (status === "archived") return "outline";
  return "secondary";
}

function categoryLabel(category: AgentMemoryCategory | null | undefined): string {
  if (category == null) return "Uncategorized";
  return category.replace(/_/g, " ");
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

export interface MemoryManagerPanelProps {
  agentId: string;
  memoryEnabled?: boolean;
  hasEmbeddingConfigured?: boolean;
  client?: MemoryClient;
}

export function MemoryManagerPanel({
  agentId,
  memoryEnabled,
  hasEmbeddingConfigured,
  client,
}: MemoryManagerPanelProps) {
  const { toast } = useToast();
  const memoryClient = useMemo(() => client ?? createMemoryClient(), [client]);

  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [status, setStatus] = useState<MemoryStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MemoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const [showAddForm, setShowAddForm] = useState(false);
  const [addContent, setAddContent] = useState("");
  const [addKind, setAddKind] = useState<"episodic" | "semantic">("semantic");
  const [addCategory, setAddCategory] = useState<string>(ADD_CATEGORY_NONE);
  const [addImportance, setAddImportance] = useState<"low" | "medium" | "high">("medium");
  const [adding, setAdding] = useState(false);

  const memoryDisabled = memoryEnabled === false;
  const addCategorySelected = addCategory !== ADD_CATEGORY_NONE;

  const refreshRequestIdRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;

  const searchActive = searchQuery.trim().length > 0;
  const categoryFilterActive = categoryFilter !== "all";

  const displayedMemories = useMemo(() => {
    const base = searchActive ? searchResults : memories;
    return base.filter((memory) => {
      if (categoryFilter === "all") return true;
      if (categoryFilter === "uncategorized") return memory.category == null;
      return memory.category === categoryFilter;
    });
  }, [searchActive, searchResults, memories, categoryFilter]);

  const emptyMessage = useMemo(() => {
    const base = searchActive ? searchResults : memories;
    if (searchActive && base.length === 0) return "No memories matched your search.";
    if (categoryFilterActive) return "No memories in this category.";
    return "No memories yet.";
  }, [searchActive, categoryFilterActive, searchResults, memories]);

  const notifyActionFailed = useCallback(
    (e?: unknown) => {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: e instanceof Error ? e.message : e ? String(e) : undefined,
      });
    },
    [toast],
  );

  const runSearch = useCallback(
    async (targetAgentId: string, query: string, requestId: number) => {
      setSearching(true);
      setSearchError(null);
      try {
        const results = await memoryClient.search(targetAgentId, query);
        if (requestId !== searchRequestIdRef.current || agentIdRef.current !== targetAgentId) return;
        setSearchResults(results);
      } catch (e) {
        if (requestId !== searchRequestIdRef.current || agentIdRef.current !== targetAgentId) return;
        setSearchResults([]);
        setSearchError(e instanceof Error ? e.message : "Search failed.");
      } finally {
        if (requestId === searchRequestIdRef.current && agentIdRef.current === targetAgentId) {
          setSearching(false);
        }
      }
    },
    [memoryClient],
  );

  const refresh = useCallback(async () => {
    const targetAgentId = agentIdRef.current;
    if (!targetAgentId) return;
    refreshRequestIdRef.current += 1;
    const requestId = refreshRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [list, currentStatus] = await Promise.all([
        memoryClient.list(targetAgentId),
        memoryClient.getStatus(targetAgentId),
      ]);
      if (requestId !== refreshRequestIdRef.current || agentIdRef.current !== targetAgentId) return;
      setMemories(list);
      setStatus(currentStatus);
      if (searchQuery.trim()) {
        searchRequestIdRef.current += 1;
        void runSearch(targetAgentId, searchQuery.trim(), searchRequestIdRef.current);
      }
    } catch (e) {
      if (requestId !== refreshRequestIdRef.current || agentIdRef.current !== targetAgentId) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (requestId === refreshRequestIdRef.current && agentIdRef.current === targetAgentId) {
        setLoading(false);
      }
    }
  }, [memoryClient, runSearch, searchQuery]);

  useEffect(() => {
    void refresh();
  }, [agentId, refresh]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchRequestIdRef.current += 1;
    const requestId = searchRequestIdRef.current;
    if (!query) {
      setSearchResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }
    const targetAgentId = agentIdRef.current;
    searchTimerRef.current = setTimeout(() => {
      void runSearch(targetAgentId, query, requestId);
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, runSearch]);

  const notifyAddOutcome = useCallback(
    (result: MemoryAddResult) => {
      if (result.action === "challenged") {
        toast({ title: "Memory conflicts with an existing one." });
        return;
      }
      if (result.action === "noop") {
        toast({ title: result.reason === "duplicate" ? "Duplicate memory." : "Memory not added." });
        return;
      }
      toast({ title: "Memory added." });
    },
    [toast],
  );

  const resetAddForm = useCallback(() => {
    setShowAddForm(false);
    setAddContent("");
    setAddKind("semantic");
    setAddCategory(ADD_CATEGORY_NONE);
    setAddImportance("medium");
  }, []);

  const handleAdd = useCallback(async () => {
    const content = addContent.trim();
    if (!content || adding || memoryDisabled) return;
    setAdding(true);
    try {
      const importance = IMPORTANCE_VALUES[addImportance];
      const category = addCategorySelected ? (addCategory as AgentMemoryCategory) : undefined;
      const input = category ? { content, category, importance } : { content, kind: addKind, importance };
      const result = await memoryClient.add(agentIdRef.current, input);
      notifyAddOutcome(result);
      resetAddForm();
      await refresh();
    } catch (e) {
      notifyActionFailed(e);
    } finally {
      setAdding(false);
    }
  }, [
    addContent,
    adding,
    memoryDisabled,
    addCategorySelected,
    addCategory,
    addImportance,
    addKind,
    memoryClient,
    agentId,
    notifyAddOutcome,
    resetAddForm,
    refresh,
    notifyActionFailed,
  ]);

  const handleDelete = useCallback(
    async (memoryId: string) => {
      try {
        const ok = await memoryClient.remove(agentIdRef.current, memoryId);
        if (!ok) return notifyActionFailed();
        await refresh();
      } catch (e) {
        notifyActionFailed(e);
      }
    },
    [memoryClient, refresh, notifyActionFailed],
  );

  const handleClear = useCallback(async () => {
    try {
      const removed = await memoryClient.clear(agentIdRef.current);
      if (removed === 0) {
        toast({ title: "Nothing to clear." });
        return;
      }
      setMemories([]);
      setSearchResults([]);
      setStatus((prev) => (prev ? { ...prev, total: 0, pendingEmbedding: 0 } : null));
    } catch (e) {
      notifyActionFailed(e);
    }
  }, [memoryClient, toast, notifyActionFailed]);

  return (
    <div className="w-full">
      {status && status.total > 0 && !hasEmbeddingConfigured && (
        <div className="mb-3 rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
          Embeddings are not configured — recall falls back to keyword search only.
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{memories.length} memories</div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            aria-expanded={showAddForm}
            disabled={memoryDisabled}
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            <Icon icon="lucide:plus" className="mr-1 h-3.5 w-3.5" />
            Add memory
          </Button>
          {memories.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive">
                  <Icon icon="lucide:trash-2" className="mr-1 h-3.5 w-3.5" />
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all memories?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes every memory for this agent. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleClear}
                  >
                    Clear all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {memoryDisabled && (
        <div className="mb-3 rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
          Memory is disabled for this agent — enable it in the agent config to add new memories.
        </div>
      )}

      {showAddForm && (
        <div className="mb-3 space-y-2 rounded-lg border border-border px-3 py-2.5">
          <Textarea
            value={addContent}
            onChange={(e) => setAddContent(e.target.value)}
            className="min-h-16 text-xs"
            placeholder="Write a durable fact or preference in third person…"
          />
          <div className={`grid gap-2 ${addCategorySelected ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            {!addCategorySelected && (
              <Select value={addKind} onValueChange={(v) => setAddKind(v as "episodic" | "semantic")}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semantic" className="text-xs">
                    Semantic
                  </SelectItem>
                  <SelectItem value="episodic" className="text-xs">
                    Episodic
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={addCategory} onValueChange={setAddCategory}>
              <SelectTrigger className="h-8 w-full text-xs" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ADD_CATEGORY_NONE} className="text-xs">
                  No category
                </SelectItem>
                {AGENT_MEMORY_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category} className="text-xs">
                    {categoryLabel(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={addImportance} onValueChange={(v) => setAddImportance(v as "low" | "medium" | "high")}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low" className="text-xs">
                  Low
                </SelectItem>
                <SelectItem value="medium" className="text-xs">
                  Medium
                </SelectItem>
                <SelectItem value="high" className="text-xs">
                  High
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetAddForm}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={adding || addContent.trim().length === 0}
              onClick={handleAdd}
            >
              Add memory
            </Button>
          </div>
        </div>
      )}

      {(memories.length > 0 || searchActive) && (
        <div className="mb-3 space-y-1.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="search"
              className="h-8 text-xs sm:flex-1"
              placeholder="Search memories…"
            />
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
              <SelectTrigger className="h-8 text-xs sm:w-44" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All categories
                </SelectItem>
                {AGENT_MEMORY_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category} className="text-xs">
                    {categoryLabel(category)}
                  </SelectItem>
                ))}
                <SelectItem value="uncategorized" className="text-xs">
                  Uncategorized
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {searchError && <p className="text-[11px] text-destructive">{searchError}</p>}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-destructive">{error}</div>
      ) : displayedMemories.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <ScrollArea className="h-[360px] pr-3">
          <ul className="space-y-2">
            {displayedMemories.map((memory) => (
              <li
                key={memory.id}
                className={`flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 ${
                  memory.status === "archived" ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm">{memory.content}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {memory.kind}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {categoryLabel(memory.category)}
                    </Badge>
                    <Badge variant={statusVariant(memory.status)} className="text-[10px]">
                      {memory.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{formatTime(memory.createdAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive"
                        aria-label="Delete permanently"
                      >
                        <Icon icon="lucide:x" className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this memory?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently removes the memory. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(memory.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}
