import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { WeeklyPlanPanel } from "./WeeklyPlanPanel";
import { SummaryPanel } from "./SummaryPanel";
import { renderWithI18n } from "../test/render";
import type { Stretch } from "../core/types";

describe("WeeklyPlanPanel", () => {
  test("shows 7 days with their state and cycles on click", async () => {
    const onCycle = vi.fn();
    renderWithI18n(<WeeklyPlanPanel plan={[0, 0, 0, 0, 0.5, 1, 1]} onCycle={onCycle} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);
    expect(buttons[0]).toHaveAccessibleName("Mon: Working day");
    expect(buttons[4]).toHaveAccessibleName("Fri: Half day off");
    expect(buttons[6]).toHaveAccessibleName("Sun: Day off");
    await userEvent.click(buttons[4]);
    expect(onCycle).toHaveBeenCalledWith(4);
  });

  test("Greek labels", () => {
    renderWithI18n(<WeeklyPlanPanel plan={[0, 0, 0, 0, 0, 1, 1]} onCycle={() => {}} />, "el");
    expect(screen.getByRole("heading", { name: "Εβδομαδιαίο πλάνο" })).toBeInTheDocument();
  });
});

describe("SummaryPanel", () => {
  const easter: Stretch = { start: "2026-04-03", end: "2026-04-06", length: 4, leaveUsed: 0 };
  const xmas: Stretch = { start: "2026-12-25", end: "2026-12-27", length: 3, leaveUsed: 0.5 };

  test("shows the leave total and stretches grouped by length", () => {
    renderWithI18n(<SummaryPanel leaveTotal={2.5} stretches={[easter, xmas]} selected={null} onSelect={() => {}} />);
    expect(screen.getByRole("heading", { name: "Leave days: 2.5" })).toBeInTheDocument();
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["4-day breaks", "3-day breaks"]);
    expect(screen.getByRole("button", { name: /4 days · 0 leave/ })).toBeInTheDocument();
  });

  test("selecting and deselecting a stretch", async () => {
    const onSelect = vi.fn();
    const { rerender } = renderWithI18n(<SummaryPanel leaveTotal={0} stretches={[easter]} selected={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /4 days/ }));
    expect(onSelect).toHaveBeenLastCalledWith(easter);
    rerender(<SummaryPanel leaveTotal={0} stretches={[easter]} selected={easter} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /4 days/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: /4 days/ }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  test("empty state", () => {
    renderWithI18n(<SummaryPanel leaveTotal={0} stretches={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText("No breaks of 3 or more days yet.")).toBeInTheDocument();
  });
});
