import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import { clearCalendarCache } from "./data/calendars";
import { STORAGE_KEY } from "./state/storage";
import { christianFixture, makeCalendar, makeState, zurichFixture } from "./test/fixtures";

const longFixture = makeCalendar("en.long", "Long Calendar", [], 2021, 2031);

const INDEX = [
  { id: "en.ch", name: "Holidays in Switzerland", lang: "en", from: 2025, to: 2027, count: 12 },
  { id: "el.greek", name: "Διακοπές στην Ελλάδα", lang: "el", from: 2021, to: 2031, count: 0 },
  { id: "en.christian", name: "Christian Holidays", lang: "en", from: 2025, to: 2027, count: 3 },
  { id: "en.long", name: "Long Calendar", lang: "en", from: 2021, to: 2031, count: 0 },
];

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("index.json")) return { ok: true, status: 200, json: async () => INDEX };
    if (url.endsWith("en.ch.json")) return { ok: true, status: 200, json: async () => zurichFixture };
    if (url.endsWith("en.christian.json")) return { ok: true, status: 200, json: async () => christianFixture };
    if (url.endsWith("en.long.json")) return { ok: true, status: 200, json: async () => longFixture };
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function setLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, "languages", { value: languages, configurable: true });
}

beforeEach(() => {
  window.location.hash = "#2026";
  setLanguages(["en-US"]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCalendarCache();
});

const seed = (overrides = {}) => localStorage.setItem(STORAGE_KEY, JSON.stringify(makeState(overrides)));

describe("App", () => {
  test("shows the Los Feier brand in the header in every language", async () => {
    stubFetch();
    seed({ language: "el" });
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1, name: "Los Feier!" })).toBeInTheDocument();
  });

  test("the header bar has the year, About and Settings, and no year arrows", async () => {
    stubFetch();
    seed();
    render(<App />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("combobox", { name: "Year" })).toHaveValue("2026");
    expect(within(header).getByRole("button", { name: "About" })).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous year" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next year" })).not.toBeInTheDocument();
  });

  test("the year list runs from the first to the last year in the calendar data", async () => {
    stubFetch();
    seed();
    render(<App />);
    const select = screen.getByRole("combobox", { name: "Year" });
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(11));
    expect(within(select).getAllByRole("option")[0]).toHaveTextContent("2021");
    expect(within(select).getAllByRole("option")[10]).toHaveTextContent("2031");
  });

  test("a year outside the data in the link moves to the nearest year with data", async () => {
    stubFetch();
    seed();
    window.location.hash = "#2040";
    render(<App />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Year" })).toHaveValue("2031"));
    expect(window.location.hash).toBe("#2031");
  });

  test("the hero introduces the year on screen", async () => {
    stubFetch();
    seed();
    render(<App />);
    expect(screen.getByRole("heading", { level: 2, name: "Holiday calendar 2026" })).toBeInTheDocument();
  });

  test("About opens the about dialog", async () => {
    stubFetch();
    seed();
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "About" }));
    expect(screen.getByRole("dialog", { name: "About Los Feier" })).toBeInTheDocument();
  });

  test("first run asks for calendars with the browser-language suggestion checked", async () => {
    stubFetch();
    setLanguages(["de-CH"]);
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: "Please choose your holiday calendars" });
    expect(within(dialog).getByLabelText("Holidays in Switzerland")).toBeChecked();
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const thisYear = String(new Date().getFullYear());
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles[thisYear].calendars).toEqual([{ id: "en.ch", regions: [] }]),
    );
  });

  test("REVIEW FOCUS: first run without a suggestion, closed with Escape, saves an empty profile and does not reopen", async () => {
    stubFetch();
    setLanguages(["xx"]);
    render(<App />);
    const dialog = await screen.findByRole("dialog", { name: "Please choose your holiday calendars" });
    expect(within(dialog).getAllByRole("checkbox").filter((cb) => (cb as HTMLInputElement).checked)).toEqual([]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const thisYear = String(new Date().getFullYear());
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles[thisYear].calendars).toEqual([]));
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-date="2026-04-07"]')!);
    expect(screen.getByRole("heading", { name: "Leave days: 1" })).toBeInTheDocument();
  });

  test("a change in another year creates that year's settings, which can be removed", async () => {
    stubFetch();
    seed();
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Year" }), "2027");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Counts as holiday: New Year's Day" }));
    const stored = () => Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles).sort();
    await waitFor(() => expect(stored()).toEqual(["2020", "2027"]));
    expect(screen.getByRole("button", { name: /Calendars \(1\) · from 2027/ })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Year" }), "2026");
    expect(screen.getByRole("button", { name: /from 2020/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Counts as holiday: New Year's Day" })).toBeChecked();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Year" }), "2027");
    await userEvent.click(screen.getByRole("button", { name: /Calendars \(1\)/ }));
    await userEvent.click(screen.getByRole("button", { name: "Remove the 2027 settings" }));
    await waitFor(() => expect(stored()).toEqual(["2020"]));
    expect(screen.getByRole("checkbox", { name: "Counts as holiday: New Year's Day" })).toBeChecked();
  });

  test("Change opens the picker for the year on screen and saves a second calendar", async () => {
    stubFetch();
    seed();
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    const dialog = screen.getByRole("dialog", { name: "Holiday calendars · from 2026 onwards" });
    await userEvent.click(within(dialog).getByLabelText("Christian Holidays"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).profiles["2026"].calendars).toEqual([
        { id: "en.ch", regions: ["Zurich"] },
        { id: "en.christian", regions: [] },
      ]),
    );
    expect(await screen.findByText("Christmas Eve")).toBeInTheDocument();
  });

  test("REVIEW: a calendar that is no longer in the index gives no un-retryable load-error banner", async () => {
    const fetchMock = stubFetch();
    seed({ calendars: [{ id: "en.ch", regions: ["Zurich"] }, { id: "en.gone", regions: [] }] });
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await waitFor(() => expect(screen.queryByText("The holiday calendar could not be loaded.")).not.toBeInTheDocument());
    const before = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: /Calendars \(2\)/ }));
    expect(screen.getByText("en.gone").closest("li")).toHaveTextContent("no longer available");
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  test("a year where only some calendars have data names the missing ones", async () => {
    stubFetch();
    seed({ calendars: [{ id: "en.ch", regions: ["Zurich"] }, { id: "en.long", regions: [] }] });
    window.location.hash = "#2028";
    render(<App />);
    // zurichFixture ends in 2027, the "Long Calendar" fixture runs to 2031:
    expect(await screen.findByText("There is no 2028 holiday data for: Holidays in Switzerland.")).toBeInTheDocument();
    expect(screen.queryByText(/There is no holiday data for 2028/)).not.toBeInTheDocument();
  });

  test("clicking a day updates the leave total and is saved", async () => {
    stubFetch();
    seed();
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-date="2026-04-07"]')!);
    expect(screen.getByRole("heading", { name: "Leave days: 1" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).leave).toEqual({ "2026-04-07": 1 });
  });

  test("choosing a year updates the hash", async () => {
    stubFetch();
    seed();
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Year" }), "2027");
    expect(screen.getByRole("heading", { name: "Holiday calendar 2027" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#2027");
  });

  test("REVIEW FOCUS: a year without data shows a banner but keeps working", async () => {
    stubFetch();
    seed();
    window.location.hash = "#2021";
    render(<App />);
    expect(await screen.findByText(/There is no holiday data for 2021/)).toBeInTheDocument();
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-date="2021-04-06"]')!);
    expect(screen.getByRole("heading", { name: "Leave days: 1" })).toBeInTheDocument();
  });

  test("calendar load failure shows retry", async () => {
    const fetchMock = stubFetch();
    seed({ calendars: [{ id: "el.greek", regions: [] }] });
    render(<App />);
    expect(await screen.findByText("The holiday calendar could not be loaded.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith("el.greek.json"))).toHaveLength(2));
  });

  test("REVIEW FOCUS: no storage shows the cannot-save banner", async () => {
    stubFetch();
    render(<App storage={null} />);
    expect(await screen.findByText(/does not allow saving/)).toBeInTheDocument();
  });

  test("corrupted storage shows the recovery banner", async () => {
    stubFetch();
    localStorage.setItem(STORAGE_KEY, "{broken");
    render(<App />);
    expect(await screen.findByText(/could not be read/)).toBeInTheDocument();
  });

  test("F4: selecting a stretch highlights its days", async () => {
    stubFetch();
    seed();
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await userEvent.click(screen.getByRole("button", { name: /4 days · 0 leave/ }));
    expect(document.querySelector('[data-date="2026-04-03"]')).toHaveAttribute("data-highlight", "true");
    expect(document.querySelector('[data-date="2026-04-06"]')).toHaveAttribute("data-highlight", "true");
    expect(document.querySelector('[data-date="2026-04-02"]')).not.toHaveAttribute("data-highlight");
  });

  test("F4: a selected stretch that vanishes after an edit is no longer highlighted", async () => {
    stubFetch();
    seed();
    render(<App />);
    await screen.findAllByText(/4-day breaks/);
    await userEvent.click(screen.getByRole("button", { name: /4 days · 0 leave/ }));
    expect(document.querySelector('[data-date="2026-04-03"]')).toHaveAttribute("data-highlight", "true");

    // Disabling Good Friday breaks the Apr 3-6 stretch; the stale selection must not stay highlighted.
    await userEvent.click(screen.getByRole("checkbox", { name: "Counts as holiday: Good Friday" }));
    expect(document.querySelector('[data-date="2026-04-03"]')).not.toHaveAttribute("data-highlight");
  });

  test("Greek UI from the saved language preference, theme on <html>", async () => {
    stubFetch();
    seed({ language: "el", theme: "dark" });
    render(<App />);
    expect(await screen.findByRole("heading", { name: /Ημέρες άδειας/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("el");
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => document.documentElement.removeAttribute("data-theme"));
  });
});
