import { type FC, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import type { ToolInteractionResponse } from "@argos/shared/types/agent-interface";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
type PendingInteractionView = {
  messageId: string;
  toolCallId: string;
  actionType: "question_request" | "tool_call_permission" | "elicitation_request";
  toolName: string;
  toolArgs: string;
  block: DisplayAssistantMessageBlock;
};
interface ChatToolInteractionOverlayProps {
  interaction: PendingInteractionView;
  processing?: boolean;
  embedded?: boolean;
  onRespond: (response: ToolInteractionResponse) => void;
}

type ElicitationPropertyView = {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  items?: { type?: string; enum?: string[] };
};
type ElicitationFormView = {
  message?: string;
  title?: string | null;
  description?: string | null;
  properties?: Record<string, ElicitationPropertyView>;
  required?: string[];
  toolCallId?: string | null;
};

const parseElicitationPayload = (raw: unknown): ElicitationFormView | null => {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as ElicitationFormView;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

type ElicitationFieldValue = string | boolean | string[];

const ChatElicitationForm: FC<{
  payload: ElicitationFormView;
  processing: boolean;
  onRespond: (response: ToolInteractionResponse) => void;
}> = ({ payload, processing, onRespond }) => {
  const properties = payload.properties ?? {};
  const required = new Set(payload.required ?? []);
  const [values, setValues] = useState<Record<string, ElicitationFieldValue>>({});

  const isAnswered = (key: string, prop: ElicitationPropertyView): boolean => {
    const value = values[key];
    if (prop.type === "boolean") return typeof value === "boolean";
    if (typeof value !== "string") return Array.isArray(value) && value.length > 0;
    return value.trim().length > 0;
  };
  const missingRequired = Object.keys(properties).filter(
    (key) => required.has(key) && !isAnswered(key, properties[key]),
  );
  const canSubmit = missingRequired.length === 0;

  const setValue = (key: string, value: ElicitationFieldValue) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const buildContent = (): Record<string, string | number | boolean | string[]> => {
    const content: Record<string, string | number | boolean | string[]> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const value = values[key];
      if (value === undefined) continue;
      if (prop.type === "boolean") {
        content[key] = value === true;
        continue;
      }
      if (Array.isArray(value)) {
        if (value.length > 0) content[key] = value;
        continue;
      }
      if (typeof value !== "string" || !value.trim()) continue;
      if (prop.type === "number" || prop.type === "integer") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) content[key] = prop.type === "integer" ? Math.trunc(parsed) : parsed;
        continue;
      }
      if (prop.type === "array") {
        const list = value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (list.length > 0) content[key] = list;
        continue;
      }
      content[key] = value;
    }
    return content;
  };

  const renderField = (key: string, prop: ElicitationPropertyView) => {
    const label = prop.title?.trim() || key;
    const fieldId = `elicitation-field-${key}`;
    const description = prop.description?.trim();
    if (prop.type === "boolean") {
      return (
        <div key={key} className="flex items-center gap-2">
          <Checkbox
            id={fieldId}
            disabled={processing}
            checked={values[key] === true}
            onCheckedChange={(checked) => setValue(key, checked === true)}
          />
          <Label htmlFor={fieldId} className="text-xs">
            {label}
          </Label>
        </div>
      );
    }
    if (prop.type === "array" && prop.items?.enum) {
      const selected = Array.isArray(values[key]) ? (values[key] as string[]) : [];
      const toggle = (option: string) => {
        setValue(key, selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
      };
      return (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={fieldId} className="text-xs">
            {label}
          </Label>
          <div className="flex flex-wrap gap-2">
            {prop.items.enum.map((option) => (
              <Button
                key={option}
                type="button"
                disabled={processing}
                variant={selected.includes(option) ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => toggle(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      );
    }
    const inputType = prop.type === "number" || prop.type === "integer" ? "number" : "text";
    const rawValue = typeof values[key] === "string" ? (values[key] as string) : "";
    return (
      <div key={key} className="space-y-1.5">
        <Label htmlFor={fieldId} className="text-xs">
          {label}
          {required.has(key) && <span className="ml-1 text-muted-foreground">*</span>}
        </Label>
        <Input
          id={fieldId}
          type={inputType}
          disabled={processing}
          value={rawValue}
          onChange={(event) => setValue(key, event.target.value)}
          className="h-8 text-xs"
          placeholder={prop.type === "array" ? "Comma-separated values" : undefined}
        />
        {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
      </div>
    );
  };

  return (
    <div className="mt-3 space-y-3">
      {Object.entries(properties).map(([key, prop]) => renderField(key, prop))}
      {missingRequired.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Required: {missingRequired.join(", ")}</p>
      )}
      <div className="flex gap-2">
        <Button
          disabled={processing}
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => onRespond({ kind: "elicitation", action: "decline" })}
        >
          Decline
        </Button>
        <Button
          disabled={processing}
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => onRespond({ kind: "elicitation", action: "cancel" })}
        >
          Cancel
        </Button>
        <Button
          disabled={processing || !canSubmit}
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => onRespond({ kind: "elicitation", action: "accept", content: buildContent() })}
        >
          Submit
        </Button>
      </div>
    </div>
  );
};

const ChatToolInteractionOverlay: FC<ChatToolInteractionOverlayProps> = ({
  interaction,
  processing = false,
  embedded = false,
  onRespond,
}) => {
  const isQuestion = interaction.actionType === "question_request";
  const isPermission = interaction.actionType === "tool_call_permission";
  const isElicitation = interaction.actionType === "elicitation_request";
  const elicitation = isElicitation ? parseElicitationPayload(interaction.block.extra?.elicitationPayload) : null;
  const isSkillDraft = interaction.block.extra?.skillDraftAction === "confirm";
  const headerIcon = isQuestion
    ? "lucide:message-circle-question"
    : isElicitation
      ? "lucide:text-cursor-input"
      : "lucide:shield";
  const headerText = (() => {
    if (isQuestion) {
      const raw = interaction.block.extra?.questionHeader;
      if (typeof raw === "string" && raw.trim()) {
        return raw.includes(".") ? raw : raw;
      }
      return "Question";
    }
    if (isElicitation) {
      const title = elicitation?.title?.trim();
      if (title) return title;
      return "Agent needs input";
    }
    return "Permission Request";
  })();
  const bodyText = (() => {
    if (isQuestion) {
      const raw = interaction.block.extra?.questionText;
      if (typeof raw === "string" && raw.trim()) {
        return raw;
      }
      return interaction.block.content || "";
    }
    if (isElicitation) {
      const message = elicitation?.message?.trim();
      if (message) return message;
      const description = elicitation?.description?.trim();
      if (description) return description;
      return interaction.block.content || "";
    }
    return interaction.block.content || "";
  })();
  const skillDraftPreview = (() => {
    const raw = interaction.block.extra?.skillDraftPreview;
    return typeof raw === "string" ? raw : "";
  })();
  const formattedToolArgs = (() => {
    const raw = interaction.toolArgs || "";
    if (!raw.trim()) return "";
    try {
      return JSON.stringify(JSON.parse(raw) as unknown, null, 2);
    } catch {
      return raw;
    }
  })();
  type QuestionOptionView = {
    label: string;
    rawLabel: string;
    description?: string;
  };
  const questionOptions = (() => {
    const raw = interaction.block.extra?.questionOptions;
    let items: unknown[] = [];
    if (Array.isArray(raw)) {
      items = raw;
    } else if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        items = Array.isArray(parsed) ? parsed : [];
      } catch {
        items = [];
      }
    }
    return items
      .map((item: unknown): QuestionOptionView | null => {
        if (!item || typeof item !== "object") return null;
        const candidate = item as {
          label?: unknown;
          description?: unknown;
        };
        if (typeof candidate.label !== "string") return null;
        const label = candidate.label.trim();
        if (!label) return null;
        if (typeof candidate.description === "string" && candidate.description.trim()) {
          return {
            label,
            rawLabel: label,
            description: candidate.description.trim(),
          };
        }
        return {
          label,
          rawLabel: label,
        };
      })
      .filter((item): item is QuestionOptionView => Boolean(item));
  })();
  const allowOther = interaction.block.extra?.questionCustom !== false;
  const onPermission = (granted: boolean) => {
    onRespond({
      kind: "permission",
      granted,
    });
  };
  const onQuestionOption = (option: QuestionOptionView) => {
    onRespond({
      kind: "question_option",
      optionLabel: isSkillDraft ? option.rawLabel : option.label,
    });
  };
  const onQuestionOther = () => {
    onRespond({
      kind: "question_other",
    });
  };
  return (
    <div
      className={[
        "relative w-full overflow-hidden p-4 text-foreground",
        embedded ? "" : "tool-interaction-overlay max-w-2xl rounded-xl backdrop-blur-[26px]",
      ].join(" ")}
    >
      {!embedded && <div className="tool-interaction-overlay__backdrop" aria-hidden="true" />}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon icon={headerIcon} className="h-4 w-4" />
        <span>{headerText}</span>
      </div>

      <p className="mt-3 text-sm whitespace-pre-wrap break-words">{bodyText}</p>

      {isSkillDraft && skillDraftPreview && (
        <div className="mt-3 rounded-md border bg-background/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Skill Draft Preview</div>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
            {skillDraftPreview}
          </pre>
        </div>
      )}

      {isPermission && (
        <div className="mt-3 space-y-2">
          <div className="rounded-md border bg-muted/50 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tool</div>
            <div className="text-xs font-medium break-all">{interaction.toolName || "-"}</div>
          </div>
          {formattedToolArgs && (
            <div className="rounded-md border bg-background/50 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Arguments</div>
              <pre className="mt-1 text-xs leading-5 whitespace-pre-wrap break-words">{formattedToolArgs}</pre>
            </div>
          )}
        </div>
      )}

      {isElicitation && elicitation ? (
        <ChatElicitationForm payload={elicitation} processing={processing} onRespond={onRespond} />
      ) : isQuestion ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {questionOptions.map((option) => (
            <Button
              key={option.label}
              disabled={processing}
              variant="outline"
              size="sm"
              className="h-auto min-h-8 px-3 py-1.5 text-left"
              onClick={() => onQuestionOption(option)}
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-xs font-medium">{option.label}</span>
                {option.description && <span className="text-[11px] text-muted-foreground">{option.description}</span>}
              </span>
            </Button>
          ))}
          {allowOther && (
            <Button
              disabled={processing}
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={onQuestionOther}
            >
              Other
            </Button>
          )}
        </div>
      ) : isPermission ? (
        <div className="mt-4 flex gap-2">
          <Button
            disabled={processing}
            variant="outline"
            size="sm"
            className="h-8 flex-1 text-xs"
            onClick={() => onPermission(false)}
          >
            Deny
          </Button>
          <Button disabled={processing} size="sm" className="h-8 flex-1 text-xs" onClick={() => onPermission(true)}>
            Allow
          </Button>
        </div>
      ) : null}
    </div>
  );
};
export default ChatToolInteractionOverlay;
