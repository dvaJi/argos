import { useState, useEffect, useRef, useCallback } from "react";
import { createIpcSubscriptionScope } from "#api/runtime";
import { Switch } from "#shadcn/components/ui/switch";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { usePresenter } from "#api/presenterBridge";
import { RATE_LIMIT_EVENTS } from "#/events";
import type { LLM_PROVIDER } from "@argos/shared/presenter";
import { useToast } from "#/components/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#shadcn/components/ui/alert-dialog";

interface ProviderRateLimitConfigProps {
  provider: LLM_PROVIDER;
  onConfigChanged?: () => void;
}

function convertQpsToInterval(qps: number): number {
  return 1 / qps;
}

function convertIntervalToQps(interval: number): number {
  return 1 / interval;
}

export default function ProviderRateLimitConfig({ provider, onConfigChanged }: ProviderRateLimitConfigProps) {
  const llmPresenter = usePresenter("llmproviderPresenter");
  const { toast } = useToast();

  const [rateLimitEnabled, setRateLimitEnabled] = useState(provider.rateLimit?.enabled ?? false);
  const [intervalValue, setIntervalValue] = useState(convertQpsToInterval(provider.rateLimit?.qpsLimit ?? 0.1));
  const [previousValidValue, setPreviousValidValue] = useState(
    convertQpsToInterval(provider.rateLimit?.qpsLimit ?? 0.1),
  );
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [status, setStatus] = useState<{
    currentQps: number;
    queueLength: number;
    lastRequestTime?: number;
  } | null>(null);

  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const rateLimitStatus = await llmPresenter.getProviderRateLimitStatus(provider.id);
      setStatus({
        currentQps: rateLimitStatus.currentQps,
        queueLength: rateLimitStatus.queueLength,
        lastRequestTime: rateLimitStatus.lastRequestTime,
      });
    } catch (error) {
      console.error("Failed to load rate limit status:", error);
    }
  }, [llmPresenter, provider.id]);

  const startStatusPolling = useCallback(() => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
    }
    if (rateLimitEnabled) {
      statusIntervalRef.current = setInterval(loadStatus, 1000);
    }
  }, [rateLimitEnabled, loadStatus]);

  const stopStatusPolling = useCallback(() => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
  }, []);

  const handleRateLimitEvent = useCallback(
    (data: any) => {
      if (data.providerId === provider.id) {
        void loadStatus();
      }
    },
    [provider.id, loadStatus],
  );

  useEffect(() => {
    void loadStatus();

    const rateLimitScope = createIpcSubscriptionScope();
    rateLimitScope.on(RATE_LIMIT_EVENTS.CONFIG_UPDATED, handleRateLimitEvent);
    rateLimitScope.on(RATE_LIMIT_EVENTS.REQUEST_EXECUTED, handleRateLimitEvent);
    rateLimitScope.on(RATE_LIMIT_EVENTS.REQUEST_QUEUED, handleRateLimitEvent);

    startStatusPolling();

    return () => {
      stopStatusPolling();
      rateLimitScope.cleanup();
    };
  }, [loadStatus, handleRateLimitEvent, startStatusPolling, stopStatusPolling]);

  useEffect(() => {
    startStatusPolling();
  }, [rateLimitEnabled, startStatusPolling]);

  useEffect(() => {
    setRateLimitEnabled(provider.rateLimit?.enabled ?? false);
    const newInterval = convertQpsToInterval(provider.rateLimit?.qpsLimit ?? 0.1);
    setIntervalValue(newInterval);
    setPreviousValidValue(newInterval);
    void loadStatus();
  }, [provider, loadStatus]);

  const updateRateLimitConfig = async (enabled: boolean, interval: number) => {
    try {
      const qpsValue = convertIntervalToQps(interval);
      await llmPresenter.updateProviderRateLimit(provider.id, enabled, qpsValue);
      onConfigChanged?.();
      await loadStatus();
    } catch (error) {
      console.error("Failed to update rate limit config:", error);
    }
  };

  const handleEnabledChange = async (enabled: boolean) => {
    setRateLimitEnabled(enabled);
    await updateRateLimitConfig(enabled, intervalValue);
    startStatusPolling();
  };

  const handleIntervalChange = async () => {
    if (intervalValue <= 0) {
      setShowConfirmDialog(true);
      return;
    }

    if (intervalValue > 3600) {
      setIntervalValue(3600);
    }
    setPreviousValidValue(intervalValue);
    await updateRateLimitConfig(rateLimitEnabled, intervalValue);
  };

  const confirmDisableRateLimit = async () => {
    setRateLimitEnabled(false);
    setShowConfirmDialog(false);
    await updateRateLimitConfig(false, intervalValue);
    toast({
      title: "Rate limit disabled",
      description: "Rate limiting has been disabled for this provider.",
    });
  };

  const cancelDisableRateLimit = () => {
    setIntervalValue(previousValidValue);
    setShowConfirmDialog(false);
  };

  const formatLastRequestTime = () => {
    if (!status?.lastRequestTime || status.lastRequestTime === 0) {
      return "Never";
    }
    const diff = Date.now() - status.lastRequestTime;
    if (diff < 1000) return "Just now";
    if (diff < 60000) return `${Math.floor(diff / 1000)} seconds ago`;
    return `${Math.floor(diff / 60000)} minutes ago`;
  };

  const formatNextAllowedTime = () => {
    if (!rateLimitEnabled || !status?.lastRequestTime || status.lastRequestTime === 0) {
      return "Immediately";
    }

    const nextAllowedTime = status.lastRequestTime + intervalValue * 1000;
    const now = Date.now();

    if (nextAllowedTime <= now) {
      return "Immediately";
    }

    const waitTime = Math.ceil((nextAllowedTime - now) / 1000);
    return `${waitTime} seconds`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Rate Limit</h4>
          <p className="text-xs text-muted-foreground">Control the request rate for this provider.</p>
        </div>
        <Switch checked={rateLimitEnabled} onCheckedChange={handleEnabledChange} />
      </div>

      {rateLimitEnabled && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Interval Limit</Label>
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                min={0}
                max={3600}
                step={0.1}
                className="w-20"
                value={intervalValue}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setIntervalValue(val);
                  if (val > 0) setPreviousValidValue(val);
                }}
                onBlur={() => void handleIntervalChange()}
                onKeyUp={(e) => {
                  if (e.key === "Enter") void handleIntervalChange();
                }}
              />
              <span className="text-xs text-muted-foreground">seconds between requests</span>
            </div>
            <div className="text-xs text-muted-foreground">Minimum time between consecutive requests in seconds.</div>
          </div>

          {status && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last request:</span>
                <span className="font-mono">{formatLastRequestTime()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Queue length:</span>
                <span className="font-mono">{status.queueLength}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next allowed:</span>
                <span className="font-mono">{formatNextAllowedTime()}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Rate Limit?</AlertDialogTitle>
            <AlertDialogDescription>
              Setting the interval to 0 will disable rate limiting. This may cause excessive API usage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDisableRateLimit}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDisableRateLimit()}>Disable</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
