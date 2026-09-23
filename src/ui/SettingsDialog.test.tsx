import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { makeState } from "../test/fixtures";
import { renderWithI18n } from "../test/render";
import { createDefaultState } from "../state/defaults";
import type { AppState } from "../core/types";

function setup(state: AppState = makeState()) {
  const dispatch = vi.fn();
  const onClose = vi.fn();
  renderWithI18n(
    <SettingsDialog open onClose={onClose} state={state} dispatch={dispatch} />,
  );
  return { dispatch, onClose };
}

afterEach(() => vi.restoreAllMocks());

describe("SettingsDialog", () => {
  test("renders nothing when closed", () => {
    renderWithI18n(<SettingsDialog open={false} onClose={() => {}} state={makeState()} dispatch={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("has no calendar options any more", () => {
    setup();
    expect(screen.queryByText("Holiday calendar")).not.toBeInTheDocument();
    expect(screen.queryByText("Regions")).not.toBeInTheDocument();
    expect(screen.queryByText("Treat observances as holidays")).not.toBeInTheDocument();
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
    const file = new File([JSON.stringify({ ...createDefaultState(), version: 3 })], "b.json", { type: "application/json" });
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

  test("REVIEW FOCUS: opening moves focus into the dialog; Escape from anywhere restores it to the opener (F1)", async () => {
    const opener = document.createElement("button");
    opener.textContent = "open settings";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const onClose = vi.fn();
    renderWithI18n(
      <SettingsDialog open onClose={onClose} state={makeState()} dispatch={() => {}} />,
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement));
    expect(document.activeElement).not.toBe(opener);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });

  test("F1: Tab wraps focus at the end of the dialog back to the start", async () => {
    setup();
    const dialog = screen.getByRole("dialog");
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  test("F5: choosing a file clears the input's value afterwards, so re-choosing the same file fires change again", async () => {
    setup();
    const input = screen.getByLabelText("Import JSON") as HTMLInputElement;
    // jsdom reports "" for a file input's .value both before and after a file is chosen, so
    // reading input.value after the fact can't tell fixed from unfixed code. Instead, shadow the
    // instance's own "value" accessor (jsdom defines one per-element, not just on the prototype)
    // to record every write, the way a real browser's "only '' is a legal value" rule would let
    // us observe the reset that re-arms the input for picking the same file again.
    const own = Object.getOwnPropertyDescriptor(input, "value")!;
    const writes: string[] = [];
    Object.defineProperty(input, "value", {
      configurable: true,
      get: own.get,
      set(v: string) {
        writes.push(v);
        own.set!.call(this, v);
      },
    });
    const file = new File(["{nope"], "backup.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText("The file is not valid JSON.");
    expect(writes).toContain("");
  });
});
