import { type FC } from "react";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
interface MessageBlockQuestionRequestProps {
  block: DisplayAssistantMessageBlock;
}
export const MessageBlockQuestionRequest: FC<MessageBlockQuestionRequestProps> = ({ block }) => {
  const questionText = (() => {
    const raw = block.extra?.questionText;
    if (typeof raw === "string" && raw.trim()) {
      return raw;
    }
    return block.content || "";
  })();
  const answerText = (() => {
    const raw = block.extra?.answerText;
    return typeof raw === "string" ? raw : "";
  })();
  const options = (() => {
    const raw = block.extra?.questionOptions;
    let items: unknown[] = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        items = Array.isArray(parsed) ? parsed : [];
      } catch {
        items = [];
      }
    }
    return items
      .map(
        (
          option,
        ): {
          label: string;
          description?: string;
        } | null => {
          if (!option || typeof option !== "object") return null;
          const candidate = option as {
            label?: unknown;
            description?: unknown;
          };
          if (typeof candidate.label !== "string") return null;
          const label = candidate.label.trim();
          if (!label) return null;
          if (typeof candidate.description === "string") {
            const description = candidate.description.trim();
            if (description) {
              return {
                label,
                description,
              };
            }
          }
          return {
            label,
          };
        },
      )
      .filter(
        (
          o,
        ): o is {
          label: string;
          description?: string;
        } => o !== null,
      );
  })();
  return (
    <div className="my-1 flex flex-col gap-2">
      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{questionText}</p>

      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <span
              key={option.label}
              className="inline-flex h-7 items-center rounded-full border bg-muted/30 px-3 text-xs text-muted-foreground"
            >
              {option.label}
            </span>
          ))}
        </div>
      )}

      {answerText && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Answer</span>
          <p className="text-xs whitespace-pre-wrap break-words">{answerText}</p>
        </div>
      )}
    </div>
  );
};
