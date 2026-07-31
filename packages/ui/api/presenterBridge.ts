"use no memo";
import type { IPresenter } from "@argos/shared/presenter";
import { type IRemoteControlPresenter } from "@argos/shared/presenter";
import {
  getPresenterTransport,
  getRemoteControlPresenterTransport,
  usePresenterTransport,
  useRemoteControlPresenterTransport,
} from "./presenterTransport";
export { getRuntimeWebContentsId } from "./runtime";

interface PresenterOptions {
  safeCall?: boolean;
}

export function usePresenter<T extends keyof IPresenter>(name: T, options?: PresenterOptions): IPresenter[T] {
  return usePresenterTransport(name, options);
}

export function useRemoteControlPresenter(options?: PresenterOptions): IRemoteControlPresenter {
  return useRemoteControlPresenterTransport(options);
}

function getRemoteControlPresenter(options?: PresenterOptions): IRemoteControlPresenter {
  return getRemoteControlPresenterTransport(options);
}

function useShortcutPresenter(options?: PresenterOptions) {
  return usePresenter("shortcutPresenter", options);
}

export function getShortcutPresenter(options?: PresenterOptions) {
  return getPresenterTransport("shortcutPresenter", options);
}
