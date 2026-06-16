import { nativeImage, Notification, NotificationConstructorOptions } from "electron";
import icon from "../../../resources/icon.png?asset";
import { eventBus, SendTarget } from "@/eventbus";
import { NOTIFICATION_EVENTS } from "@/events";
import { presenter } from ".";

interface NotificationItem {
  id: string;
  notification: Notification;
}

export class NotificationPresenter {
  private notifications: Map<string, NotificationItem> = new Map();

  /**
   * Show a system notification.
   */
  async showNotification(options: { id: string; title: string; body: string; silent?: boolean }) {
    const notificationsEnabled = presenter.configPresenter.getNotificationsEnabled();
    if (!notificationsEnabled) {
      return;
    }

    // Clear first if a notification with the same ID already exists
    this.clearNotification(options.id);

    const iconFile = nativeImage.createFromPath(icon);
    const notificationOptions: NotificationConstructorOptions = {
      title: options.title,
      body: options.body,
      silent: options.silent,
      // Additional options (e.g. icon) can be added here as needed
      icon: iconFile,
    };

    const notification = new Notification(notificationOptions);

    notification.on("click", () => {
      eventBus.sendToRenderer(NOTIFICATION_EVENTS.SYS_NOTIFY_CLICKED, SendTarget.ALL_WINDOWS, options.id);
      this.clearNotification(options.id);
    });

    // Remove from the managed map automatically when the notification closes
    notification.on("close", () => {
      this.notifications.delete(options.id);
    });

    this.notifications.set(options.id, {
      id: options.id,
      notification,
    });

    notification.show();

    return options.id;
  }

  /**
   * Clear the notification with the given ID.
   */
  clearNotification(id: string) {
    const notificationItem = this.notifications.get(id);
    if (notificationItem) {
      // Electron's Notification has no direct close method, but destroying the object dismisses it
      // We rely on GC here, removing the reference from the Map
      this.notifications.delete(id);
    }
  }

  /**
   * Clear all notifications.
   */
  clearAllNotifications() {
    this.notifications.forEach((item) => {
      this.clearNotification(item.id);
    });
    this.notifications.clear();
  }
}
