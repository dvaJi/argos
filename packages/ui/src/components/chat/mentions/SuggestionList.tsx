import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { Icon } from "@iconify/react";

type SuggestionCategory = "file" | "command" | "skill" | "prompt" | "tool";

interface SuggestionListItem {
  id: string;
  label: string;
  description?: string;
  category: SuggestionCategory;
  payload: unknown;
}

interface SuggestionListProps {
  items: SuggestionListItem[];

  command: (item: SuggestionListItem) => void;
}

const categoryTag = (category: SuggestionCategory): string => {
  switch (category) {
    case "command":
      return "/";
    case "skill":
      return "SK";
    case "prompt":
      return "PR";
    case "tool":
      return "TL";
    case "file":
      return "@";
    default:
      return "";
  }
};

const SuggestionList = forwardRef<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }, SuggestionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const itemElements = useRef<(HTMLButtonElement | null)[]>([]);

    const filteredItems = items;

    // Clamp the selection to the current item count during render (React's
    // "adjust state during render" pattern) instead of inside an effect.
    const itemCount = filteredItems.length;
    if (itemCount === 0) {
      if (selectedIndex !== 0) {
        setSelectedIndex(0);
      }
    } else if (selectedIndex >= itemCount) {
      setSelectedIndex(itemCount - 1);
    }

    useEffect(() => {
      itemElements.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    const selectIndex = useCallback(
      (index: number) => {
        const item = filteredItems[index];
        if (!item) return;
        command(item);
      },
      [filteredItems, command],
    );

    const onKeyDown = useCallback(
      ({ event }: { event: KeyboardEvent }): boolean => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!filteredItems.length) return true;
          setSelectedIndex((prev) => (prev + filteredItems.length - 1) % filteredItems.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!filteredItems.length) return true;
          setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          selectIndex(selectedIndex);
          return true;
        }
        return false;
      },
      [filteredItems.length, selectedIndex, selectIndex],
    );

    useImperativeHandle(ref, () => ({ onKeyDown }), [onKeyDown]);

    return (
      <div className="min-w-64 max-w-96 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
        {filteredItems.length > 0 ? (
          <div className="max-h-72 overflow-y-auto">
            {filteredItems.map((item, index) => (
              <button
                key={item.id}
                ref={(el) => {
                  itemElements.current[index] = el;
                }}
                className={`w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${index === selectedIndex ? "bg-accent text-accent-foreground" : ""}`}
                onClick={() => selectIndex(index)}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-xs text-muted-foreground">
                    {item.category === "command" ? (
                      <Icon icon="lucide:command" data-icon="lucide:command" className="h-3.5 w-3.5" />
                    ) : (
                      <span>{categoryTag(item.category)}</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium">{item.label}</div>
                    {item.description && (
                      <div className="truncate text-xs text-muted-foreground">{item.description}</div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 py-2 text-sm text-muted-foreground">No result</div>
        )}
      </div>
    );
  },
);

SuggestionList.displayName = "SuggestionList";

export default SuggestionList;
