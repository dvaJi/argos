import path from "node:path";
import type { Plugin } from "vite";

const toFwd = (p: string) => p.split(path.sep).join("/");

export type PathAliasOptions = {
  projectRoot: string;
  rendererSrcDir: string;
  sharedPkgDir: string;
  contractsPkgDir: string;
  apiDir: string;
  shadcnDir: string;
  settingsDir?: string;
};

/**
 * Path-aware alias resolver for the web/UI build.
 *
 * Unlike the Electron config, there is no `mainDir`: `#/` always
 * resolves to `rendererSrcDir` because the UI package contains only
 * renderer code (the Electron main process lives in @argos/desktop).
 */
export function createPathAliasPlugin(opts: PathAliasOptions): Plugin {
  return {
    name: "argos:path-alias",
    enforce: "pre",
    async resolveId(source, importer, resolveOpts) {
      let aliasedPath: string | null = null;

      if (source.startsWith("#/")) {
        aliasedPath = path.resolve(opts.rendererSrcDir, source.slice(2));
      } else if (source.startsWith("@argos/shared-contracts/")) {
        aliasedPath = path.resolve(opts.contractsPkgDir, source.slice("@argos/shared-contracts/".length));
      } else if (source.startsWith("@argos/shared/")) {
        aliasedPath = path.resolve(opts.sharedPkgDir, source.slice(8));
      } else if (source.startsWith("#api/")) {
        aliasedPath = path.resolve(opts.apiDir, source.slice(5));
      } else if (source.startsWith("#shadcn/")) {
        aliasedPath = path.resolve(opts.shadcnDir, source.slice(8));
      } else if (opts.settingsDir && source.startsWith("#settings/")) {
        aliasedPath = path.resolve(opts.settingsDir, source.slice(10));
      }

      if (!aliasedPath) return null;

      const resolved = await this.resolve(toFwd(aliasedPath), importer, {
        ...resolveOpts,
        skipSelf: true,
      });
      if (resolved && typeof resolved.id === "string") {
        return { ...resolved, id: toFwd(resolved.id) };
      }
      return resolved;
    },
  };
}
