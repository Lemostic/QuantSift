import { useEffect, useMemo, useState } from "react";
import {
  CirclePause,
  CirclePlay,
  Plus,
  Search,
  StickyNote,
  Tags,
  Trash2,
} from "lucide-react";
import { recordedMarketDataProvider } from "@/data/recorded-provider";
import type { Instrument } from "@/quant/types";
import { useWatchlist } from "@/watchlist/use-watchlist";
import type { WatchlistEntry } from "@/watchlist/repository";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { cn } from "@/lib/utils";

export function WatchlistPage() {
  const watchlist = useWatchlist();
  const [catalog, setCatalog] = useState<Instrument[]>([]);
  const [query, setQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void recordedMarketDataProvider.listInstruments().then(setCatalog);
  }, []);

  const entryIds = useMemo(
    () => new Set(watchlist.entries.map((entry) => entry.instrumentId)),
    [watchlist.entries],
  );
  const instrumentsById = useMemo(
    () => new Map(catalog.map((instrument) => [instrument.id, instrument])),
    [catalog],
  );
  const candidates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter((instrument) => {
      if (entryIds.has(instrument.id)) return false;
      if (!normalized) return true;
      return (
        instrument.name.toLowerCase().includes(normalized) ||
        instrument.symbol.includes(normalized)
      );
    });
  }, [catalog, entryIds, query]);

  const runAction = async (action: () => Promise<void>) => {
    try {
      await action();
      setActionError(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div
      className={cn(
        PAGE_CONTAINER_CLASS,
        "h-auto min-h-full gap-5 px-5 py-5 lg:px-7",
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase text-primary">
            Watchlist
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold">我的观察列表</h1>
          <p className="mt-1.5 text-sm text-foreground-muted">
            选择需要每日扫描的股票和基金，并记录自己的观察依据。
          </p>
        </div>
        <div className="font-mono text-xs text-foreground-subtle">
          {watchlist.entries.filter((entry) => entry.enabled).length} ACTIVE / {watchlist.entries.length} TOTAL
        </div>
      </header>

      {(watchlist.error || actionError) && (
        <div className="border-l-2 border-accent-rose bg-accent-rose/[0.05] px-4 py-3 text-xs text-accent-rose">
          {watchlist.error ?? actionError}
        </div>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className="overflow-hidden rounded-lg border border-border bg-background-elevated/55">
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <div>
              <h2 className="text-sm font-semibold">已关注</h2>
              <p className="mt-1 text-[11px] text-foreground-muted">
                关闭扫描不会删除备注和历史记录
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">LOCAL</Badge>
          </div>

          {!watchlist.ready ? (
            <div className="space-y-2 p-4" aria-label="正在加载观察列表">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-20 rounded bg-muted shimmer" />
              ))}
            </div>
          ) : watchlist.entries.length === 0 ? (
            <div className="grid min-h-64 place-items-center p-6 text-center">
              <div>
                <Search className="mx-auto h-6 w-6 text-foreground-subtle" />
                <h3 className="mt-3 text-sm font-semibold">还没有关注任何标的</h3>
                <p className="mt-1.5 text-xs text-foreground-muted">
                  从右侧目录添加股票或基金，Dashboard 将只分析你的自选列表。
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {watchlist.entries.map((entry) => {
                const instrument = instrumentsById.get(entry.instrumentId);
                if (!instrument) return null;
                return (
                  <WatchlistRow
                    key={entry.instrumentId}
                    entry={entry}
                    instrument={instrument}
                    onUpdate={(value) =>
                      runAction(() => watchlist.update(entry.instrumentId, value))
                    }
                    onRemove={() =>
                      runAction(() => watchlist.remove(entry.instrumentId))
                    }
                  />
                );
              })}
            </div>
          )}
        </div>

        <aside className="self-start rounded-lg border border-border bg-background-elevated/55">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold">添加标的</h2>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="输入代码或名称"
                className="h-9 w-full border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="divide-y divide-border/70">
            {candidates.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-foreground-muted">
                没有可添加的匹配标的
              </div>
            ) : (
              candidates.map((instrument) => (
                <div
                  key={instrument.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {instrument.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-foreground-subtle">
                      {instrument.symbol} · {instrument.kind === "fund" ? "基金" : "A 股"}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`添加 ${instrument.name}`}
                    title={`添加 ${instrument.name}`}
                    onClick={() =>
                      void runAction(() => watchlist.add(instrument.id))
                    }
                    className="h-8 w-8 shrink-0 active:translate-y-px"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function WatchlistRow({
  entry,
  instrument,
  onUpdate,
  onRemove,
}: {
  entry: WatchlistEntry;
  instrument: Instrument;
  onUpdate: (value: { note?: string; tags?: string[]; enabled?: boolean }) => void;
  onRemove: () => void;
}) {
  const [note, setNote] = useState(entry.note);
  const [tags, setTags] = useState(entry.tags.join(", "));

  useEffect(() => setNote(entry.note), [entry.note]);
  useEffect(() => setTags(entry.tags.join(", ")), [entry.tags]);

  return (
    <div className={cn("px-4 py-4", !entry.enabled && "opacity-60")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{instrument.name}</span>
            <span className="font-mono text-[10px] text-foreground-subtle">
              {instrument.symbol} · {instrument.exchange}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {instrument.kind === "fund" ? "基金" : "A 股"}
            </Badge>
          </div>
          <div className="mt-1 text-[11px] text-foreground-subtle">
            加入于 {new Date(entry.addedAt).toLocaleDateString("zh-CN")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={entry.enabled ? `暂停扫描 ${instrument.name}` : `恢复扫描 ${instrument.name}`}
            title={entry.enabled ? "暂停扫描" : "恢复扫描"}
            onClick={() => onUpdate({ enabled: !entry.enabled })}
            className="h-8 w-8"
          >
            {entry.enabled ? (
              <CirclePause className="h-4 w-4" />
            ) : (
              <CirclePlay className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`删除 ${instrument.name}`}
            title="从观察列表删除"
            onClick={onRemove}
            className="h-8 w-8 text-accent-rose hover:text-accent-rose"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="relative block">
          <StickyNote className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-foreground-subtle" />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => note !== entry.note && onUpdate({ note })}
            placeholder="观察备注"
            className="h-8 w-full border border-input bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
          />
        </label>
        <label className="relative block">
          <Tags className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-foreground-subtle" />
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            onBlur={() => {
              const next = tags.split(/[,，]/).map((tag) => tag.trim());
              if (next.join(",") !== entry.tags.join(",")) onUpdate({ tags: next });
            }}
            placeholder="标签，用逗号分隔"
            className="h-8 w-full border border-input bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
          />
        </label>
      </div>
    </div>
  );
}

