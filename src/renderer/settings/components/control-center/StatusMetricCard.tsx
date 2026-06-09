import { Icon } from '@iconify/react'
import { Badge } from '@shadcn/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@shadcn/components/ui/card'

interface StatusMetricCardProps {
  label: string
  value: string
  icon: string
  description?: string
  badge?: string
  interactive?: boolean
  onSelect?: () => void
}

export default function StatusMetricCard({
  label,
  value,
  icon,
  description,
  badge,
  interactive,
  onSelect
}: StatusMetricCardProps) {
  const handleSelect = () => {
    if (interactive) {
      onSelect?.()
    }
  }

  return (
    <Card
      className={`min-w-0${interactive ? ' transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={handleSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSelect()
        if (e.key === ' ') {
          e.preventDefault()
          handleSelect()
        }
      }}
    >
      <CardHeader className="gap-2 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardDescription className="truncate">{label}</CardDescription>
          <Icon icon={icon} className="size-4 shrink-0 text-muted-foreground" />
        </div>
        <CardTitle className="truncate text-2xl">{value}</CardTitle>
      </CardHeader>
      {(description || badge) && (
        <CardContent>
          <div className="flex min-w-0 items-center justify-between gap-2">
            {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
            {badge && (
              <Badge variant="secondary" className="shrink-0">
                {badge}
              </Badge>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
