import { useState, useRef, useCallback } from "react";

export function useDragAndDrop() {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const dragLeaveTimerRef = useRef<number | null>(null);

  const handleDragEnter = useCallback((e: DragEvent) => {
    dragCounterRef.current++;
    if (e.dataTransfer?.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (dragLeaveTimerRef.current) {
      clearTimeout(dragLeaveTimerRef.current);
      dragLeaveTimerRef.current = null;
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--;

    if (dragCounterRef.current <= 0) {
      if (dragLeaveTimerRef.current) clearTimeout(dragLeaveTimerRef.current);

      dragLeaveTimerRef.current = window.setTimeout(() => {
        if (dragCounterRef.current <= 0) {
          setIsDragging(false);
          dragCounterRef.current = 0;
        }
        dragLeaveTimerRef.current = null;
      }, 50);
    }
  }, []);

  const resetDragState = useCallback(() => {
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (dragLeaveTimerRef.current) {
      clearTimeout(dragLeaveTimerRef.current);
      dragLeaveTimerRef.current = null;
    }
  }, []);

  return {
    isDragging,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    resetDragState,
  };
}
