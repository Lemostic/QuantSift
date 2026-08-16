import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpenText } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BUILTIN_GLOSSARY } from "@/glossary/catalog";
import { findTermMatches } from "@/glossary/matcher";
import type { GlossaryTerm } from "@/glossary/types";

/**
 * 名词悬停解释：给词条文本加虚线下划线，悬停显示一句话定义，并附
 * “手册中查看完整解释”跳转（/glossary?term=词条）。
 */
export function TermTip({
  term,
  children,
  className,
}: {
  term: GlossaryTerm;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            "cursor-help border-b border-dotted border-primary/50 decoration-primary/40 transition-colors hover:bg-primary/[0.06]",
            className,
          )}
        >
          {children ?? term.term}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[320px] border-border/70 bg-background-overlay/95 shadow-diffusion"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            <BookOpenText size={12} className="shrink-0 text-primary" />
            {term.term}
            <span className="font-mono text-[8px] font-normal text-foreground-subtle">
              {term.category}
            </span>
          </div>
          <p className="text-[10px] leading-4 text-foreground-muted">
            {term.summary}
          </p>
          <Link
            to={`/glossary?term=${encodeURIComponent(term.term)}`}
            className="inline-flex items-center gap-1 text-[9px] font-medium text-primary hover:underline"
          >
            手册中查看完整解释
            <span aria-hidden>→</span>
          </Link>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * 自动术语标注：把文本中命中的手册词条包成 TermTip，其余原样输出。
 * 词条命中基于内置+扩展词库（useGlossary 的术语可通过 props 传入）。
 */
export function GlossaryText({
  text,
  terms = BUILTIN_GLOSSARY,
  className,
}: {
  text: string;
  terms?: GlossaryTerm[];
  className?: string;
}) {
  const segments = useMemo(() => {
    if (!text) return [{ text, matched: false, term: null as GlossaryTerm | null }];
    const matches = findTermMatches(text, terms);
    if (matches.length === 0) {
      return [{ text, matched: false, term: null as GlossaryTerm | null }];
    }
    const parts: Array<{
      text: string;
      matched: boolean;
      term: GlossaryTerm | null;
    }> = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.start > cursor) {
        parts.push({
          text: text.slice(cursor, match.start),
          matched: false,
          term: null,
        });
      }
      parts.push({
        text: text.slice(match.start, match.end),
        matched: true,
        term: match.term,
      });
      cursor = match.end;
    }
    if (cursor < text.length) {
      parts.push({ text: text.slice(cursor), matched: false, term: null });
    }
    return parts;
  }, [text, terms]);

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.matched && segment.term ? (
          <TermTip key={`${segment.term.id}-${index}`} term={segment.term}>
            {segment.text}
          </TermTip>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
