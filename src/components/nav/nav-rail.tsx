import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BellSimpleRinging,
  BookOpenText,
  Brain,
  Briefcase,
  CalendarDots,
  ChartLine,
  ChartLineUp,
  GearSix,
  ListChecks,
  Pulse,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: Icon;
}

const WORKSPACE_NAV: NavItem[] = [
  { to: "/", label: "研究工作台", shortLabel: "研究", icon: ChartLineUp },
  { to: "/watchlist", label: "我的观察列表", shortLabel: "自选", icon: ListChecks },
  { to: "/portfolio", label: "持仓研究", shortLabel: "持仓", icon: Briefcase },
  { to: "/backtest", label: "回测研究", shortLabel: "回测", icon: ChartLine },
  { to: "/intelligence", label: "智能分析", shortLabel: "智能", icon: Brain },
  { to: "/glossary", label: "术语手册", shortLabel: "手册", icon: BookOpenText },
  { to: "/scans", label: "自动扫描", shortLabel: "扫描", icon: CalendarDots },
  { to: "/alerts", label: "提醒中心", shortLabel: "提醒", icon: BellSimpleRinging },
];

export function NavRail() {
  return (
    <aside className="relative flex h-full w-[68px] shrink-0 flex-col border-r border-border/80 bg-background-elevated/70 sm:w-[82px]">
      <div className="grid h-[72px] place-items-center border-b border-border/70">
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to="/"
              aria-label="QuantSift 研究工作台"
              className="relative grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-transform active:scale-[0.96]"
            >
              <Pulse size={22} weight="bold" />
              <motion.span
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background-elevated bg-accent-emerald"
                animate={{ scale: [1, 1.22, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right">QuantSift · 日频研究</TooltipContent>
        </Tooltip>
      </div>

      <nav className="flex flex-1 flex-col items-center gap-2 px-2 py-4">
        {WORKSPACE_NAV.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}
      </nav>

      <div className="border-t border-border/70 px-2 py-3">
        <RailLink
          item={{
            to: "/modules/preferences",
            label: "偏好设置",
            shortLabel: "设置",
            icon: GearSix,
          }}
        />
      </div>
    </aside>
  );
}

function RailLink({ item }: { item: NavItem }) {
  const IconComponent = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={item.to}
          end={item.to === "/"}
          aria-label={item.label}
          className={({ isActive }) =>
            cn(
              "group relative flex h-[52px] w-full flex-col items-center justify-center gap-1 rounded-md text-[9px] font-medium transition-colors active:scale-[0.98] sm:h-[56px]",
              isActive
                ? "bg-primary/[0.11] text-primary"
                : "text-foreground-subtle hover:bg-accent/70 hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="nav-signal"
                  className="absolute -left-2 top-2 bottom-2 w-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 220, damping: 24 }}
                />
              )}
              <IconComponent
                size={20}
                weight={isActive ? "fill" : "regular"}
                className="transition-transform duration-300 group-hover:-translate-y-0.5"
              />
              <span>{item.shortLabel}</span>
            </>
          )}
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
