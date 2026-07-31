import type { IShortcutPresenter } from "@argos/shared/presenter";
import { getShortcutPresenter } from "./presenterBridge";

const defaultShortcutPresenter = getShortcutPresenter();

export function createShortcutRuntime(presenter: IShortcutPresenter = defaultShortcutPresenter) {
  function registerShortcuts() {
    presenter.registerShortcuts();
  }

  function destroy() {
    presenter.destroy();
  }

  return {
    registerShortcuts,
    destroy,
  };
}

type ShortcutRuntime = ReturnType<typeof createShortcutRuntime>;
