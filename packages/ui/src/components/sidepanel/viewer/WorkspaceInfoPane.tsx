import type { WorkspaceFilePreview } from "@argos/shared/presenter";
interface WorkspaceInfoPaneProps {
  filePreview: WorkspaceFilePreview;
}
const formatDate = (value: Date | string | number): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};
export function WorkspaceInfoPane({ filePreview }: WorkspaceInfoPaneProps) {
  const description = filePreview.metadata.fileDescription?.trim() || "";
  const createdAt = formatDate(filePreview.metadata.fileCreated);
  const modifiedAt = formatDate(filePreview.metadata.fileModified);
  return (
    <div className="h-full min-h-0 w-full overflow-auto px-4 py-4 text-sm" data-testid="workspace-info-pane">
      {description && <div className="mb-3 text-foreground">{description}</div>}
      <div className="space-y-2 text-muted-foreground">
        <div>{filePreview.mimeType}</div>
        <div>{Math.max(0, Number(filePreview.metadata.fileSize) || 0)} bytes</div>
        <div>{formatDate(filePreview.metadata.fileModified)}</div>
        {createdAt !== modifiedAt && <div>{createdAt}</div>}
      </div>
    </div>
  );
}
