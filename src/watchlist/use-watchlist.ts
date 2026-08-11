import { useCallback, useEffect, useState } from "react";
import {
  LocalWatchlistRepository,
  type WatchlistEntry,
  type WatchlistUpdate,
} from "./repository";

const WATCHLIST_CHANGED_EVENT = "quantsift:watchlist-changed";
const DEFAULT_INSTRUMENT_IDS = ["CN:510300", "CN:600519", "CN:159915", "CN:012734"];

let browserRepository: LocalWatchlistRepository | null = null;

function getRepository(): LocalWatchlistRepository {
  if (browserRepository === null) {
    browserRepository = new LocalWatchlistRepository(window.localStorage);
  }
  return browserRepository;
}

function announceChange() {
  window.dispatchEvent(new Event(WATCHLIST_CHANGED_EVENT));
}

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const repository = getRepository();
      await repository.seedIfMissing(DEFAULT_INSTRUMENT_IDS);
      await repository.applyMigration("2026-08-add-012734", ["CN:012734"]);
      setEntries(await repository.list());
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
    window.addEventListener(WATCHLIST_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, handleChange);
  }, [reload]);

  const add = useCallback(async (instrumentId: string) => {
    await getRepository().add(instrumentId);
    announceChange();
  }, []);

  const update = useCallback(
    async (instrumentId: string, value: WatchlistUpdate) => {
      await getRepository().update(instrumentId, value);
      announceChange();
    },
    [],
  );

  const remove = useCallback(async (instrumentId: string) => {
    await getRepository().remove(instrumentId);
    announceChange();
  }, []);

  return { entries, ready, error, add, update, remove, reload };
}

