import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { useLegacyPresenter } from "#api/legacy/presenters";

const MIN_SIZE = 1;
const MAX_SIZE = 1024;

export default function UploadFileSettingsSection() {
  const configPresenter = useLegacyPresenter("configPresenter");
  const [fileMaxSize, setFileMaxSize] = useState(30);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (value: string | number) => {
    const numValue = typeof value === "string" ? parseInt(value, 10) : value;
    if (!isNaN(numValue) && numValue >= MIN_SIZE && numValue <= MAX_SIZE) {
      try {
        await configPresenter.setSetting("maxFileSize", numValue * 1024 * 1024);
        setFileMaxSize(numValue);
      } catch (error) {
        console.error("Failed to set max file size:", error);
      }
    }
  };

  const increaseFileMaxSize = () => {
    const newValue = Math.min(fileMaxSize + 50, MAX_SIZE);
    handleChange(newValue);
  };

  const decreaseFileMaxSize = () => {
    const newValue = Math.max(fileMaxSize - 50, MIN_SIZE);
    handleChange(newValue);
  };

  const startEditing = () => {
    setIsEditing(true);
  };

  const stopEditing = () => {
    setIsEditing(false);
  };

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    const loadSize = async () => {
      try {
        const saved = await configPresenter.getSetting<number>("maxFileSize");
        if (saved !== undefined && saved !== null) {
          setFileMaxSize(saved / 1024 / 1024);
        }
      } catch (error) {
        console.error("Failed to load max file size:", error);
      }
    };
    loadSize();
  }, []);

  return (
    <div className="flex flex-row items-center gap-2 h-10">
      <span className="flex flex-row items-center gap-2 grow w-full">
        <Icon icon="lucide:file" className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Max file size</span>
        <div className="text-xs text-muted-foreground ml-1">Maximum upload file size</div>
      </span>

      <div className="shrink-0 flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={decreaseFileMaxSize}
          disabled={fileMaxSize <= MIN_SIZE}
        >
          <Icon icon="lucide:minus" className="h-3 w-3" />
        </Button>

        <div className="relative">
          {!isEditing ? (
            <div
              onClick={startEditing}
              className="min-w-16 h-8 flex items-center justify-center text-sm font-semibold hover:bg-accent rounded px-2 cursor-pointer"
            >
              {fileMaxSize}
            </div>
          ) : (
            <Input
              ref={inputRef}
              type="number"
              min={MIN_SIZE}
              max={MAX_SIZE}
              value={fileMaxSize}
              onChange={(e) => handleChange(e.target.value)}
              onBlur={stopEditing}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") stopEditing();
              }}
              className="min-w-16 h-8 text-center text-sm font-semibold rounded px-2 bg-accent"
              style={{
                WebkitAppearance: "none" as any,
                MozAppearance: "textfield" as any,
              }}
            />
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={increaseFileMaxSize}
          disabled={fileMaxSize >= MAX_SIZE}
        >
          <Icon icon="lucide:plus" className="h-3 w-3" />
        </Button>

        <span className="text-xs text-muted-foreground ml-1">MB</span>
      </div>
    </div>
  );
}
