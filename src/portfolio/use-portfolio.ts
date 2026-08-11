import { useCallback, useEffect, useState } from "react";
import { LocalPortfolioRepository } from "./repository";
import type { PortfolioPosition, PortfolioPositionDraft } from "./types";

const PORTFOLIO_CHANGED_EVENT = "quantsift:portfolio-changed";
let browserRepository: LocalPortfolioRepository | null = null;

function getRepository() {
  if (browserRepository === null) {
    browserRepository = new LocalPortfolioRepository(window.localStorage);
  }
  return browserRepository;
}

function announceChange() {
  window.dispatchEvent(new Event(PORTFOLIO_CHANGED_EVENT));
}

export function usePortfolio() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setPositions(await getRepository().list());
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
    window.addEventListener(PORTFOLIO_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(PORTFOLIO_CHANGED_EVENT, handleChange);
  }, [reload]);

  const upsert = useCallback(async (draft: PortfolioPositionDraft) => {
    const position = await getRepository().upsert(draft);
    announceChange();
    return position;
  }, []);

  const remove = useCallback(async (instrumentId: string) => {
    await getRepository().remove(instrumentId);
    announceChange();
  }, []);

  return { positions, ready, error, upsert, remove, reload };
}
