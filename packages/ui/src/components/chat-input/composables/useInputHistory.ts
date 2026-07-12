import { useState, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { searchHistory } from "#/lib/searchHistory";

export function useInputHistory(editor: Editor | null) {
  const [currentHistoryPlaceholder, setCurrentHistoryPlaceholder] = useState("");
  const [showHistoryPlaceholder, setShowHistoryPlaceholder] = useState(false);
  const editorInstanceRef = useRef<Editor | null>(editor);

  const dynamicPlaceholder = useMemo(() => {
    if (currentHistoryPlaceholder) {
      return `${currentHistoryPlaceholder} (history)`;
    }
    return "Type a message...";
  }, [currentHistoryPlaceholder]);

  const updatePlaceholder = () => {
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;
    const { state } = editorInstance;
    editorInstance.view.updateState(state);
  };

  const setEditor = (newEditor: Editor) => {
    editorInstanceRef.current = newEditor;
  };

  const setHistoryPlaceholder = (text: string) => {
    setCurrentHistoryPlaceholder(text);
    setShowHistoryPlaceholder(true);
    updatePlaceholder();
  };

  const clearHistoryPlaceholder = () => {
    setCurrentHistoryPlaceholder("");
    setShowHistoryPlaceholder(false);
    updatePlaceholder();
    searchHistory.resetIndex();
  };

  const handleArrowKey = (direction: "up" | "down", currentContent: string): boolean => {
    if (currentContent.trim()) {
      return false;
    }

    if (direction === "up") {
      const previousSearch = searchHistory.getPrevious();
      if (previousSearch !== null) {
        setHistoryPlaceholder(previousSearch);
        return true;
      }
    } else if (direction === "down") {
      const nextSearch = searchHistory.getNext();
      if (nextSearch !== null) {
        setHistoryPlaceholder(nextSearch);
        return true;
      } else {
        setCurrentHistoryPlaceholder("");
        setShowHistoryPlaceholder(false);
        updatePlaceholder();
        searchHistory.resetIndex();
        return true;
      }
    }

    return false;
  };

  const confirmHistoryPlaceholder = () => {
    const editorInstance = editorInstanceRef.current;
    if (currentHistoryPlaceholder && editorInstance) {
      editorInstance.commands.setContent(currentHistoryPlaceholder);
      clearHistoryPlaceholder();
      return true;
    }
    return false;
  };

  const addToHistory = (text: string) => {
    searchHistory.addSearch(text);
  };

  const initHistory = () => {
    searchHistory.resetIndex();
  };

  return {
    currentHistoryPlaceholder,
    showHistoryPlaceholder,
    dynamicPlaceholder,
    setEditor,
    setHistoryPlaceholder,
    clearHistoryPlaceholder,
    handleArrowKey,
    confirmHistoryPlaceholder,
    addToHistory,
    initHistory,
    updatePlaceholder,
  };
}
