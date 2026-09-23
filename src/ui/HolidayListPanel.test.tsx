import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { HolidayListPanel } from "./HolidayListPanel";
import { resolveYearHolidays } from "../core/holidays";
import { christianFixture, makeProfile, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import type { CalendarFile, YearProfile } from "../core/types";

const NAMES = { "en.ch": "Holidays in Switzerland", "en.christian": "Christian Holidays" };

function setup(profile: YearProfile = makeProfile(), calendars: CalendarFile[] = [zurichFixture]) {
  const dispatch = vi.fn();
  renderWithI18n(
    <HolidayListPanel
      year={2026}
      holidays={resolveYearHolidays(profile, calendars, 2026)}
      profile={profile}
      calendarNames={NAMES}
      dispatch={dispatch}
    />,
  );
  return dispatch;
}

const row = (name: string, index = 0) => screen.getAllByText(name)[index].closest("li")!;

describe("HolidayListPanel", () => {
  test("lists visible holidays including observances, without a scope choice", () => {
    setup();
    expect(screen.getByText("Good Friday")).toBeInTheDocument();
    expect(screen.getAllByText("Knabenschiessen (Zurich)")).toHaveLength(3);
    expect(screen.queryByText("Saint Joseph's Day")).not.toBeInTheDocument();
    expect(within(row("Knabenschiessen (Zurich)")).getByRole("checkbox")).not.toBeChecked();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("enabling an observance writes a rule for the year on screen", async () => {
    const dispatch = setup();
    await userEvent.click(within(row("Knabenschiessen (Zurich)")).getByRole("checkbox"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setHolidayRule", year: 2026, name: "Knabenschiessen (Zurich)", rule: { enabled: true },
    });
  });

  test("making a holiday half keeps the existing rule fields", async () => {
    const dispatch = setup(makeProfile({ holidayRules: { "Knabenschiessen (Zurich)": { enabled: true } } }));
    await userEvent.click(within(row("Knabenschiessen (Zurich)")).getByRole("button", { name: /half day/ }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setHolidayRule", year: 2026, name: "Knabenschiessen (Zurich)", rule: { enabled: true, fraction: 0.5 },
    });
  });

  test("custom holiday: checkbox writes a rule, ½ edits it, × deletes it", async () => {
    const dispatch = setup(
      makeProfile({ customHolidays: [{ id: "c1", name: "Company day", fraction: 1, rule: { type: "yearly", month: 6, day: 15 } }] }),
    );
    const r = row("Company day");
    await userEvent.click(within(r).getByRole("checkbox"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setHolidayRule", year: 2026, name: "Company day", rule: { enabled: false } });
    await userEvent.click(within(r).getByRole("button", { name: /half day/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "updateCustomHoliday", year: 2026, id: "c1", changes: { fraction: 0.5 } });
    await userEvent.click(within(r).getByRole("button", { name: /Delete/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: "removeCustomHoliday", year: 2026, id: "c1" });
  });

  test("with several calendars each holiday names its calendars", () => {
    const profile = makeProfile({ calendars: [{ id: "en.ch", regions: ["Zurich"] }, { id: "en.christian", regions: [] }] });
    setup(profile, [zurichFixture, christianFixture]);
    expect(row("Good Friday")).toHaveTextContent("Holidays in Switzerland, Christian Holidays");
    expect(row("Christmas Eve")).toHaveTextContent("Christian Holidays");
  });

  test("with one calendar no calendar names are shown", () => {
    setup();
    expect(row("Good Friday")).not.toHaveTextContent("Holidays in Switzerland");
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
      year: 2026,
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
