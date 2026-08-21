import { useState, useEffect, useMemo, useCallback } from "react";
import { getMimeTypeIcon } from "#/lib/utils";
import { Icon } from "@iconify/react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import type { KnowledgeFileMessage } from "@argos/shared/presenter";
import type { ArgosEventPayload } from "@argos/shared-contracts/events";
import type { knowledgeFileProgressEvent } from "@argos/shared-contracts/events";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#shadcn/components/ui/alert-dialog";
import { Button } from "#shadcn/components/ui/button";

dayjs.extend(utc);
dayjs.extend(timezone);

interface KnowledgeFileItemProps {
  file: KnowledgeFileMessage;
  onDelete: () => void;
  onReAdd: () => void;
}

const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + " MB";
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
};

const getStatusTitle = (status: string): string => {
  switch (status) {
    case "completed":
      return "Upload completed";
    case "processing":
      return "Processing";
    case "error":
      return "Upload error";
    case "paused":
      return "Paused";
    default:
      return "Unknown";
  }
};

export default function KnowledgeFileItem({ file, onDelete, onReAdd }: KnowledgeFileItemProps) {
  const uploadTime = useMemo(
    () => dayjs(file.uploadedAt).tz(userTimeZone).format("YYYY-MM-DD HH:mm:ss"),
    [file.uploadedAt],
  );
  const fileIcon = getMimeTypeIcon(file.mimeType);

  const [progress, setProgress] = useState({ completed: 0, error: 0, total: 0 });
  const progressPercent = useMemo(() => {
    if (!progress.total) return 0;
    return ((progress.completed + progress.error) / progress.total) * 100;
  }, [progress]);

  useEffect(() => {
    const unsubscribe = window.argos?.on?.(
      "knowledge.fileProgress",
      (payload: ArgosEventPayload<typeof knowledgeFileProgressEvent.name>) => {
        if (file.id === payload?.fileId) {
          setProgress({ completed: payload.completed, error: payload.error, total: payload.total });
        }
      },
    );
    return () => {
      unsubscribe?.();
    };
  }, [file.id]);

  return (
    <div className="flex px-3 py-2 gap-2 flex-row bg-card border items-center justify-start rounded-md text-base select-none hover:bg-accent">
      <Icon icon={fileIcon} className="w-10 h-10 text-muted-foreground p-1 bg-accent rounded-md border" />
      <div className="grow flex-1 w-[calc(100%-170px)]">
        <div title={file.name} className="text-sm leading-none pb-2 truncate text-ellipsis whitespace-nowrap">
          {file.name}
        </div>
        <div className="text-xs leading-none text-muted-foreground truncate text-ellipsis whitespace-nowrap">
          <span className="mr-1">{uploadTime}</span>
          {formatFileSize(file.metadata.size)}
        </div>
      </div>
      <div className="ml-auto flex items-center">
        <div
          className="h-7 w-7 flex items-center justify-center rounded-full transition-colors"
          title={file.metadata.errorReason || getStatusTitle(file.status)}
        >
          {file.status === "completed" && <Icon icon="lucide:circle-check-big" className="text-base text-green-500" />}
          {file.status === "processing" && (
            <div className="relative group w-6 h-6 flex items-center justify-center">
              <Icon icon="lucide:loader" className="text-base text-blue-500 animate-spin" />
              <div className="absolute bottom-full mb-1 w-max px-2 py-0.5 rounded-md bg-card text-muted-foreground text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-md pointer-events-none whitespace-nowrap">
                {Math.floor(progressPercent)}% {progress.completed + progress.error}/{progress.total}
              </div>
            </div>
          )}
          {file.status === "error" && <Icon icon="lucide:circle-alert" className="text-base text-red-400" />}
          {file.status === "paused" && <Icon icon="lucide:circle-pause" className="text-base text-yellow-500" />}
        </div>

        {file.status !== "processing" && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-blue-100 transition-colors"
                  title="Re-add"
                />
              }
            >
              <Icon icon="lucide:refresh-ccw" className="text-base text-gray-500" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Re-add File</AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogDescription>Re-upload "{file.name}"?</AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onReAdd}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-blue-100 transition-colors"
                title="Delete"
              />
            }
          >
            <Icon icon="lucide:trash" className="text-base text-red-400" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete File</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription>Delete "{file.name}"?</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
