import { useState, useCallback, useRef } from "react";
import { createDeviceClient } from "#api/DeviceClient";
import { createTabClient } from "#api/TabClient";

interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WatermarkConfig {
  isDark?: boolean;
  version?: string;
  texts?: {
    brand?: string;
    time?: string;
    tip?: string;
    model?: string;
    provider?: string;
  };
}

export interface CaptureConfig {
  container: string | HTMLElement;
  getTargetRect: () => CaptureRect | null;
  watermark?: WatermarkConfig;
  scrollBehavior?: "auto" | "smooth";
  captureDelay?: number;
  maxIterations?: number;
  scrollbarOffset?: number;
  containerHeaderOffset?: number;
  isHTMLIframe?: boolean;
}

export interface CaptureResult {
  success: boolean;
  imageData?: string;
  error?: string;
}

export function usePageCapture() {
  const [isCapturing, setIsCapturing] = useState(false);
  const tabClientRef = useRef(createTabClient());
  const deviceClientRef = useRef(createDeviceClient());

  const getScrollContainer = (container: string | HTMLElement): HTMLElement | null => {
    if (typeof container === "string") {
      return document.querySelector(container) as HTMLElement;
    }
    return container;
  };

  const performScroll = (scrollContainer: HTMLElement, scrollTop: number, isIframe: boolean = false): void => {
    if (isIframe && scrollContainer.tagName.toLowerCase() === "iframe") {
      const iframe = scrollContainer as HTMLIFrameElement;
      if (iframe.contentWindow) {
        iframe.contentWindow.scrollTo(0, scrollTop);
      }
    } else {
      scrollContainer.scrollTop = scrollTop;
    }
  };

  const getScrollTop = (scrollContainer: HTMLElement, isIframe: boolean = false): number => {
    if (isIframe && scrollContainer.tagName.toLowerCase() === "iframe") {
      const iframe = scrollContainer as HTMLIFrameElement;
      if (iframe.contentWindow) {
        return iframe.contentWindow.scrollY || iframe.contentWindow.pageYOffset || 0;
      }
    }
    return scrollContainer.scrollTop;
  };

  const getMaxScrollTop = (scrollContainer: HTMLElement, isIframe: boolean = false): number => {
    if (isIframe && scrollContainer.tagName.toLowerCase() === "iframe") {
      const iframe = scrollContainer as HTMLIFrameElement;
      if (iframe.contentWindow && iframe.contentDocument) {
        const doc = iframe.contentDocument;
        return Math.max(
          doc.body.scrollHeight - iframe.contentWindow.innerHeight,
          doc.documentElement.scrollHeight - iframe.contentWindow.innerHeight,
        );
      }
    }
    return scrollContainer.scrollHeight - scrollContainer.clientHeight;
  };

  const getIframeContentHeight = (iframe: HTMLIFrameElement): number => {
    if (iframe.contentDocument) {
      const doc = iframe.contentDocument;
      return Math.max(
        doc.body.scrollHeight || 0,
        doc.documentElement.scrollHeight || 0,
        doc.body.offsetHeight || 0,
        doc.documentElement.offsetHeight || 0,
      );
    }
    return 0;
  };

  const captureArea = useCallback(
    async (config: CaptureConfig): Promise<CaptureResult> => {
      if (isCapturing) {
        return { success: false, error: "Capture already in progress, please wait..." };
      }

      setIsCapturing(true);
      let originalScrollBehavior = "";
      let scrollContainer: HTMLElement | null = null;

      try {
        const {
          scrollBehavior = "auto",
          captureDelay = 350,
          maxIterations = 30,
          scrollbarOffset = 20,
          containerHeaderOffset = 44,
          isHTMLIframe = false,
        } = config;

        const initialRect = config.getTargetRect();
        if (!initialRect) {
          return { success: false, error: "Unable to get capture target area" };
        }

        if (initialRect.height <= 0) {
          return { success: false, error: "Capture area height is invalid" };
        }

        scrollContainer = getScrollContainer(config.container);
        if (!scrollContainer) {
          return { success: false, error: "Unable to find scroll container" };
        }

        let targetContentHeight = initialRect.height;
        if (isHTMLIframe && scrollContainer.tagName.toLowerCase() === "iframe") {
          const iframe = scrollContainer as HTMLIFrameElement;
          const iframeContentHeight = getIframeContentHeight(iframe);
          if (iframeContentHeight > 0) {
            targetContentHeight = iframeContentHeight;
          }
        }

        originalScrollBehavior = scrollContainer.style.scrollBehavior;
        scrollContainer.style.scrollBehavior = scrollBehavior;

        const containerOriginalScrollTop = getScrollTop(scrollContainer, isHTMLIframe);
        const containerRect = scrollContainer.getBoundingClientRect();
        const contentViewportTop = containerRect.top + containerHeaderOffset;

        const captureWindowVisibleHeight = containerRect.height - containerHeaderOffset;
        const captureWindowVisibleWidth = Math.max(0, containerRect.width - scrollbarOffset);
        if (captureWindowVisibleHeight <= 0 || captureWindowVisibleWidth <= 0) {
          return { success: false, error: "Capture window dimensions are invalid" };
        }

        const fixedCaptureWindow = {
          x: containerRect.left,
          y: contentViewportTop,
          width: captureWindowVisibleWidth,
          height: captureWindowVisibleHeight,
        };

        const maxScrollTopVal = getMaxScrollTop(scrollContainer, isHTMLIframe);
        const imageDataList: string[] = [];
        let totalCapturedContentHeight = 0;
        let iteration = 0;
        const targetTopInContent = containerOriginalScrollTop + (initialRect.y - contentViewportTop);
        const maxCapturableBottomInContent = maxScrollTopVal + fixedCaptureWindow.height;
        const targetBottomInContent = Math.min(targetTopInContent + targetContentHeight, maxCapturableBottomInContent);
        const effectiveTargetContentHeight = Math.max(0, targetBottomInContent - targetTopInContent);

        if (effectiveTargetContentHeight <= 0) {
          return { success: false, error: "Target area is outside capturable range" };
        }

        while (totalCapturedContentHeight < effectiveTargetContentHeight && iteration < maxIterations) {
          iteration++;

          const remainingTopInContent = targetTopInContent + totalCapturedContentHeight;
          const scrollTopTarget = Math.max(0, Math.min(remainingTopInContent, maxScrollTopVal));

          performScroll(scrollContainer, scrollTopTarget, isHTMLIframe);
          await new Promise((resolve) => setTimeout(resolve, captureDelay));

          const actualScrollTop = getScrollTop(scrollContainer, isHTMLIframe);
          const visibleTopInContent = actualScrollTop;
          const visibleBottomInContent = actualScrollTop + fixedCaptureWindow.height;
          const captureTopInContent = Math.max(remainingTopInContent, visibleTopInContent);
          const captureBottomInContent = Math.min(targetBottomInContent, visibleBottomInContent);
          const heightToCaptureFromSegment = Math.max(0, captureBottomInContent - captureTopInContent);

          if (heightToCaptureFromSegment < 1) {
            break;
          }

          const captureStartYInWindow = Math.max(0, Math.round(captureTopInContent - actualScrollTop));

          const captureRect: CaptureRect = {
            x: fixedCaptureWindow.x,
            y: Math.round(fixedCaptureWindow.y + captureStartYInWindow),
            width: fixedCaptureWindow.width,
            height: Math.round(heightToCaptureFromSegment),
          };

          try {
            const segmentData = await tabClientRef.current.captureCurrentArea(captureRect);

            if (segmentData) {
              imageDataList.push(segmentData);
            } else {
              console.error(`[CAPTURE_DEBUG] Iteration ${iteration}: Capture failed, no data returned`);
              break;
            }
          } catch (captureError) {
            console.error(`[CAPTURE_DEBUG] Iteration ${iteration}: Capture error:`, captureError);
            break;
          }

          totalCapturedContentHeight += heightToCaptureFromSegment;
        }

        performScroll(scrollContainer, containerOriginalScrollTop, isHTMLIframe);

        if (imageDataList.length === 0) {
          if (targetContentHeight > 0) {
            return { success: false, error: "Capture failed, no image data captured" };
          }
          return { success: false, error: "Target area height is 0, nothing to capture" };
        }

        let finalImage: string | null = null;
        if (config.watermark) {
          finalImage = await tabClientRef.current.stitchImagesWithWatermark(imageDataList, config.watermark);
        } else {
          finalImage = await tabClientRef.current.stitchImagesWithWatermark(imageDataList, {});
        }

        if (!finalImage) {
          return { success: false, error: "Image stitching failed" };
        }

        return { success: true, imageData: finalImage };
      } catch (error) {
        console.error("Error during capture:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      } finally {
        if (scrollContainer && originalScrollBehavior !== undefined) {
          scrollContainer.style.scrollBehavior = originalScrollBehavior;
        }
        setIsCapturing(false);
      }
    },
    [isCapturing],
  );

  const captureAndCopy = useCallback(
    async (config: CaptureConfig): Promise<boolean> => {
      const result = await captureArea(config);

      if (result.success && result.imageData) {
        deviceClientRef.current.copyImage(result.imageData);
        return true;
      }

      return false;
    },
    [captureArea],
  );

  return {
    isCapturing,
    captureArea,
    captureAndCopy,
  };
}

const createCapturePresets = () => {
  const captureFullConversation = (watermarkConfig?: WatermarkConfig): CaptureConfig => ({
    container: ".message-list-container",
    getTargetRect: () => {
      const container = document.querySelector(".message-list-container");
      if (!container) return null;

      const rect = container.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    },
    watermark: watermarkConfig,
    containerHeaderOffset: 44,
  });

  const captureMessageRange = (
    startMessageId: string,
    endMessageId: string,
    watermarkConfig?: WatermarkConfig,
  ): CaptureConfig => ({
    container: ".message-list-container",
    getTargetRect: () => {
      const startElement = document.querySelector(`[data-message-id="${startMessageId}"]`);
      const endElement = document.querySelector(`[data-message-id="${endMessageId}"]`);

      if (!startElement || !endElement) return null;

      const startRect = startElement.getBoundingClientRect();
      const endRect = endElement.getBoundingClientRect();

      const left = Math.min(startRect.left, endRect.left);
      const top = Math.min(startRect.top, endRect.top);
      const right = Math.max(startRect.right, endRect.right);
      const bottom = Math.max(startRect.bottom, endRect.bottom);

      return {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(right - left),
        height: Math.round(bottom - top),
      };
    },
    watermark: watermarkConfig,
  });

  const captureCustomElement = (
    selector: string,
    containerSelector: string = ".message-list-container",
    watermarkConfig?: WatermarkConfig,
  ): CaptureConfig => ({
    container: containerSelector,
    getTargetRect: () => {
      const element = document.querySelector(selector);
      if (!element) return null;

      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    },
    watermark: watermarkConfig,
  });

  return {
    captureFullConversation,
    captureMessageRange,
    captureCustomElement,
  };
};
