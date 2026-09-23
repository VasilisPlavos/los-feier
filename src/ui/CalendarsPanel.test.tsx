import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CalendarsPanel, type CalendarsPanelProps } from "./CalendarsPanel";
import { makeProfile, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import type { CalendarIndexEntry } from "../core/types";

const INDEX: CalendarIndexEntry[] = [
  { id: "en.ch", name: "Holidays in Switzerland", lang: "en", from: 2025, to: 2027, count: 12 },
  { id: "en.christian", name: "Christian Holidays", lang: "en", from: 2025, to: 2027, count: 3 },
];
const two = makeProfile({ calendars: [{ id: "en.ch", regions: ["Bern", "Zurich"] }, { id: "en.christian", regions: [] }] });

function setup(props: Partial<CalendarsPanelProps> = {}) {
  const onEdit = vi.fn();
  const onRemoveProfile = vi.fn();
  const view = renderWithI18n(
    <CalendarsPanel
      year={2026}
      profiles={{ "2026": two }}
      index={INDEX}
      loaded={[]}
      failed={[]}
      onEdit={onEdit}
      onRemoveProfile={onRemoveProfile}
      {...props}
    />,
  );
  return { onEdit, onRemoveProfile, ...view };
}

const toggle = (name: RegExp) => screen.getByRole("button", { name });

afterEach(() => vi.restoreAllMocks());

describe("CalendarsPanel", () => {
  test("collapsed by default; expanding lists calendars with regions and is remembered", async () => {
    const { unmount } = setup();
    const button = toggle(/Calendars \(2\) · from 2026/);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Christian Holidays")).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.getByText("Holidays in Switzerland — Bern, Zurich")).toBeInTheDocument();
    expect(screen.getByText("Christian Holidays")).toBeInTheDocument();
    unmount();

    setup();
    expect(toggle(/Calendars \(2\)/)).toHaveAttribute("aria-expanded", "true");
  });

  test("'from' names the configured year that covers the year on screen", () => {
    setup({ profiles: { "2024": two } });
    expect(toggle(/from 2024/)).toBeInTheDocument();
  });

  test("Change opens the picker", async () => {
    const { onEdit } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(onEdit).toHaveBeenCalled();
  });

  test("no calendars: 'No calendar' and 'Choose'", async () => {
    const { onEdit } = setup({ profiles: {} });
    expect(toggle(/No calendar/)).toBeInTheDocument();
    expect(screen.queryByText(/from/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Choose" }));
    expect(onEdit).toHaveBeenCalled();
  });

  test("remove shows only for a configured year that is not the only one", async () => {
    const { onRemoveProfile, unmount } = setup({ profiles: { "2020": two, "2026": two } });
    await userEvent.click(toggle(/Calendars/));
    await userEvent.click(screen.getByRole("button", { name: "Remove the 2026 settings" }));
    expect(onRemoveProfile).toHaveBeenCalledWith(2026);
    unmount();

    setup({ year: 2027, profiles: { "2020": two, "2026": two } }); // 2027 has no profile of its own
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });

  test("the only profile cannot be removed", async () => {
    setup();
    await userEvent.click(toggle(/Calendars/));
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });

  test("REVIEW FOCUS: failed and unknown calendars are marked; stale regions are hidden", async () => {
    const profile = makeProfile({
      calendars: [
        { id: "en.ch", regions: ["Geneva", "Zurich"] },
        { id: "en.christian", regions: [] },
        { id: "en.gone", regions: [] },
      ],
    });
    setup({ profiles: { "2026": profile }, loaded: [zurichFixture], failed: ["en.christian"] });
    await userEvent.click(toggle(/Calendars \(3\)/));
    expect(screen.getByText("Holidays in Switzerland — Zurich")).toBeInTheDocument();
    expect(screen.getByText("Christian Holidays").closest("li")).toHaveTextContent("could not be loaded");
    expect(screen.getByText("en.gone").closest("li")).toHaveTextContent("no longer available");
  });

  test("REVIEW FOCUS: blocked localStorage still lets the panel open and close", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setup();
    await userEvent.click(toggle(/Calendars/));
    expect(toggle(/Calendars/)).toHaveAttribute("aria-expanded", "true");
  });
});
