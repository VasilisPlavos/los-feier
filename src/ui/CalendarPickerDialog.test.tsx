import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CalendarPickerDialog, type CalendarPickerProps } from "./CalendarPickerDialog";
import { clearCalendarCache } from "../data/calendars";
import { christianFixture, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import type { CalendarIndexEntry } from "../core/types";

const INDEX: CalendarIndexEntry[] = [
  { id: "en.ch", name: "Holidays in Switzerland", lang: "en", from: 2025, to: 2027, count: 12 },
  { id: "el.greek", name: "Διακοπές στην Ελλάδα", lang: "el", from: 2021, to: 2031, count: 0 },
  { id: "en.christian", name: "Christian Holidays", lang: "en", from: 2025, to: 2027, count: 3 },
];
const FILES: Record<string, unknown> = { "en.ch": zurichFixture, "en.christian": christianFixture };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const id = url.split("/").pop()!.replace(".json", "");
    return FILES[id] ? { ok: true, status: 200, json: async () => FILES[id] } : { ok: false, status: 404, json: async () => ({}) };
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCalendarCache();
});

function setup(props: Partial<CalendarPickerProps> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  renderWithI18n(
    <CalendarPickerDialog
      open
      year={2026}
      firstRun={false}
      index={INDEX}
      initial={{ calendars: [{ id: "en.ch", regions: ["Zurich"] }], includeObservances: false }}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSave, onClose };
}

const listNames = () =>
  within(screen.getByRole("list")).getAllByRole("checkbox").map((cb) => cb.closest("label")!.textContent!.trim());
const swissRegions = () => screen.findByRole("group", { name: "Regions · Holidays in Switzerland" });

describe("CalendarPickerDialog", () => {
  test("renders nothing when closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("title names the year; chosen calendars first, then the rest by name", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Holiday calendars · from 2026 onwards" })).toBeInTheDocument();
    expect(listNames()).toEqual(["Holidays in Switzerland", "Christian Holidays", "Διακοπές στην Ελλάδα"]);
  });

  test("the order does not jump while checking", async () => {
    setup();
    await userEvent.click(screen.getByLabelText("Christian Holidays"));
    expect(listNames()).toEqual(["Holidays in Switzerland", "Christian Holidays", "Διακοπές στην Ελλάδα"]);
  });

  test("search ignores case and accents", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search calendars…" }), "ελλαδα");
    expect(listNames()).toEqual(["Διακοπές στην Ελλάδα"]);
  });

  test("shows a loading text until the index is there", () => {
    setup({ index: null });
    expect(screen.getByText("Loading calendars…")).toBeInTheDocument();
  });

  test("regions: select all is tri-state and follows the region search", async () => {
    const { onSave } = setup();
    const group = await swissRegions();
    const selectAll = within(group).getByLabelText("Select all") as HTMLInputElement;
    expect(within(group).getByLabelText("Zurich")).toBeChecked();
    expect(selectAll.indeterminate).toBe(true);

    await userEvent.click(selectAll);
    expect(within(group).getByLabelText("Bern")).toBeChecked();
    expect(within(group).getByLabelText("Lucerne")).toBeChecked();
    expect(selectAll.indeterminate).toBe(false);

    await userEvent.type(within(group).getByRole("searchbox"), "luc");
    expect(within(group).queryByLabelText("Bern")).not.toBeInTheDocument();
    await userEvent.click(selectAll); // all visible are checked → unchecks only Lucerne
    await userEvent.clear(within(group).getByRole("searchbox"));
    expect(within(group).getByLabelText("Lucerne")).not.toBeChecked();
    expect(within(group).getByLabelText("Bern")).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({
      calendars: [{ id: "en.ch", regions: ["Bern", "Zurich"] }],
      includeObservances: false,
    });
  });

  test("checking adds a calendar; unchecking removes it with its regions", async () => {
    const { onSave } = setup();
    await swissRegions();
    await userEvent.click(screen.getByLabelText("Christian Holidays"));
    await userEvent.click(screen.getByLabelText("Holidays in Switzerland"));
    expect(screen.queryByRole("group", { name: "Regions · Holidays in Switzerland" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ calendars: [{ id: "en.christian", regions: [] }], includeObservances: false });
  });

  test("observances are part of the choice", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByLabelText("Treat observances as holidays"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ includeObservances: true }));
  });

  test("saving with nothing checked is allowed", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByLabelText("Holidays in Switzerland"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ calendars: [], includeObservances: false });
  });

  test("Cancel, × and Escape discard the draft", async () => {
    const { onSave, onClose } = setup();
    await userEvent.click(screen.getByLabelText("Christian Holidays"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("first run: own title, Continue, no Cancel, and Escape saves the checked calendars", async () => {
    const { onSave, onClose } = setup({
      firstRun: true,
      initial: { calendars: [{ id: "el.greek", regions: [] }], includeObservances: false },
    });
    expect(screen.getByRole("dialog", { name: "Please choose your holiday calendars" })).toBeInTheDocument();
    expect(screen.getByLabelText("Διακοπές στην Ελλάδα")).toBeChecked();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onSave).toHaveBeenCalledWith({ calendars: [{ id: "el.greek", regions: [] }], includeObservances: false });
    expect(onClose).not.toHaveBeenCalled();
  });

  test("REVIEW FOCUS: an unknown calendar id and a stale region are dropped on save", async () => {
    const { onSave } = setup({
      initial: {
        calendars: [{ id: "en.ch", regions: ["Geneva", "Zurich"] }, { id: "en.gone", regions: [] }],
        includeObservances: false,
      },
    });
    await swissRegions();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ calendars: [{ id: "en.ch", regions: ["Zurich"] }], includeObservances: false }),
    );
  });
});
