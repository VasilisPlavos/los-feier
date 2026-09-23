import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { HolidayListPanel } from "./HolidayListPanel";
import { resolveYearHolidays } from "../core/holidays";
import { makeState, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import type { AppState } from "../core/types";

function setup(state: AppState = makeState()) {
  const dispatch = vi.fn();
  renderWithI18n(
    <HolidayListPanel year={2026} holidays={resolveYearHolidays(state, zurichFixture, 2026)} state={state} dispatch={dispatch} />,
  );
  return dispatch;
}

const row = (name: string, index = 0) => screen.getAllByText(name)[index].closest("li")!;

describe("HolidayListPanel", () => {
  test("lists visible holidays including observances", () => {
    setup();
    expect(screen.getByText("Good Friday")).toBeInTheDocument();
    expect(screen.getAllByText("Knabenschiessen (Zurich)")).toHaveLength(3);
    expect(screen.queryByText("Saint Joseph's Day")).not.toBeInTheDocument();
    expect(within(row("Knabenschiessen (Zurich)")).getByRole("checkbox")).not.toBeChecked();
  });

  test("enabling an observance for all years", async () => {
    const dispatch = setup();
    await userEvent.click(within(row("Knabenschiessen (Zurich)")).getByRole("checkbox"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setHolidayRule", name: "Knabenschiessen (Zurich)", scope: "all", rule: { enabled: true } });
  });

  test("making a holiday half keeps the existing rule fields", async () => {
    const dispatch = setup(makeState({ holidayRules: { "Knabenschiessen (Zurich)": { enabled: true } } }));
    await userEvent.click(within(row("Knabenschiessen (Zurich)")).getByRole("button", { name: /half day/ }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setHolidayRule", name: "Knabenschiessen (Zurich)", scope: "all", rule: { enabled: true, fraction: 0.5 },
    });
  });

  test("scope 'Only 2026' writes a year override, badge undoes it", async () => {
    const state = makeState({ yearOverrides: { "2026": { "St. Stephen's Day": { enabled: false } } } });
    const dispatch = setup(state);
    await userEvent.selectOptions(screen.getByRole("combobox"), "year");
    await userEvent.click(within(row("Good Friday")).getByRole("checkbox"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setHolidayRule", name: "Good Friday", scope: 2026, rule: { enabled: false } });
    await userEvent.click(within(row("St. Stephen's Day")).getByRole("button", { name: /only 2026/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "setHolidayRule", name: "St. Stephen's Day", scope: 2026, rule: null });
  });

  test("custom holiday: ½ edits it, checkbox disabled for all years, × deletes", async () => {
    const state = makeState({
      customHolidays: [{ id: "c1", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }],
    });
    const dispatch = setup(state);
    const r = row("Company day");
    expect(within(r).getByRole("checkbox")).toBeDisabled();
    await userEvent.click(within(r).getByRole("button", { name: /half day/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "updateCustomHoliday", id: "c1", changes: { fraction: 0.5 } });
    await userEvent.click(within(r).getByRole("button", { name: /Delete/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "removeCustomHoliday", id: "c1" });
  });

  test("adding a custom holiday", async () => {
    const dispatch = setup();
    await userEvent.click(screen.getByRole("button", { name: "+ My holiday" }));
    await userEvent.type(screen.getByLabelText("Name"), "Company day");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-06-15" } });
    await userEvent.click(screen.getByLabelText("Half day"));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "addCustomHoliday",
      holiday: expect.objectContaining({ name: "Company day", fraction: 0.5, rule: { type: "yearly", month: 6, day: 15 } }),
    });
  });

  test("adding with an empty name does nothing", async () => {
    const dispatch = setup();
    await userEvent.click(screen.getByRole("button", { name: "+ My holiday" }));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(dispatch).not.toHaveBeenCalled();
  });
});
