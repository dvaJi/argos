import type { IRemoteControlPresenter } from "@argos/shared/presenter";

export interface RemoteRuntimeLifecycle {
  initialize(): Promise<void>;
  destroy(): Promise<void>;
}

export interface RemoteControlPresenterLike extends IRemoteControlPresenter, RemoteRuntimeLifecycle {}
