import { useState, useRef, useEffect } from "react";
import { createDeviceClient } from "#api/DeviceClient";
import { usePageCapture } from "#/composables/usePageCapture";
import type { CaptureOptions } from "./types";

/** Restores display styles for elements hidden during capture (module-scope: safe for the React Compiler). */
function restoreCaptureOverlays(captureHiddenElementsRef: { current: HTMLElement[] }): void {
  for (const element of captureHiddenElementsRef.current) {
    const original = element.dataset.captureOriginalDisplay;
    if (original !== undefined) {
      element.style.display = original;
      delete element.dataset.captureOriginalDisplay;
    } else {
      element.style.removeProperty("display");
    }
  }
  captureHiddenElementsRef.current = [];
}

export function useMessageCapture(isDark: boolean) {
  const { isCapturing, captureAndCopy } = usePageCapture();

  const [appVersion, setAppVersion] = useState("");
  const containerCacheRef = useRef<Element | null>(null);
  const captureHiddenElementsRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    const deviceClient = createDeviceClient();
    deviceClient.getAppVersion().then((version) => {
      setAppVersion(version);
    });
  }, []);

  const getContainer = () => {
    if (!containerCacheRef.current) {
      containerCacheRef.current = document.querySelector(".message-list-container");
    }
    return containerCacheRef.current;
  };

  const hideCaptureOverlays = () => {
    const elements = Array.from(document.querySelectorAll(".chat-capture-hide")) as HTMLElement[];
    captureHiddenElementsRef.current = elements;
    elements.forEach((element) => {
      element.dataset.captureOriginalDisplay = element.style.display;
      element.style.display = "none";
    });
  };

  useEffect(() => {
    return () => {
      containerCacheRef.current = null;
      restoreCaptureOverlays(captureHiddenElementsRef);
    };
  }, []);

  const findUserMessageElement = (parentId: string): HTMLElement | null => {
    if (!parentId) return null;
    const userMessageSelector = `[data-message-id="${parentId}"]`;
    const element = document.querySelector(userMessageSelector) as HTMLElement | null;
    if (!element) return null;
    if (!element.classList.contains("user-message-item")) return null;
    return element;
  };

  const calculateMessageGroupRect = (
    messageId: string,
    parentId?: string,
  ): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null => {
    const userMessageElement = parentId ? findUserMessageElement(parentId) : null;
    const assistantMessageElement = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;

    if (!userMessageElement || !assistantMessageElement) {
      if (assistantMessageElement) {
        const rect = assistantMessageElement.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }
      return null;
    }

    const userRect = userMessageElement.getBoundingClientRect();
    const assistantRect = assistantMessageElement.getBoundingClientRect();

    const left = Math.min(userRect.left, assistantRect.left);
    const top = Math.min(userRect.top, assistantRect.top);
    const right = Math.max(userRect.right, assistantRect.right);
    const bottom = Math.max(userRect.bottom, assistantRect.bottom);

    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
    };
  };

  const calculateFromTopToCurrentRect = (
    messageId: string,
  ): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null => {
    const currentMessageElement = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
    if (!currentMessageElement) return null;

    const container = getContainer();
    if (!container) return null;

    const allMessages = container.querySelectorAll("[data-message-id]");
    if (allMessages.length === 0) return null;

    const firstMessage = allMessages[0] as HTMLElement;
    const currentRect = currentMessageElement.getBoundingClientRect();
    const firstRect = firstMessage.getBoundingClientRect();

    const left = Math.min(firstRect.left, currentRect.left);
    const top = Math.min(firstRect.top, currentRect.top);
    const right = Math.max(firstRect.right, currentRect.right);
    const bottom = Math.max(firstRect.bottom, currentRect.bottom);

    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
    };
  };

  const captureMessage = async (options: CaptureOptions): Promise<boolean> => {
    const { messageId, parentId, fromTop = false, modelInfo } = options;

    const getTargetRect = fromTop
      ? () => calculateFromTopToCurrentRect(messageId)
      : () => calculateMessageGroupRect(messageId, parentId);

    hideCaptureOverlays();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise((resolve) => setTimeout(resolve, 60));

    let success = false;
    try {
      success = await captureAndCopy({
        container: ".message-list-container",
        getTargetRect,
        containerHeaderOffset: 0,
        watermark: {
          isDark,
          version: appVersion,
          texts: {
            brand: "Argos",
            tip: "Shared from Argos",
            model: modelInfo?.model_name,
            provider: modelInfo?.model_provider,
          },
        },
      });
      restoreCaptureOverlays(captureHiddenElementsRef);
    } catch (error) {
      restoreCaptureOverlays(captureHiddenElementsRef);
      throw error;
    }

    if (!success) {
      console.error("Screenshot copy failed");
    }

    return success;
  };

  return {
    isCapturing,
    captureMessage,
  };
}
