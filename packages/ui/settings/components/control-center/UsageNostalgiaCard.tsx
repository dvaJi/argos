import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "#shadcn/components/ui/card";
import type { UsageStatsOutput } from "@argos/shared-contracts/routes";

type NostalgiaRotatingStat = {
  id: "days" | "sessions" | "messages";
  value: string;
};
type NostalgiaDetailItem = {
  id: "days" | "sessions" | "messages" | "most-active-day";
  content: string;
};

const NOSTALGIA_ROTATION_INTERVAL = 4000;

function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

interface UsageNostalgiaCardProps {
  dashboard: UsageStatsOutput | null;
}

export default function UsageNostalgiaCard({ dashboard }: UsageNostalgiaCardProps) {
  const [nostalgiaStatIndex, setNostalgiaStatIndex] = useState(0);

  const isPending = !dashboard;

  const nostalgiaCard = useMemo(() => {
    if (!dashboard || dashboard.summary.messageCount <= 0) {
      return null;
    }

    const summary = dashboard.summary;
    const formattedSessions = formatCount(summary.sessionCount);
    const formattedMessages = formatCount(summary.messageCount);
    const activeDaysText = `${formatCount(summary.activeDays)} active day${summary.activeDays === 1 ? "" : "s"}`;
    const mostActiveDay = dashboard.dailySeries.reduce(
      (max, point) => (point.totalTokens > max.totalTokens ? point : max),
      dashboard.dailySeries[0],
    );
    const mostActiveDayText = mostActiveDay
      ? `${mostActiveDay.date} — ${formatCount(mostActiveDay.totalTokens)} tokens`
      : "N/A";

    const rotatingStats = [
      { id: "days" as const, value: activeDaysText },
      { id: "sessions" as const, value: `${formattedSessions} sessions` },
      { id: "messages" as const, value: `${formattedMessages} messages` },
    ];

    return {
      rotatingStats,
      details: [
        { id: "days", content: activeDaysText },
        { id: "sessions", content: `${formattedSessions} total sessions` },
        { id: "messages", content: `${formattedMessages} total messages` },
        { id: "most-active-day", content: mostActiveDayText },
      ] satisfies NostalgiaDetailItem[],
    };
  }, [dashboard]);

  const activeNostalgiaStat = useMemo<NostalgiaRotatingStat | null>(() => {
    const stats = nostalgiaCard?.rotatingStats ?? [];
    if (stats.length === 0) {
      return null;
    }
    return stats[nostalgiaStatIndex % stats.length];
  }, [nostalgiaCard, nostalgiaStatIndex]);

  useEffect(() => {
    const statCount = nostalgiaCard?.rotatingStats.length ?? 0;
    if (statCount <= 1) {
      setNostalgiaStatIndex(0);
      return;
    }
    setNostalgiaStatIndex((prev) => prev % statCount);
    const timer = window.setInterval(() => {
      setNostalgiaStatIndex((prev) => {
        const currentCount = nostalgiaCard?.rotatingStats.length ?? 0;
        if (currentCount <= 1) return 0;
        return (prev + 1) % currentCount;
      });
    }, NOSTALGIA_ROTATION_INTERVAL);
    return () => {
      window.clearInterval(timer);
    };
  }, [nostalgiaCard?.rotatingStats.length]);

  return (
    <Card
      data-testid="summary-card-nostalgia"
      className="flex h-full flex-col overflow-hidden border-border/70 bg-card/90 backdrop-blur-sm"
    >
      <CardHeader className="space-y-1 pb-1">
        <CardTitle className="wrap-break-word whitespace-normal text-base leading-tight">Your journey</CardTitle>
      </CardHeader>
      {nostalgiaCard ? (
        <CardContent className="flex flex-1 flex-col gap-3 pt-0 lg:grid lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:items-start lg:gap-4 xl:flex xl:flex-col">
          <div className="flex min-h-18 items-start sm:min-h-20">
            <CardTitle
              key={activeNostalgiaStat?.id ?? "unavailable"}
              data-testid="nostalgia-rotating-value"
              className="wrap-break-word whitespace-normal text-2xl font-semibold leading-tight tracking-tight sm:text-3xl"
            >
              {activeNostalgiaStat?.value ?? "N/A"}
            </CardTitle>
          </div>

          <div data-testid="nostalgia-details" className="space-y-2 lg:pt-0.5">
            {nostalgiaCard.details.map((item) => (
              <div
                key={item.id}
                data-testid={`nostalgia-detail-${item.id}`}
                className="rounded-lg border border-border/30 bg-muted/5 px-3 py-2.5"
              >
                <p className="wrap-break-word whitespace-normal text-sm leading-6">{item.content}</p>
              </div>
            ))}
          </div>
        </CardContent>
      ) : isPending ? (
        <CardContent className="flex flex-1 flex-col justify-center gap-4 pt-0">
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted"></div>
          <div className="space-y-2">
            <div className="h-9 animate-pulse rounded-lg bg-muted/70"></div>
            <div className="h-9 animate-pulse rounded-lg bg-muted/50"></div>
            <div className="h-9 animate-pulse rounded-lg bg-muted/30"></div>
          </div>
        </CardContent>
      ) : (
        <CardContent className="flex flex-1 flex-col justify-center gap-3 pt-0">
          <CardTitle
            data-testid="nostalgia-rotating-value"
            className="wrap-break-word whitespace-normal text-2xl font-semibold leading-tight tracking-tight sm:text-3xl"
          >
            N/A
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">Start chatting to see your stats here.</p>
        </CardContent>
      )}
    </Card>
  );
}
