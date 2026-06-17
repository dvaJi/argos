import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  DATABASE_UNLOCK_CANCEL_CHANNEL,
  DATABASE_UNLOCK_PROGRESS_CHANNEL,
  DATABASE_UNLOCK_REQUEST_CHANNEL,
  DATABASE_UNLOCK_SUBMIT_CHANNEL,
  type DatabaseUnlockProgressPayload,
  type DatabaseUnlockRequestPayload,
} from "@shared/contracts/databaseSecurity";
import argosMarkSrc from "../src/assets/argos-mark.svg";
import "./loading.css";

type SplashActivityStatus = "running" | "completed" | "failed";

interface SplashActivityItem {
  key: string;
  name: string;
  status: SplashActivityStatus;
}

interface SplashUpdatePayload {
  activities?: SplashActivityItem[];
}

const ACTIVITY_LABELS: Record<string, string> = {
  "config-initialization": "Loading configuration",
  "database-initialization": "Opening local database",
  "protocol-registration": "Registering app protocol",
  "presenter-initialization": "Initializing presenters",
  "event-listener-setup": "Attaching event listeners",
  "acp-registry-migration": "Migrating registry data",
  "window-creation": "Creating main window",
  "tray-setup": "Starting tray integration",
  "rtk-health-check": "Checking runtime health",
  "legacy-import": "Queueing legacy import",
  "usage-stats-backfill": "Queueing usage stats backfill",
  "startup-error": "Startup error",
};

const getActivityLabel = (name: string) => {
  if (ACTIVITY_LABELS[name]) {
    return ACTIVITY_LABELS[name];
  }
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

function BrandMark() {
  return (
    <img
      src={argosMarkSrc}
      alt=""
      aria-hidden="true"
      data-testid="splash-brand-mark"
      className="splash-brand"
      width={32}
      height={32}
    />
  );
}

function HairlineArc({
  completed,
  total,
  paused,
  done,
}: {
  completed: number;
  total: number;
  paused: boolean;
  done: boolean;
}) {
  const safeTotal = Math.max(total, 1);
  const pct = Math.min(100, Math.max(0, (completed / safeTotal) * 100));
  const className = ["splash-arc", paused ? "splash-arc--paused" : "", done ? "splash-arc--done" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={className}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-valuenow={completed}
      data-testid="splash-arc"
    >
      <div className="splash-arc__track" />
      <div className="splash-arc__fill" style={{ width: `${pct}%` }} />
      <div className="splash-arc__head" style={{ left: `${pct}%` }} />
    </div>
  );
}

function StatusList({ activities }: { activities: SplashActivityItem[] }) {
  if (activities.length === 0) {
    return null;
  }
  return (
    <div className="splash-status" data-testid="splash-status">
      {activities.map((activity) => {
        const rowClass = [
          "splash-status__row",
          activity.status === "running" ? "splash-status__row--active" : "",
          activity.status === "completed" ? "splash-status__row--done" : "",
          activity.status === "failed" ? "splash-status__row--failed" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={activity.key} className={rowClass}>
            <span className="splash-status__glyph" aria-hidden="true" />
            <span className="splash-status__label">{getActivityLabel(activity.name)}</span>
          </div>
        );
      })}
    </div>
  );
}

function UnlockPanel(props: {
  requestId: string;
  unlockReason: DatabaseUnlockRequestPayload["reason"];
  safeStorageAvailable: boolean;
  unlockSubmitting: boolean;
  password: string;
  passwordInputRef: React.RefObject<HTMLInputElement | null>;
  onPasswordChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  title: string;
  subtitle: string;
  hint: string;
  errorMessage?: string;
  primaryLabel: string;
  cancelLabel: string;
}) {
  return (
    <form
      className="splash-unlock__panel"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      data-testid="splash-unlock-panel"
    >
      <h1 className="splash-unlock__title">{props.title}</h1>
      <p className="splash-unlock__subtitle">{props.subtitle}</p>
      <label className="splash-unlock__label" htmlFor="database-password">
        SQLite password
      </label>
      <input
        id="database-password"
        ref={props.passwordInputRef}
        className="splash-unlock__input"
        type="password"
        autoComplete="current-password"
        autoFocus
        disabled={props.busy}
        value={props.password}
        onChange={(e) => props.onPasswordChange(e.target.value)}
      />
      {props.errorMessage ? <div className="splash-unlock__message">{props.errorMessage}</div> : null}
      <div className="splash-unlock__actions">
        <button
          className="splash-unlock__button splash-unlock__button--primary"
          type="submit"
          disabled={!props.password || props.busy}
        >
          {props.busy ? "Opening..." : props.primaryLabel}
        </button>
        <button className="splash-unlock__button" type="button" onClick={props.onCancel}>
          {props.cancelLabel}
        </button>
      </div>
      <p className="splash-unlock__hint">{props.hint}</p>
    </form>
  );
}

export default function Loading() {
  const [activities, setActivities] = useState<SplashActivityItem[]>([]);
  const [mode, setMode] = useState<"loading" | "system-unlock" | "unlock">("loading");
  const [requestId, setRequestId] = useState("");
  const [password, setPassword] = useState("");
  const [unlockReason, setUnlockReason] = useState<DatabaseUnlockRequestPayload["reason"]>("manual-required");
  const [safeStorageAvailable, setSafeStorageAvailable] = useState(false);
  const [unlockSubmitting, setUnlockSubmitting] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const handleSplashUpdate = useCallback((_event: unknown, payload: SplashUpdatePayload) => {
    setActivities(payload.activities?.slice(0, 3) ?? []);
  }, []);

  const unlockError = useMemo(() => {
    if (unlockReason === "invalid") {
      return "Wrong password. Try again.";
    }
    return "";
  }, [unlockReason]);

  const unlockHint = useMemo(() => {
    if (unlockReason === "system-key-missing") {
      return "The saved system credential is missing or cannot be decrypted. Enter the SQLite password once to unlock and save it again.";
    }
    if (!safeStorageAvailable) {
      return "System unlock is unavailable on this device, so manual unlock is required.";
    }
    return "Enter the SQLite password to unlock this database. Future startups can open automatically after it is saved to the system credential store.";
  }, [unlockReason, safeStorageAvailable]);

  const handleUnlockRequest = useCallback((_event: unknown, payload: DatabaseUnlockRequestPayload) => {
    setRequestId(payload.requestId);
    setUnlockReason(payload.reason);
    setSafeStorageAvailable(payload.safeStorageAvailable);
    setPassword("");
    setUnlockSubmitting(false);
    setMode("unlock");
    setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 0);
  }, []);

  const handleUnlockProgress = useCallback((_event: unknown, payload: DatabaseUnlockProgressPayload) => {
    setUnlockSubmitting(false);
    if (payload.active) {
      setSafeStorageAvailable(payload.safeStorageAvailable);
      setMode("system-unlock");
      return;
    }
    setMode((prev) => (prev === "system-unlock" ? "loading" : prev));
  }, []);

  const submitUnlock = useCallback(() => {
    if (!requestId || !password || unlockSubmitting) {
      return;
    }
    setUnlockSubmitting(true);
    window.electron?.ipcRenderer?.send?.(DATABASE_UNLOCK_SUBMIT_CHANNEL, {
      requestId,
      password,
    });
    setPassword("");
  }, [requestId, password, unlockSubmitting]);

  const cancelUnlock = useCallback(() => {
    if (!requestId) {
      return;
    }
    const canceledRequestId = requestId;
    setUnlockSubmitting(false);
    window.electron?.ipcRenderer?.send?.(DATABASE_UNLOCK_CANCEL_CHANNEL, {
      requestId: canceledRequestId,
    });
    setRequestId("");
    setPassword("");
    setUnlockReason("manual-required");
    setSafeStorageAvailable(false);
    setMode("loading");
  }, [requestId]);

  useEffect(() => {
    window.electron?.ipcRenderer?.on?.("splash-update", handleSplashUpdate);
    window.electron?.ipcRenderer?.on?.(DATABASE_UNLOCK_REQUEST_CHANNEL, handleUnlockRequest);
    window.electron?.ipcRenderer?.on?.(DATABASE_UNLOCK_PROGRESS_CHANNEL, handleUnlockProgress);
    return () => {
      window.electron?.ipcRenderer?.removeListener?.("splash-update", handleSplashUpdate);
      window.electron?.ipcRenderer?.removeListener?.(DATABASE_UNLOCK_REQUEST_CHANNEL, handleUnlockRequest);
      window.electron?.ipcRenderer?.removeListener?.(DATABASE_UNLOCK_PROGRESS_CHANNEL, handleUnlockProgress);
    };
  }, [handleSplashUpdate, handleUnlockRequest, handleUnlockProgress]);

  const completedCount = activities.filter((a) => a.status === "completed").length;
  const totalCount = activities.length;
  const allDone = totalCount > 0 && completedCount === totalCount;

  return (
    <div className="splash-shell">
      {mode === "loading" && (
        <div className="splash-stage" data-testid="splash-stage">
          <BrandMark />
          <h1 className="splash-wordmark">Argos</h1>
          <HairlineArc completed={completedCount} total={Math.max(totalCount, 1)} paused={false} done={allDone} />
          <StatusList activities={activities} />
        </div>
      )}

      {mode === "system-unlock" && (
        <div className="splash-unlock" data-testid="splash-system-unlock">
          <div className="splash-stage">
            <BrandMark />
            <h1 className="splash-wordmark">Argos</h1>
            <HairlineArc completed={0} total={1} paused done={false} />
            <UnlockPanel
              requestId={requestId}
              unlockReason={unlockReason}
              safeStorageAvailable={safeStorageAvailable}
              unlockSubmitting={unlockSubmitting}
              password={password}
              passwordInputRef={passwordInputRef}
              onPasswordChange={setPassword}
              onSubmit={submitUnlock}
              onCancel={cancelUnlock}
              busy={unlockSubmitting}
              title="Argos"
              subtitle="Unlocking local database"
              hint="Argos is reading the saved password from the system credential store."
              errorMessage={unlockError}
              primaryLabel="Unlock"
              cancelLabel="Quit"
            />
          </div>
        </div>
      )}

      {mode === "unlock" && (
        <div className="splash-unlock" data-testid="splash-unlock">
          <UnlockPanel
            requestId={requestId}
            unlockReason={unlockReason}
            safeStorageAvailable={safeStorageAvailable}
            unlockSubmitting={unlockSubmitting}
            password={password}
            passwordInputRef={passwordInputRef}
            onPasswordChange={setPassword}
            onSubmit={submitUnlock}
            onCancel={cancelUnlock}
            busy={unlockSubmitting}
            title="Argos"
            subtitle="Local database is encrypted"
            hint={unlockHint}
            errorMessage={unlockError}
            primaryLabel="Unlock"
            cancelLabel="Quit"
          />
        </div>
      )}
    </div>
  );
}
