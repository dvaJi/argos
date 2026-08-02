import { type FC, useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Label } from "#shadcn/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#shadcn/components/ui/radio-group";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { ConflictStrategy } from "@argos/shared/types/skillSync";

export interface ConflictItem {
  skillName: string;
  existingName: string;
}

interface ConflictResolverProps {
  conflicts: ConflictItem[];
  strategies: Record<string, ConflictStrategy>;
  warnings: string[];
  onStrategiesChange: (value: Record<string, ConflictStrategy>) => void;
}

const ConflictResolver: FC<ConflictResolverProps> = ({ conflicts, strategies, warnings, onStrategiesChange }) => {
  const updateStrategy = (skillName: string, strategy: ConflictStrategy) => {
    onStrategiesChange({
      ...strategies,
      [skillName]: strategy,
    });
  };

  const setAllStrategies = (strategy: ConflictStrategy) => {
    const newStrategies: Record<string, ConflictStrategy> = {};
    for (const conflict of conflicts) {
      newStrategies[conflict.skillName] = strategy;
    }
    onStrategiesChange(newStrategies);
  };

  return (
    <div className="space-y-4">
      {conflicts.length > 1 && (
        <div className="flex items-center gap-2 pb-2 border-b">
          <span className="text-sm text-muted-foreground">Batch action:</span>
          <Button variant="outline" size="sm" onClick={() => setAllStrategies(ConflictStrategy.SKIP)}>
            Skip All
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAllStrategies(ConflictStrategy.OVERWRITE)}>
            Overwrite All
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAllStrategies(ConflictStrategy.RENAME)}>
            Rename All
          </Button>
        </div>
      )}

      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-3">
          {conflicts.map((conflict) => (
            <div key={conflict.skillName} className="p-3 border rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Icon icon="lucide:alert-triangle" className="w-4 h-4 text-amber-500" />
                <span className="font-medium">{conflict.skillName}</span>
              </div>
              <p className="text-xs text-muted-foreground">Conflicts with existing: {conflict.existingName}</p>
              <RadioGroup
                value={strategies[conflict.skillName] || "skip"}
                onValueChange={(value) => updateStrategy(conflict.skillName, value as ConflictStrategy)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="skip" id={`${conflict.skillName}-skip`} />
                  <Label htmlFor={`${conflict.skillName}-skip`} className="text-sm">
                    Skip
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="overwrite" id={`${conflict.skillName}-overwrite`} />
                  <Label htmlFor={`${conflict.skillName}-overwrite`} className="text-sm">
                    Overwrite
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="rename" id={`${conflict.skillName}-rename`} />
                  <Label htmlFor={`${conflict.skillName}-rename`} className="text-sm">
                    Rename
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ))}
        </div>
      </ScrollArea>

      {warnings.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-amber-600 dark:text-amber-400">Warnings</div>
          <div className="space-y-1">
            {warnings.map((warning, index) => (
              <div key={index} className="text-xs text-muted-foreground flex items-start gap-2">
                <Icon icon="lucide:info" className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConflictResolver;
