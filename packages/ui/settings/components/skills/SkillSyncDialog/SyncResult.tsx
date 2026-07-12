import type { FC } from "react";
import { Icon } from "@iconify/react";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import type { SyncResult as SyncResultType } from "@argos/shared/types/skillSync";

interface SyncResultProps {
  result: SyncResultType;
  mode: "import" | "export";
}

export const SyncResult: FC<SyncResultProps> = ({ result, mode }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4 py-6">
        {result.success ? (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2">
              <Icon icon="lucide:check" className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-lg font-medium text-green-600 dark:text-green-400">Success</span>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-2">
              <Icon icon="lucide:alert-triangle" className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-lg font-medium text-amber-600 dark:text-amber-400">Partial</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 bg-muted/50 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {mode === "import" ? result.imported : result.exported}
          </div>
          <div className="text-xs text-muted-foreground">{mode === "import" ? "Imported" : "Exported"}</div>
        </div>
        <div className="text-center p-4 bg-muted/50 rounded-lg">
          <div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div>
          <div className="text-xs text-muted-foreground">Skipped</div>
        </div>
        <div className="text-center p-4 bg-muted/50 rounded-lg">
          <div
            className={[
              "text-2xl font-bold",
              result.failed.length > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
            ].join(" ")}
          >
            {result.failed.length}
          </div>
          <div className="text-xs text-muted-foreground">Failed</div>
        </div>
      </div>

      {result.failed.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-red-600 dark:text-red-400">Failed items</div>
          <ScrollArea className="h-[150px]">
            <div className="space-y-2">
              {result.failed.map((item, index) => (
                <div key={index} className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm">
                  <Icon icon="lucide:x-circle" className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium">{item.skill}</span>
                    <span className="text-red-600 dark:text-red-400">: {item.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default SyncResult;
