import { useState, useEffect, useRef, useEffectEvent } from "react";
import { Icon } from "@iconify/react";
import { createSessionClient } from "#api/SessionClient";
import { useAgentStore } from "#/stores/ui/agent";
import { Button } from "#shadcn/components/ui/button";
const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 220;
const VISIBLE_EDGE = 40;
const DRAG_EXCLUDED_SELECTOR = 'button, a, input, textarea, select, [role="button"]';
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
export default function TranslatePopup() {
  const sessionClient = createSessionClient();
  const agentStore = useAgentStore();
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [position, setPosition] = useState({
    x: 100,
    y: 100,
  });
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const dragStart = useRef({
    x: 0,
    y: 0,
  });
  const dragBounds = useRef({
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
  });
  const dragFrameId = useRef<number | null>(null);
  const pendingDragPosition = useRef<{
    x: number;
    y: number;
  } | null>(null);
  const getBounds = () => {
    const rect = popupRef.current?.getBoundingClientRect();
    const width = rect?.width || POPUP_WIDTH;
    const height = rect?.height || POPUP_HEIGHT;
    return {
      minX: -(width - VISIBLE_EDGE),
      maxX: window.innerWidth - VISIBLE_EDGE,
      minY: -(height - VISIBLE_EDGE),
      maxY: window.innerHeight - VISIBLE_EDGE,
    };
  };
  const flushPendingDragPosition = () => {
    dragFrameId.current = null;
    if (!pendingDragPosition.current) return;
    const nextPosition = pendingDragPosition.current;
    pendingDragPosition.current = null;
    setPosition(nextPosition);
  };
  const scheduleDragPosition = (x: number, y: number) => {
    pendingDragPosition.current = {
      x,
      y,
    };
    if (dragFrameId.current !== null) return;
    dragFrameId.current = window.requestAnimationFrame(flushPendingDragPosition);
  };
  const stopDrag = () => {
    setIsDraggingActive(false);
    if (dragFrameId.current !== null) {
      window.cancelAnimationFrame(dragFrameId.current);
      dragFrameId.current = null;
    }
    if (pendingDragPosition.current) {
      setPosition(pendingDragPosition.current);
      pendingDragPosition.current = null;
    }
  };
  useEffect(() => {
    if (!isDraggingActive) return;
    const handleDrag = (event: MouseEvent) => {
      const newX = clamp(event.clientX - dragStart.current.x, dragBounds.current.minX, dragBounds.current.maxX);
      const newY = clamp(event.clientY - dragStart.current.y, dragBounds.current.minY, dragBounds.current.maxY);
      scheduleDragPosition(newX, newY);
    };
    const endDrag = () => {
      stopDrag();
    };
    window.addEventListener("pointermove", handleDrag, {
      passive: true,
    });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", handleDrag);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [isDraggingActive, scheduleDragPosition, stopDrag]);
  const startDrag = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(DRAG_EXCLUDED_SELECTOR)) return;
    event.preventDefault();
    const bounds = getBounds();
    dragBounds.current = bounds;
    dragStart.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };
    setIsDraggingActive(true);
  };
  const close = () => {
    stopDrag();
    setIsOpen(false);
    setText("");
    setTranslatedText("");
    setIsTranslating(false);
  };
  const handleTranslateRequest = async (event: Event) => {
    const customEvent = event as CustomEvent<{
      text: string;
      x?: number;
      y?: number;
    }>;
    const { text: newText, x, y } = customEvent.detail;
    stopDrag();
    setText(newText);
    setIsOpen(true);
    setIsTranslating(true);
    setTranslatedText("");
    if (typeof x === "number" || typeof y === "number") {
      setPosition({
        x: x ?? position.x,
        y: y ?? position.y,
      });
    }
    try {
      const result = await sessionClient.translateText(newText, "en", agentStore.selectedAgentId ?? "argos");
      setTranslatedText(result);
    } catch {
      setTranslatedText("Translation failed");
    }
    setIsTranslating(false);
  };
  const onTranslateRequest = useEffectEvent(handleTranslateRequest);
  useEffect(() => {
    window.addEventListener("context-menu-translate-text", onTranslateRequest);
    return () => {
      // Ref/setter-only teardown (mirrors stopDrag()).
      setIsDraggingActive(false);
      if (dragFrameId.current !== null) {
        window.cancelAnimationFrame(dragFrameId.current);
        dragFrameId.current = null;
      }
      if (pendingDragPosition.current) {
        setPosition(pendingDragPosition.current);
        pendingDragPosition.current = null;
      }
      window.removeEventListener("context-menu-translate-text", onTranslateRequest);
    };
  }, []);
  if (!isOpen) return null;
  return (
    <div>
      <div
        ref={popupRef}
        className="translate-popup fixed left-0 top-0 z-50 w-[500px] rounded-lg border bg-background shadow-lg"
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        }}
        data-translate-popup="true"
      >
        <div
          className="translate-popup__header flex cursor-move items-center justify-between border-b p-4"
          data-translate-popup-header="true"
          onPointerDown={startDrag}
        >
          <h3 className="text-lg font-semibold">Translate</h3>
          <Button variant="ghost" size="icon" onClick={close}>
            <Icon icon="lucide:x" className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">
          <div className="mb-4">
            <div className="p-2 bg-muted text-muted-foreground">{text}</div>
          </div>
          <div className="h-px bg-border my-2" />
          <div>
            {isTranslating ? (
              <div className="flex items-center gap-2 p-2 bg-muted text-sm text-muted-foreground">
                <Icon icon="lucide:loader-2" className="animate-spin w-4 h-4" />
                <span>Loading...</span>
              </div>
            ) : (
              <div className="p-2 bg-muted text-sm">{translatedText}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
