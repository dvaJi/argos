import { type FC, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { JsonValue } from "./JsonValue";

interface JsonObjectProps {
  data: Record<string, unknown>;
  isNested?: boolean;
}

export const JsonObject: FC<JsonObjectProps> = ({ data, isNested = false }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const entries = Object.entries(data);

  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">{"{ }"}</span>;
  }

  return (
    <div className="w-full">
      {isNested && (
        <div className="flex items-center py-1">
          <button className="p-0.5 rounded hover:bg-muted mr-1" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
          <span className="text-xs text-muted-foreground">{`Object {${entries.length}}`}</span>
        </div>
      )}

      {isExpanded && (
        <div className={isNested ? "ml-2 pl-1 border-l border-muted space-y-2" : " space-y-2"}>
          {entries.map(([key, value]) => (
            <div key={key}>
              <div className="flex flex-wrap items-start gap-2">
                <span className="inline-flex px-2 py-1 min-w-20 max-w-20 truncate rounded-md text-muted-foreground text-xs font-medium leading-6">
                  {key}
                </span>
                <div className="flex-1 py-1 text-xs px-2 bg-background border rounded-md max-h-64 overflow-auto break-words whitespace-pre-wrap">
                  <JsonValue value={value} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
