import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { makeState, zurichFixture } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import { createDefaultState } from "../state/defaults";
import type { AppState, CalendarIndexEntry } from "../core/types";

const INDEX: CalendarIndexEntry[] = [
  { id: "en.ch", name: "Holidays in Switzerland", lang: "en", from: 2021, to: 2031, count: 325 },
  { id: "el.greek", name: "Διακοπές στην Ελλάδα", lang: "el", from: 2021, to: 2031, count: 245 },
];

function setup(state: AppState = makeState()) {
  const dispatch = vi.fn();
  const onClose = vi.fn();
  renderWithI18n(
    <SettingsDialog open onClose={onClose} index={INDEX} calendar={zurichFixture} state={state} dispatch={dispatch} />,
  );
  return { dispatch, onClose };
}

afterEach(() => vi.restoreAllMocks());

describe("SettingsDialog", () => {
  test("renders nothing when closed", () => {
    renderWithI18n(<SettingsDialog open={false} onClose={() => {}} index={INDEX} calendar={null} state={makeState()} dispatch={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("search filters calendars and choosing one dispatches setCalendar", async () => {
    const { dispatch } = setup();
    await userEvent.type(screen.getByPlaceholderText("Search countries…"), "ελλ");
    expect(screen.getAllByRole("option", { name: /\(/ })).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText("Holiday calendar"), "el.greek");
    expect(dispatch).toHaveBeenCalledWith({ type: "setCalendar", id: "el.greek" });
  });

  test("changing calendar with existing rules asks for confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { dispatch } = setup(makeState({ holidayRules: { X: { enabled: false } } }));
    await userEvent.selectOptions(screen.getByLabelText("Holiday calendar"), "el.greek");
    expect(confirm).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("regions and observances", async () => {
    const { dispatch } = setup();
    expect(screen.getByLabelText("Zurich")).toBeChecked();
    await userEvent.click(screen.getByLabelText("Bern"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setRegions", regions: ["Bern", "Zurich"] });
    await userEvent.click(screen.getByLabelText("Treat observances as holidays"));
    expect(dispatch).toHaveBeenCalledWith({ type: "setIncludeObservances", value: true });
  });

  test("language and theme", async () => {
    const { dispatch } = setup();
    await userEvent.selectOptions(screen.getByLabelText("Language"), "el");
    expect(dispatch).toHaveBeenCalledWith({ type: "setLanguage", language: "el" });
    await userEvent.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(dispatch).toHaveBeenCalledWith({ type: "setTheme", theme: "dark" });
  });

  test("choosing 'System' language stores null", async () => {
    const { dispatch } = setup(makeState({ language: "el" }));
    await userEvent.selectOptions(screen.getByLabelText("Language"), "");
    expect(dispatch).toHaveBeenCalledWith({ type: "setLanguage", language: null });
  });

  test("REVIEW FOCUS: importing an invalid file shows an error and changes nothing", async () => {
    const { dispatch } = setup();
    const file = new File(["{nope"], "backup.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import JSON"), { target: { files: [file] } });
    expect(await screen.findByText("The file is not valid JSON.")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("REVIEW FOCUS: importing a newer version is refused", async () => {
    const { dispatch } = setup();
    const file = new File([JSON.stringify({ ...createDefaultState(), version: 2 })], "b.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import JSON"), { target: { files: [file] } });
    expect(await screen.findByText("The file was made by a newer version of the app.")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("importing a valid file asks and replaces the state", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { dispatch } = setup();
    const imported = { ...createDefaultState(), theme: "dark" };
    const file = new File([JSON.stringify(imported)], "b.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Import JSON"), { target: { files: [file] } });
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: "replaceState", state: imported }));
  });

  test("reset asks first; Escape closes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { dispatch, onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Reset everything" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "reset" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
