import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Badge } from "#shadcn/components/ui/badge";
import { Switch } from "#shadcn/components/ui/switch";
import { createPiPackageClient } from "#api/PiPackageClient";

type PackageEntry = string | { source: string };
type SearchResult = Awaited<ReturnType<ReturnType<typeof createPiPackageClient>["search"]>>[number];

const sourceOf = (entry: PackageEntry) => (typeof entry === "string" ? entry : entry.source);

export default function PiPackagesPanel({ agentId, projectDir }: { agentId: string; projectDir?: string }) {
  const client = useMemo(() => createPiPackageClient(), []);
  const [installed, setInstalled] = useState<PackageEntry[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trusted, setTrusted] = useState(false);

  useEffect(() => {
    let active = true;
    setError("");
    void Promise.all([
      client.list(agentId),
      projectDir ? client.getProjectTrust(agentId, projectDir) : Promise.resolve(false),
    ])
      .then(([packages, projectTrusted]) => {
        if (!active) return;
        setInstalled(packages);
        setTrusted(projectTrusted);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => {
      active = false;
    };
  }, [agentId, client, projectDir]);

  const installedSources = useMemo(() => new Set(installed.map(sourceOf)), [installed]);

  const search = async () => {
    setBusy(true);
    setError("");
    try {
      setResults(await client.search(query));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const install = async (source: string) => {
    setBusy(true);
    try {
      setInstalled(await client.install(agentId, source));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (source: string) => {
    setBusy(true);
    try {
      setInstalled(await client.remove(agentId, source));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            Pi packages
            <Badge variant="outline">{installed.length} installed</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Packages can add Pi extensions, tools, skills, prompts, themes, and providers to this agent. Install only
            packages you trust: their code runs in the agent worker with access to the agent workspace.
          </p>
        </div>
        {projectDir ? (
          <label className="flex items-center gap-2 text-xs">
            Trust project resources
            <Switch
              checked={trusted}
              disabled={busy}
              onCheckedChange={(value) => {
                setBusy(true);
                void client
                  .setProjectTrust(agentId, projectDir, value)
                  .then(setTrusted)
                  .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
                  .finally(() => setBusy(false));
              }}
            />
          </label>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void search()}
          placeholder="Search npm packages tagged pi-package"
        />
        <Button variant="outline" disabled={busy} onClick={() => void search()}>
          <Icon icon="lucide:search" className="mr-2 h-4 w-4" />
          Search
        </Button>
      </div>

      {error ? <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}

      {installed.length ? (
        <div className="space-y-2">
          {installed.map((entry) => {
            const source = sourceOf(entry);
            return (
              <div key={source} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <code className="text-xs">{source}</code>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(source)}>
                  Remove
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

      {results.length ? (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {results.map((item) => (
            <div key={item.name} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {item.name}
                  <span className="text-[10px] text-muted-foreground">{item.version}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.description || "No description"}</p>
              </div>
              <Button
                size="sm"
                disabled={busy || installedSources.has(item.name)}
                onClick={() => void install(item.name)}
              >
                {installedSources.has(item.name) ? "Installed" : "Install"}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
