import path from "node:path";
import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

/**
 * Separate Vite config for the daemon-served web build.
 *
 * Produces browser-ready assets in out/web/ from src/renderer/web/.
 * Excludes Electron-specific plugins (electronSimple, electronAssetPlugin,
 * monacoEditorPlugin) — the web entry uses WebSocketBridge, not IPC.
 */

function pathAliasPlugin(projectRoot: string): Plugin {
  const rendererSrcDir = path.join(projectRoot, "src", "renderer", "src");
  const sharedPkgDir = path.join(projectRoot, "..", "..", "packages", "shared", "src");
  const contractsPkgDir = path.join(projectRoot, "..", "..", "packages", "shared-contracts", "src");
  const apiDir = path.join(projectRoot, "src", "renderer", "api");
  const shadcnDir = path.join(projectRoot, "src", "shadcn");
  const toFwd = (p: string) => p.split(path.sep).join("/");

  return {
    name: "argos:path-alias",
    enforce: "pre",
    async resolveId(source, importer, resolveOpts) {
      let aliasedPath: string | null = null;

      if (source.startsWith("@/")) {
        aliasedPath = path.resolve(rendererSrcDir, source.slice(2));
      } else if (source.startsWith("@shared/contracts/")) {
        aliasedPath = path.resolve(contractsPkgDir, source.slice("@shared/contracts/".length));
      } else if (source.startsWith("@shared/")) {
        aliasedPath = path.resolve(sharedPkgDir, source.slice(8));
      } else if (source.startsWith("@api/")) {
        aliasedPath = path.resolve(apiDir, source.slice(5));
      } else if (source.startsWith("@shadcn/")) {
        aliasedPath = path.resolve(shadcnDir, source.slice(8));
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

export default defineConfig(({ mode }) => {
  const projectRoot = resolve(".");

  return {
    root: resolve("src/renderer/web"),
    resolve: {
      alias: [
        {
          find: "@shared/contracts",
          replacement: path.resolve(projectRoot, "..", "..", "packages", "shared-contracts", "src"),
        },
        { find: "@shared", replacement: path.resolve(projectRoot, "..", "..", "packages", "shared", "src") },
        { find: "@api", replacement: resolve("src/renderer/api") },
        { find: "@shadcn", replacement: resolve("src/shadcn") },
      ],
    },
    build: {
      outDir: resolve("out/web"),
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          index: resolve("src/renderer/web/index.html"),
        },
      },
    },
    plugins: [
      pathAliasPlugin(projectRoot),
      react(),
      babel({
        presets: [reactCompilerPreset()],
      }),
    ],
  };
});
