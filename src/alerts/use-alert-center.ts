import { useCallback, useEffect, useState } from "react";
import {
  ALERTS_CHANGED_EVENT,
  announceAlertChange,
  dispatchQueuedAlerts,
  getAlertRepository,
  retryAlert,
  sendTestAlert,
} from "./browser-alerts";
import { DEFAULT_ALERT_SETTINGS, type AlertJob, type AlertSettings } from "./types";

export function useAlertCenter() {
  const [settings, setSettingsState] = useState<AlertSettings>(DEFAULT_ALERT_SETTINGS);
  const [jobs, setJobs] = useState<AlertJob[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const repository = getAlertRepository();
      setSettingsState(await repository.getSettings());
      setJobs(await repository.listJobs());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    const handleChange = () => void reload();
    window.addEventListener(ALERTS_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(ALERTS_CHANGED_EVENT, handleChange);
  }, [reload]);

  const saveSettings = useCallback(async (value: AlertSettings) => {
    setBusy(true);
    try {
      await getAlertRepository().setSettings(value);
      setError(null);
      announceAlertChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async (value: AlertSettings) => {
    setBusy(true);
    try {
      await sendTestAlert(value);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  const retry = useCallback(async (jobId: string) => {
    setBusy(true);
    try {
      await retryAlert(jobId);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    settings,
    jobs,
    ready,
    busy,
    error,
    saveSettings,
    sendTest,
    retry,
    reload,
  };
}

export function useAutomaticAlertDispatch() {
  useEffect(() => {
    void dispatchQueuedAlerts();
    const timer = window.setInterval(() => void dispatchQueuedAlerts(), 30_000);
    return () => window.clearInterval(timer);
  }, []);
}
