import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  DATABASE_UNLOCK_CANCEL_CHANNEL,
  DATABASE_UNLOCK_PROGRESS_CHANNEL,
  DATABASE_UNLOCK_REQUEST_CHANNEL,
  DATABASE_UNLOCK_SUBMIT_CHANNEL,
  type DatabaseUnlockProgressPayload,
  type DatabaseUnlockRequestPayload,
} from "@shared/contracts/databaseSecurity";
import logoSrc from "../src/assets/logo.png";
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

  const unlockMessage = useMemo(() => {
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

  return (
    <div className="splash-shell">
      {mode === "unlock" && (
        <div className="unlock-stage">
          <form
            className="unlock-panel"
            onSubmit={(e) => {
              e.preventDefault();
              submitUnlock();
            }}
          >
            <div className="unlock-title">Argos</div>
            <div className="unlock-subtitle">Local database is encrypted</div>
            <label className="unlock-label" htmlFor="database-password">
              SQLite password
            </label>
            <input
              id="database-password"
              ref={passwordInputRef}
              className="unlock-input"
              type="password"
              autoComplete="current-password"
              autoFocus
              disabled={unlockSubmitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {unlockMessage && <div className="unlock-message">{unlockMessage}</div>}
            <div className="unlock-actions">
              <button
                className="unlock-button unlock-button--primary"
                type="submit"
                disabled={!password || unlockSubmitting}
              >
                {unlockSubmitting ? "Opening..." : "Unlock"}
              </button>
              <button className="unlock-button" type="button" onClick={cancelUnlock}>
                Quit
              </button>
            </div>
            <p className="unlock-hint">{unlockHint}</p>
          </form>
        </div>
      )}

      {mode === "system-unlock" && (
        <div className="unlock-stage">
          <div className="unlock-panel">
            <div className="unlock-title">Argos</div>
            <div className="unlock-subtitle">Unlocking local database</div>
            <p className="unlock-hint">Argos is reading the saved password from the system credential store.</p>
          </div>
        </div>
      )}

      {mode === "loading" && (
        <div className="loader-stage">
          <div className="loader-wrapper">
            <span className="loader-letter">D</span>
            <span className="loader-letter">e</span>
            <span className="loader-letter">e</span>
            <span className="loader-letter">p</span>
            <span className="loader-letter">C</span>
            <span className="loader-letter">h</span>
            <span className="loader-letter">a</span>
            <span className="loader-letter">t</span>
            <div className="loader" />
          </div>
        </div>
      )}

      {mode === "loading" && activities.length > 0 && (
        <div className="activity-feed">
          {activities.map((activity) => (
            <div key={activity.key} className="activity-item">
              {activity.status === "completed" && <span className="status-icon status-icon--completed">✔</span>}
              {activity.status === "failed" && <span className="status-icon status-icon--failed">!</span>}
              {activity.status !== "completed" && activity.status !== "failed" && (
                <span className="status-dot status-dot--running" aria-hidden="true" />
              )}
              <span className="activity-label">{getActivityLabel(activity.name)}</span>
            </div>
          ))}
        </div>
      )}

      {mode === "loading" && (
        <div className="logo-corner">
          <img
            src={logoSrc}
            alt="Argos Logo"
            className="logo-mark"
            style={{ filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.24))" }}
          />
        </div>
      )}
    </div>
  );
}
