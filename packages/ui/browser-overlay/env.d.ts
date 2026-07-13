/// <reference types="vite/client" />

import type { YoBrowserActivityPayload } from "@argos/shared/types/browser";

declare global {
  interface Window {
    yoBrowserOverlay: {
      onActivityChanged: (callback: (payload: YoBrowserActivityPayload) => void) => () => void;
    };
  }
}

export {};
