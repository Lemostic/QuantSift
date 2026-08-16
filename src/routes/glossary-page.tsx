import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowClockwise,
  BookOpenText,
  MagnifyingGlass,
  Warning,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PAGE_CONTAINER_CLASS } from "@/lib/spacing";
import { useGlossary, useGlossarySearch } from "@/glossary/use-glossary";
import { GLOSSARY_CATEGORIES } from "@/glossary/types";
import type { GlossaryCategory } from "@/glossary/types";
import { GlossaryText } from "@/components/glossary/term-tooltip";

export function GlossaryPage() {
  const glossary = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GlossaryCategory | "全部">("全部");

  const requestedTerm = searchParams.get("term");
  const results = useGlossarySearch(glossary.terms, query, category);
  const selected = useMemo(
    () =>
      results.find((term) => term.term === requestedTerm) ??
      results.find((term) => term.term === query.trim()) ??
      results[0] ??
      null,
    [results, requestedTerm, query],
  );

  // 从 tooltip 跳转进入时定位到对应词条
  useEffect(() => {
    if (requestedTerm) setQuery(requestedTerm);
  }, [requestedTerm]);

  const handleUpdate = async () => {
    try {
      await glossary.update();
    } catch {
      // 错误已通过 glossary.error 展示
    }
  };

  return (
    <div
      className={cn(
        PAGE_CONTAINER_CLASS,
        "h-auto min-h-full gap-4 px-4 py-4 sm:px-5 lg:px-7 lg:py-5",
      )}
    >
      <header className="flex flex-col gap-3 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between sm:pb-4">
        <div>
          <div className="font-mono text-[9px] font-semibold text-primary">
            REFERENCE / GLOSSARY
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold sm:text-2xl">投资术语手册</h1>
            <p className="text-[11px] text-foreground-muted sm:text-xs">
              炒股与基金专有名词速查 · 界面任意虚线下划线词语均可悬停查看
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="font-mono text-[9px] text-foreground-subtle sm:text-right">
            <div>{glossary.terms.length} TERMS</div>
            <div className="mt-0.5 text-foreground-muted">
              {glossary.updatedAt
                ? `更新于 ${new Date(glossary.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                : "内置版本"}
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => void handleUpdate()}
            disabled={glossary.updating}
            className="gap-2 active:scale-[0.98]"
          >
            <ArrowClockwise
              size={15}
              className={cn(glossary.updating && "animate-spin")}
            />
            {glossary.updating ? "更新中" : "更新手册"}
          </Button>
        </div>
      </header>

      {glossary.error && (
        <div className="flex items-start gap-2.5 border-l-2 border-accent-amber bg-accent-amber/[0.05] px-3 py-2.5">
          <Warning size={15} className="mt-0.5 shrink-0 text-accent-amber" />
          <p className="text-[11px] leading-4 text-foreground-muted">
            {glossary.error}（内置手册仍可用；可稍后重试或检查网络）
          </p>
        </div>
      )}

      {!glossary.ready ? (
        <div aria-label="正在加载术语手册" className="h-72 bg-muted/50 shimmer" />
      ) : (
        <section className="grid min-h-0 gap-4 xl:grid-cols-[minmax(280px,0.62fr)_minmax(0,2fr)]">
          <aside className="min-w-0 overflow-hidden rounded-lg border border-border bg-background-elevated/55">
            <div className="border-b border-border p-3 sm:px-4">
              <div className="relative">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-foreground-subtle"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索术语，如：复权、MACD、止损"
                  aria-label="搜索术语"
                  className="w-full rounded-md border border-border/60 bg-background py-1.5 pl-8 pr-2 text-xs focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(["全部", ...GLOSSARY_CATEGORIES] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[9px] transition-colors",
                      category === item
                        ? "border-primary/40 bg-primary/[0.08] text-primary"
                        : "border-border/60 text-foreground-muted hover:border-border",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[64vh] divide-y divide-border/70 overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-4 py-8 text-center text-[11px] text-foreground-muted">
                  没有匹配的术语
                </p>
              ) : (
                results.map((term) => (
                  <button
                    key={term.id}
                    type="button"
                    onClick={() => {
                      setQuery(term.term);
                      setSearchParams({ term: term.term }, { replace: true });
                    }}
                    className={cn(
                      "w-full px-3 py-2.5 text-left transition-colors hover:bg-accent/55 sm:px-4",
                      selected?.id === term.id && "bg-primary/[0.075]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{term.term}</span>
                      {term.source === "web" && (
                        <Badge variant="outline" className="shrink-0 text-[8px] text-primary">
                          WEB
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[8px] text-foreground-subtle">
                      <span>{term.category}</span>
                      {term.aliases && term.aliases.length > 0 && (
                        <span>别名 {term.aliases.join(" / ")}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          {selected ? (
            <motion.article
              key={selected.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-w-0 overflow-hidden rounded-lg border border-border bg-background-elevated/55"
            >
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{selected.term}</h2>
                    <Badge variant="outline" className="text-[8px] text-primary">
                      {selected.category}
                    </Badge>
                    {selected.source === "web" && (
                      <Badge variant="outline" className="text-[8px] text-primary">
                        网络更新
                      </Badge>
                    )}
                  </div>
                  {selected.aliases && selected.aliases.length > 0 && (
                    <div className="mt-1 font-mono text-[9px] text-foreground-subtle">
                      别名：{selected.aliases.join("、")}
                    </div>
                  )}
                </div>
                {selected.updatedAt && (
                  <span className="font-mono text-[9px] text-foreground-subtle">
                    更新于 {new Date(selected.updatedAt).toLocaleDateString("zh-CN")}
                  </span>
                )}
              </div>
              <div className="space-y-4 p-4">
                <div className="rounded-md border border-primary/20 bg-primary/[0.05] px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[10px] font-semibold">
                    <BookOpenText size={13} className="text-primary" />
                    一句话理解
                  </div>
                  <p className="mt-1 text-xs leading-5">{selected.summary}</p>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-foreground-muted">
                    详细解释
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-foreground-muted">
                    <GlossaryText text={selected.detail} terms={glossary.terms} />
                  </p>
                </div>
              </div>
            </motion.article>
          ) : (
            <div className="grid min-h-72 place-items-center border border-border text-xs text-foreground-muted">
              在左侧选择或搜索一个术语
            </div>
          )}
        </section>
      )}
    </div>
  );
}
