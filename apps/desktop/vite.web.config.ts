import path from "node:path";
import { resolve } from "path";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";
import { createPathAliasPlugin } from "./vite-plugins/path-alias";

/**
 * Separate Vite config for the daemon-served web build.
 *
 * Produces browser-ready assets in out/web/ from src/renderer/web/.
 * Excludes Electron-specific plugins (electronSimple, electronAssetPlugin,
 * monacoEditorPlugin) â€” the web entry uses WebSocketBridge, not IPC.
 */

export default defineConfig(() => {
  const projectRoot = resolve(".");

  const daemonPort = parseInt(process.env.DAEMON_PORT || "9527", 10);

  return {
    root: resolve("src/renderer/web"),
    server: {
      port: 5180,
      proxy: {
        "/api": { target: `http://127.0.0.1:${daemonPort}`, changeOrigin: true, ws: true },
      },
    },
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
      createPathAliasPlugin({
        projectRoot,
        rendererSrcDir: path.join(projectRoot, "src", "renderer", "src"),
        sharedPkgDir: path.join(projectRoot, "..", "..", "packages", "shared", "src"),
        contractsPkgDir: path.join(projectRoot, "..", "..", "packages", "shared-contracts", "src"),
        apiDir: path.join(projectRoot, "src", "renderer", "api"),
        shadcnDir: path.join(projectRoot, "src", "shadcn"),
        settingsDir: path.join(projectRoot, "src", "renderer", "settings"),
      }),
      tailwindcss(),
      react(),
      babel({
        presets: [reactCompilerPreset()],
      }),
    ],
  };
});
