import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { YearGrid } from "./YearGrid";
import { createDayResolver } from "../core/days";
import { makeState, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";

function setup(stateOverrides = {}, onToggle = vi.fn()) {
  const resolve = createDayResolver(makeState(stateOverrides), [zurichFixture]);
  renderWithI18n(
    <YearGrid year={2026} resolve={resolve} today="2026-04-07" stretchDays={new Set(["2026-04-03"])}
      highlightDays={new Set()} onToggle={onToggle} />,
  );
  return { onToggle };
}

const day = (date: string) => document.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;

describe("YearGrid", () => {
  test("renders 12 months in calendar order with the right number of days", () => {
    setup();
    const months = screen.getByTestId("year-grid").querySelectorAll("[data-month]");
    expect([...months].map((m) => m.getAttribute("data-month"))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(within(months[1] as HTMLElement).getAllByRole("button")).toHaveLength(28);
    expect(screen.getByRole("heading", { name: "April" })).toBeInTheDocument();
  });

  test("first of the month is placed under its weekday (1 April 2026 = Wednesday)", () => {
    setup();
    const april = document.querySelector('[data-month="4"] .days')!;
    const blanks = april.querySelectorAll(".day-blank");
    expect(blanks).toHaveLength(2);
    expect(day("2026-04-01").dataset.weekday).toBe("2");
  });

  test("marks holidays, weekends, leave, today and stretches", () => {
    setup({ leave: { "2026-04-08": 0.5, "2026-04-06": 1 } });
    expect(day("2026-04-03").dataset.holiday).toBe("1");
    expect(day("2026-04-04").dataset.weekly).toBe("1");
    expect(day("2026-04-08").dataset.leave).toBe("0.5");
    expect(day("2026-04-06").dataset.redundant).toBe("true");
    expect(day("2026-04-07").dataset.today).toBe("true");
    expect(day("2026-04-03").dataset.stretch).toBe("true");
    expect(day("2026-04-03")).toHaveAccessibleName(/Friday, April 3, 2026.*holiday: Good Friday/);
  });

  test("clicking a working day toggles leave with its room", async () => {
    const { onToggle } = setup();
    await userEvent.click(day("2026-04-07"));
    expect(onToggle).toHaveBeenCalledWith("2026-04-07", 1);
  });

  test("clicking an already free day does nothing, but clears redundant leave", async () => {
    const { onToggle } = setup({ leave: { "2026-04-06": 1 } });
    await userEvent.click(day("2026-04-04"));
    expect(onToggle).not.toHaveBeenCalled();
    expect(day("2026-04-04").title).toMatch(/Already a day off/);
    await userEvent.click(day("2026-04-06"));
    expect(onToggle).toHaveBeenCalledWith("2026-04-06", 0);
  });

  test("arrow keys move focus by day and week, across months", () => {
    setup();
    day("2026-04-30").focus();
    fireEvent.keyDown(day("2026-04-30"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(day("2026-05-01"));
    fireEvent.keyDown(day("2026-05-01"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(day("2026-04-24"));
  });
});
