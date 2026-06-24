/// <reference types="vite/client" />

declare module "*.svg?react" {
  import type { ComponentType, SVGProps } from "react";
  const Component: ComponentType<SVGProps<SVGSVGElement>>;
  export default Component;
}

interface ImportMetaEnv {
  readonly VITE_GITHUB_CLIENT_ID: string;
  readonly VITE_GITHUB_REDIRECT_URI: string;
  readonly VITE_LOG_IPC_CALL: string;
  readonly VITE_PROVIDER_DB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
