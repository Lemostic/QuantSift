import { useCallback, useEffect, useMemo, useState } from "react";
import { BUILTIN_GLOSSARY } from "./catalog";
import {
  createHttpGlossarySource,
  LocalGlossaryRepository,
  updateGlossary,
} from "./repository";
import type { GlossaryCategory, GlossaryTerm } from "./types";

const GLOSSARY_CHANGED_EVENT = "quantsift:glossary-changed";

let browserRepository: LocalGlossaryRepository | null = null;

function getRepository(): LocalGlossaryRepository {
  if (browserRepository === null) {
    browserRepository = new LocalGlossaryRepository(
      window.localStorage,
      BUILTIN_GLOSSARY,
    );
  }
  return browserRepository;
}

export function useGlossary() {
  const [terms, setTerms] = useState<GlossaryTerm[]>(BUILTIN_GLOSSARY);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const repository = getRepository();
      setTerms(await repository.getTerms());
      setUpdatedAt(await repository.getUpdatedAt());
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
    window.addEventListener(GLOSSARY_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(GLOSSARY_CHANGED_EVENT, handleChange);
  }, [reload]);

  const update = useCallback(async () => {
    setUpdating(true);
    setError(null);
    try {
      await updateGlossary({
        store: getRepository(),
        source: createHttpGlossarySource(),
      });
      window.dispatchEvent(new Event(GLOSSARY_CHANGED_EVENT));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setUpdating(false);
    }
  }, []);

  return { terms, updatedAt, ready, updating, error, update, reload };
}

export function useGlossarySearch(
  terms: GlossaryTerm[],
  query: string,
  category: GlossaryCategory | "全部",
): GlossaryTerm[] {
  return useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return terms.filter((term) => {
      if (category !== "全部" && term.category !== category) return false;
      if (!keyword) return true;
      const haystack = `${term.term} ${term.aliases?.join(" ") ?? ""} ${term.summary} ${term.detail}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [terms, query, category]);
}
