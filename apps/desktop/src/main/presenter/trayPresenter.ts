import { Tray, Menu, app, nativeImage, NativeImage } from "electron";
import * as path from "path";
import { eventBus } from "#/eventbus";
import { TRAY_EVENTS } from "#/events";

const trayMenuLabels = {
  open: "Open/Hide",
  checkForUpdates: "Check for Updates",
  quit: "Quit",
} as const;

export class TrayPresenter {
  private tray: Tray | null = null;
  private iconPath: string;

  constructor() {
    this.iconPath = path.join(app.getAppPath(), "resources");
  }

  private createTray() {
    // Choose an icon based on the platform
    let image: NativeImage | undefined = undefined;

    if (process.platform === "darwin") {
      // macOS platform
      image = nativeImage.createFromPath(path.join(this.iconPath, "macTrayTemplate.png"));
      image = image.resize({ width: 24, height: 24 });
      image.setTemplateImage(true);
    } else if (process.platform === "win32") {
      // Windows platform
      image = nativeImage.createFromPath(path.join(this.iconPath, "win_tray.ico"));
    } else {
      // Linux and other platforms
      image = nativeImage.createFromPath(path.join(this.iconPath, "linux_tray.png"));
      // Linux typically uses a smaller icon size
      image = image.resize({ width: 22, height: 22 });
    }

    this.tray = new Tray(image);
    this.tray.setToolTip("Argos");

    const labels = trayMenuLabels;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: labels.open,
        click: () => {
          eventBus.sendToMain(TRAY_EVENTS.SHOW_HIDDEN_WINDOW);
        },
      },
      {
        label: labels.checkForUpdates,
        click: () => {
          eventBus.sendToMain(TRAY_EVENTS.CHECK_FOR_UPDATES);
        },
      },
      {
        label: labels.quit,
        click: async () => {
          app.quit(); // Exit trigger: tray menu
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);

    // Show the window when the tray icon is clicked
    this.tray.on("click", () => {
      eventBus.sendToMain(TRAY_EVENTS.SHOW_HIDDEN_WINDOW, true);
    });
  }

  public init(): void {
    this.createTray();
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
