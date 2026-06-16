import { presenter } from "@/presenter";

export function handleShowHiddenWindow(mustShow: boolean) {
  const allWindows = presenter.windowPresenter.getAllWindows();
  if (allWindows.length === 0) {
    presenter.windowPresenter.createAppWindow({
      initialRoute: "chat",
    });
  } else {
    // Find target window (focused window or the first one)
    const targetWindow = presenter.windowPresenter.getFocusedWindow() || allWindows[0];

    if (!targetWindow.isDestroyed()) {
      // Logic: if window is visible and not triggered from tray click, hide it; otherwise show and focus
      if (targetWindow.isVisible() && !mustShow) {
        presenter.windowPresenter.hide(targetWindow.id);
      } else {
        presenter.windowPresenter.show(targetWindow.id);
        targetWindow.focus(); // Ensure window is brought to front
      }
    } else {
      console.warn("Target window for SHOW_HIDDEN_WINDOW event is destroyed."); // Keep as warn
      // If target window is destroyed, create a new window
      presenter.windowPresenter.createAppWindow({
        initialRoute: "chat",
      });
    }
  }
}
