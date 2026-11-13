import { Icon } from "@iconify/react";
import { cn } from "#/lib/utils";
import { projectAutoColor, projectInitials, type ProjectIconValue } from "#/stores/ui/projectIdentity";

interface ProjectIconProps {
  name: string;
  /** null = automatic initials on a name-hashed color. */
  icon: ProjectIconValue | null;
  className?: string;
}

/**
 * Project avatar (docs/features/project-settings): uploaded image, curated
 * lucide icon, or automatic initials — t3code-style rounded square.
 */
export default function ProjectIcon({ name, icon, className }: ProjectIconProps) {
  const color = projectAutoColor(name);
  const base = cn("inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px]", className);
  if (icon?.kind === "image") {
    return <img src={icon.value} alt="" aria-hidden className={cn(base, "object-cover")} draggable={false} />;
  }
  if (icon?.kind === "icon") {
    return (
      <span aria-hidden className={cn(base, color.bg, color.fg)}>
        <Icon icon={icon.value} className="size-[70%]" />
      </span>
    );
  }
  return (
    <span aria-hidden className={cn(base, color.bg, color.fg, "text-[0.5rem] font-bold leading-none tracking-tight")}>
      {projectInitials(name)}
    </span>
  );
}
