"use no memo";
import type { IRemoteControlPresenter } from "@argos/shared/presenter";
import { getPresenterTransport, getRemoteControlPresenterTransport } from "./presenterTransport";
export { getRuntimeWebContentsId } from "./runtime";

interface PresenterOptions {
  safeCall?: boolean;
}

export function useRemoteControlPresenter(options?: PresenterOptions): IRemoteControlPresenter {
  return getRemoteControlPresenterTransport(options);
}

export function getShortcutPresenter(options?: PresenterOptions) {
  return getPresenterTransport("shortcutPresenter", options);
}
