import { useEffect, useRef, type KeyboardEvent } from "react";
import { addDays } from "../core/dates";
import type { DayResolver } from "../core/days";
import { MonthCard } from "./MonthCard";

interface Props {
  year: number;
  resolve: DayResolver;
  today: string;
  stretchDays: ReadonlySet<string>;
  highlightDays: ReadonlySet<string>;
  onToggle(date: string, room: number): void;
}

const MOVES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export function YearGrid({ year, resolve, today, stretchDays, highlightDays, onToggle }: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  // Bring the current month's column into view sideways only: scrollIntoView would also scroll the
  // page down and hide the hero. The scroller is position: relative, so offsetLeft is measured from it.
  useEffect(() => {
    if (Number(today.slice(0, 4)) !== year) return;
    const el = scroller.current;
    const current = el?.querySelector<HTMLElement>(`[data-month="${Number(today.slice(5, 7))}"]`);
    if (el && current) el.scrollLeft = current.offsetLeft;
  }, [year, today]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = MOVES[e.key];
    const date = (e.target as HTMLElement).dataset.date;
    if (!delta || !date) return;
    const target = e.currentTarget.querySelector<HTMLButtonElement>(`[data-date="${addDays(date, delta)}"]`);
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };

  return (
    <div className="grid-scroller" data-testid="grid-scroller" ref={scroller} onKeyDown={onKeyDown}>
      <div className="year-grid" data-testid="year-grid">
        {Array.from({ length: 12 }, (_, i) => (
          <MonthCard
            key={i + 1}
            year={year}
            month={i + 1}
            resolve={resolve}
            today={today}
            stretchDays={stretchDays}
            highlightDays={highlightDays}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
