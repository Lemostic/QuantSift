import { useCallback, useEffect, useState } from "react";
import { LocalAlertRepository, DEFAULT_ALERT_POLICY } from "./repository";
import type { AlertJob, AlertPolicy } from "./types";

const ALERTS_CHANGED_EVENT = "quantsift:alerts-changed";
let browserRepository: LocalAlertRepository | null = null;

export function getAlertRepository() {
  if (browserRepository === null) {
    browserRepository = new LocalAlertRepository(window.localStorage);
  }
  return browserRepository;
}
export function announceAlertChange() {
  window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
}

export function useAlertCenter() {
  const [policy, setPolicyState] = useState<AlertPolicy>(DEFAULT_ALERT_POLICY);
  const [jobs, setJobs] = useState<AlertJob[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const repository = getAlertRepository();
      setPolicyState(await repository.getPolicy());
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

  const updatePolicy = useCallback(async (next: AlertPolicy) => {
    await getAlertRepository().setPolicy(next);
    announceAlertChange();
  }, []);

  return { policy, jobs, ready, error, updatePolicy, reload };
}
