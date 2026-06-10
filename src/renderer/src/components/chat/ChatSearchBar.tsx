import { type ChangeEvent, type KeyboardEvent, forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";
import { Input } from "@shadcn/components/ui/input";

interface ChatSearchBarProps {
  modelValue: string;
  activeMatch: number;
  totalMatches: number;
  onUpdateModelValue: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

const ChatSearchBar = forwardRef<{ focusInput: () => void; selectInput: () => void }, ChatSearchBarProps>(
  ({ modelValue, activeMatch, totalMatches, onUpdateModelValue, onPrevious, onNext, onClose }, ref) => {
    const inputRef = useRef<HTMLInputElement | null>(null);

    const focusInput = useCallback(() => {
      inputRef.current?.focus();
    }, []);

    const selectInput = useCallback(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, []);

    useImperativeHandle(ref, () => ({ focusInput, selectInput }), [focusInput, selectInput]);

    const handleInputChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        onUpdateModelValue(e.target.value);
      },
      [onUpdateModelValue],
    );

    const handleKeydown = useCallback(
      (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return;
        }
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (e.shiftKey) {
          onPrevious();
          return;
        }
        onNext();
      },
      [onClose, onPrevious, onNext],
    );

    return (
      <div className="chat-search-bar flex w-full max-w-[24rem] items-center gap-2 rounded-2xl border bg-background/90 px-2.5 py-2 shadow-lg backdrop-blur-xl">
        <div className="relative min-w-0 flex-1">
          <Icon
            icon="lucide:search"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70"
          />
          <Input
            ref={inputRef}
            value={modelValue}
            className="h-8 border-0 bg-transparent pl-8 pr-2 text-sm shadow-none focus-visible:ring-0"
            placeholder="Search in conversation..."
            aria-label="Search in conversation"
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            onChange={handleInputChange}
            onKeyDown={handleKeydown}
          />
        </div>

        <span
          className="min-w-[3.5rem] shrink-0 text-right text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {totalMatches > 0 ? `${activeMatch + 1} / ${totalMatches}` : "0 / 0"}
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-xl text-muted-foreground hover:text-foreground"
            title="Previous match"
            aria-label="Previous match"
            onClick={onPrevious}
          >
            <Icon icon="lucide:chevron-up" className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-xl text-muted-foreground hover:text-foreground"
            title="Next match"
            aria-label="Next match"
            onClick={onNext}
          >
            <Icon icon="lucide:chevron-down" className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-xl text-muted-foreground hover:text-foreground"
            title="Close search"
            aria-label="Close search"
            onClick={onClose}
          >
            <Icon icon="lucide:x" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  },
);

ChatSearchBar.displayName = "ChatSearchBar";

export default ChatSearchBar;
