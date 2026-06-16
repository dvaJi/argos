import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@shadcn/components/ui/alert-dialog";
import { useDialogStore } from "@/stores/dialog";
import type { DialogIcon } from "@shared/presenter";

export default function MessageDialog() {
  const dialog = useDialogStore();
  const dialogRequest = dialog.dialogRequest;
  const showDialog = dialog.showDialog;

  const timeoutSeconds = dialog.timeoutMilliseconds > 0 ? perfectTime(dialog.timeoutMilliseconds) : null;

  const handleClick = (button: string) => {
    if (!dialogRequest) return;
    dialog.handleResponse({ id: dialogRequest.id, button });
  };

  const getIconProps = (icon: DialogIcon) => ({ ...icon });

  return (
    <AlertDialog open={showDialog}>
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-lg sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <div className="flex items-center space-x-2">
              {dialogRequest?.icon && <Icon {...getIconProps(dialogRequest.icon)} className="h-6 w-6" />}
              <span className="break-words text-base font-semibold">{dialogRequest?.title}</span>
            </div>
          </AlertDialogTitle>
          {dialogRequest?.description && (
            <AlertDialogDescription className="text-sm text-muted-foreground break-words">
              <div className="space-y-2 whitespace-pre-line">{dialogRequest.description}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-wrap gap-2 sm:justify-end">
          {dialogRequest?.buttons?.map((button) =>
            button.default ? (
              <AlertDialogAction
                key={button.key}
                className="flex-1 sm:flex-none"
                onClick={() => handleClick(button.key)}
              >
                {button.label}
                {timeoutSeconds && button.default && (
                  <span className="inline-block min-w-8 text-right">[{timeoutSeconds}]</span>
                )}
              </AlertDialogAction>
            ) : (
              <AlertDialogCancel
                key={button.key}
                className="flex-1 sm:flex-none"
                onClick={() => handleClick(button.key)}
              >
                {button.label}
              </AlertDialogCancel>
            ),
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function perfectTime(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return "0 s";
  if (ms < 1000) return "1 s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  const weeks = Math.floor(days / 7);
  return `${weeks} w`;
}
