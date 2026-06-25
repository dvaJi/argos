import { BrowserWindow, Menu, MenuItemConstructorOptions, WebContents, dialog, net } from "electron";
import path from "path";
import sharp from "sharp";

interface ContextMenuOptions {
  webContents: WebContents;
  shouldShowMenu?: (event: Electron.Event, params: Electron.ContextMenuParams) => boolean;
  labels?: Record<string, string>;
  prepend?: (
    defaultActions: MenuItemConstructorOptions[],
    params: Electron.ContextMenuParams,
    webContents: WebContents,
  ) => MenuItemConstructorOptions[];
  append?: (
    defaultActions: MenuItemConstructorOptions[],
    params: Electron.ContextMenuParams,
    webContents: WebContents,
  ) => MenuItemConstructorOptions[];
  menu?: (
    defaultActions: MenuItemConstructorOptions[],
    params: Electron.ContextMenuParams,
    webContents: WebContents,
  ) => MenuItemConstructorOptions[] | Menu;
}

/**
 * Simplified context menu implementation
 * Provides only basic functionality, ensuring correct lifecycle handling and listener cleanup
 */
export default function contextMenu(options: ContextMenuOptions): () => void {
  const disposables: (() => void)[] = [];
  let isDisposed = false;

  console.log("contextMenu: initializing context menu", options.webContents.id);

  // Ensure webContents parameter exists
  if (!options.webContents) {
    console.error("contextMenu: WebContents parameter is missing");
    throw new Error("WebContents is required");
  }

  // Handle context menu events
  const handleContextMenu = (event: Electron.Event, params: Electron.ContextMenuParams) => {
    // console.log('contextMenu: trigger', params.x, params.y, params.mediaType)

    if (isDisposed) {
      return;
    }

    // Check whether the menu should be shown
    if (typeof options.shouldShowMenu === "function" && options.shouldShowMenu(event, params) === false) {
      return;
    }

    // Prepare default menu items - provides basic entries
    let menuItems: MenuItemConstructorOptions[] = [];

    // Handle image right-click menu
    if (params.mediaType === "image") {
      // Copy image option
      menuItems.push({
        id: "copyImage",
        label: options.labels?.copyImage || "Copy Image",
        click: () => {
          options.webContents.copyImageAt(params.x, params.y);
          console.log("contextMenu: copying image", params.srcURL);
        },
      });

      // Save image as option
      menuItems.push({
        id: "saveImage",
        label: options.labels?.saveImage || "Save Image...",
        click: async () => {
          try {
            // Get filename and URL
            let url = params.srcURL || "";
            console.log("contextMenu: all params available:", Object.keys(params));
            console.log("contextMenu: srcURL:", params.srcURL);
            console.log("contextMenu: linkURL:", params.linkURL);
            console.log("contextMenu: pageURL:", params.pageURL);

            // If srcURL is empty, try other possible URL sources
            if (!url && params.linkURL) {
              url = params.linkURL;
            }
            if (!url && params.pageURL) {
              url = params.pageURL;
            }

            console.log("contextMenu: final url:", url);

            if (!url) {
              throw new Error("Could not get image URL; please check the image source");
            }

            let fileName = "image.png";
            let imageBuffer: Buffer | null = null;

            // Check whether it is a base64 data URL
            const isBase64 = url.startsWith("data:image/");
            if (!isBase64) {
              // Regular URL: use the filename from the path
              fileName = path.basename(url || "image.png");
            } else {
              // Base64 URL: use the default filename
              // Try to infer the extension from the MIME type
              const mimeMatch = url.match(/^data:image\/([a-zA-Z0-9]+);base64,/);
              if (mimeMatch && mimeMatch[1]) {
                const ext = mimeMatch[1].toLowerCase();
                fileName = `image.${ext === "jpeg" ? "jpg" : ext}`;
              }
            }

            // Open the save dialog
            const { canceled, filePath } = await dialog.showSaveDialog({
              defaultPath: fileName,
              filters: [
                { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
                { name: "All Files", extensions: ["*"] },
              ],
            });

            if (canceled || !filePath) {
              return;
            }

            console.log("contextMenu: start saving pic", filePath);
            console.log("contextMenu: source URL:", url);

            // Fetch the image data
            if (isBase64) {
              // Handle base64 data
              const base64Data = url.split(",")[1];
              if (!base64Data) {
                throw new Error("Invalid base64 image data");
              }
              imageBuffer = Buffer.from(base64Data, "base64");
            } else {
              // Handle regular URL
              try {
                const response = await net.fetch(url);
                if (!response.ok) {
                  throw new Error(`Failed to download image: ${response.status}`);
                }
                imageBuffer = Buffer.from(await response.arrayBuffer());
              } catch (fetchError) {
                console.error("contextMenu: fetch failed, trying alternative methods:", fetchError);

                // If net.fetch fails, try alternative approaches
                if (url.startsWith("file://")) {
                  // Handle file:// URL
                  const fs = require("fs").promises;
                  const filePath = url.substring(7); // Strip the file:// prefix
                  imageBuffer = await fs.readFile(filePath);
                } else if (url.startsWith("/") || url.match(/^[A-Za-z]:\\/)) {
                  // Handle local file paths (Unix or Windows format)
                  const fs = require("fs").promises;
                  imageBuffer = await fs.readFile(url);
                } else {
                  // Re-throw the original error
                  throw fetchError;
                }
              }
            }

            if (!imageBuffer) {
              throw new Error("Could not get image data");
            }

            // Process the image with sharp and save it
            const fileExt = path.extname(filePath).toLowerCase().substring(1);

            // Process the image format based on the target file extension
            const sharpInstance = sharp(imageBuffer);

            if (fileExt === "jpg" || fileExt === "jpeg") {
              await sharpInstance.jpeg({ quality: 90 }).toFile(filePath);
            } else if (fileExt === "png") {
              await sharpInstance.png().toFile(filePath);
            } else if (fileExt === "webp") {
              await sharpInstance.webp().toFile(filePath);
            } else if (fileExt === "gif") {
              await sharpInstance.gif().toFile(filePath);
            } else {
              // Default: save in the original format
              await sharpInstance.toFile(filePath);
            }

            console.log("contextMenu: pic saved ", filePath);
          } catch (error) {
            console.error("contextMenu: pic save failed", error);
          }
        },
      });

      // Add a separator
      menuItems.push({ type: "separator" });
    }

    // Add basic menu items based on the labels config
    if (params.isEditable) {
      const editFlags = params.editFlags;
      // Add basic edit menu items
      if (editFlags.canCut && params.selectionText) {
        menuItems.push({
          id: "cut",
          label: options.labels?.cut || "Cut",
          role: "cut",
          enabled: true,
        });
      }

      if (editFlags.canCopy && params.selectionText) {
        menuItems.push({
          id: "copy",
          label: options.labels?.copy || "Copy",
          role: "copy",
          enabled: true,
        });
      }

      if (editFlags.canPaste) {
        menuItems.push({
          id: "paste",
          label: options.labels?.paste || "Paste",
          role: "paste",
          enabled: true,
        });
      }
    } else if (params.selectionText) {
      // Text selection outside of an input field
      menuItems.push({
        id: "copy",
        label: options.labels?.copy || "Copy",
        role: "copy",
        enabled: true,
      });

      // Add a separator
      menuItems.push({ type: "separator" });

      // Add the translate option
      menuItems.push({
        id: "translate",
        label: options.labels?.translate || "Translate",
        click: () => {
          options.webContents.send("context-menu-translate", params.selectionText, params.x, params.y);
        },
      });

      // Add the Ask AI option
      menuItems.push({
        id: "askAI",
        label: options.labels?.askAI || "Ask AI",
        click: () => {
          options.webContents.send("context-menu-ask-ai", params.selectionText);
        },
      });
    }

    // Allow consumers to prepend custom items
    if (typeof options.prepend === "function") {
      const prependItems = options.prepend(menuItems, params, options.webContents);
      menuItems = prependItems.concat(menuItems);
    }

    // Allow consumers to append custom items
    if (typeof options.append === "function") {
      const appendItems = options.append(menuItems, params, options.webContents);
      menuItems = menuItems.concat(appendItems);
    }

    // Allow consumers to fully override the menu
    if (typeof options.menu === "function") {
      const customMenu = options.menu(menuItems, params, options.webContents);

      if (Array.isArray(customMenu)) {
        menuItems = customMenu;
      } else {
        // If it is a Menu instance, show it directly
        const window = BrowserWindow.fromWebContents(options.webContents);
        if (window) {
          customMenu.popup({ window });
        }
        return;
      }
    }

    // Clean up separators (avoid consecutive, leading, or trailing separators)
    menuItems = removeUnusedMenuItems(menuItems);

    // Build and display the menu
    if (menuItems.length > 0) {
      try {
        const menu = Menu.buildFromTemplate(menuItems);
        console.log("contextMenu: displaying menu");
        const window = BrowserWindow.fromWebContents(options.webContents);
        if (window) {
          menu.popup({
            window,
            x: params.x,
            y: params.y,
          });
        }
      } catch (error) {
        console.error("contextMenu: create error", error);
      }
    } else {
      console.warn("contextMenu: The menu will not be displayed");
    }
  };

  // Remove redundant separators
  const removeUnusedMenuItems = (menuTemplate: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] => {
    let notDeletedPreviousElement: MenuItemConstructorOptions | undefined;

    return (
      menuTemplate
        // Filter out invisible or undefined items
        .filter((menuItem): menuItem is MenuItemConstructorOptions => {
          return menuItem !== undefined && typeof menuItem === "object" && menuItem.visible !== false;
        })
        // Filter out redundant separators
        .filter((menuItem, index, array) => {
          const toDelete =
            menuItem.type === "separator" &&
            (!notDeletedPreviousElement || index === array.length - 1 || array[index + 1].type === "separator");

          notDeletedPreviousElement = toDelete ? notDeletedPreviousElement : menuItem;
          return !toDelete;
        })
    );
  };

  // Initialize the context menu
  const initialize = (webContents: WebContents) => {
    if (isDisposed) {
      return;
    }

    try {
      // Attach the context-menu event listener
      webContents.on("context-menu", handleContextMenu);

      // Clean up when the WebContents is destroyed
      const cleanup = () => {
        webContents.removeListener("context-menu", handleContextMenu);
      };

      webContents.once("destroyed", cleanup);

      // Register for cleanup
      disposables.push(() => {
        webContents.removeListener("context-menu", handleContextMenu);
        webContents.removeListener("destroyed", cleanup);
      });
    } catch (error) {
      console.error("contextMenu: init error", error);
    }
  };

  // Register the WebContents
  initialize(options.webContents);

  // Return the cleanup function
  return () => {
    if (isDisposed) {
      console.log("contextMenu: already disposed, skipping cleanup");
      return;
    }

    console.log("contextMenu: starting cleanup");
    // Remove all listeners
    for (const dispose of disposables) {
      dispose();
    }

    disposables.length = 0;
    isDisposed = true;
    console.log("contextMenu: cleanup completed");
  };
}
