import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@shadcn/components/ui/card";

interface SettingsSectionCardProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export default function SettingsSectionCard({ title, description, actions, children }: SettingsSectionCardProps) {
  const showHeader = title || description || actions;
  return (
    <Card>
      {showHeader && (
        <CardHeader className="gap-2">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              {title && <CardTitle className="truncate text-base">{title}</CardTitle>}
              {description && <CardDescription className="mt-1">{description}</CardDescription>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
    </Card>
  );
}
