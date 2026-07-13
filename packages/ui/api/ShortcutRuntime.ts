import type { IShortcutPresenter } from "@argos/shared/presenter";
import { getLegacyShortcutPresenter } from "./legacy/presenters";

const defaultShortcutPresenter = getLegacyShortcutPresenter();

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

export type ShortcutRuntime = ReturnType<typeof createShortcutRuntime>;
