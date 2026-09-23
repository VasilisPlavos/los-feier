import { act, screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import { clearCalendarCache } from "./data/calendars";
import { STORAGE_KEY } from "./state/storage";
import { makeState, zurichFixture } from "./test/fixtures";

const INDEX = [
  { id: "en.ch", name: "Holidays in Switzerland", lang: "en", from: 2025, to: 2027, count: 12 },
  { id: "el.greek", name: "Διακοπές στην Ελλάδα", lang: "el", from: 2021, to: 2031, count: 0 },
];

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("index.json")) return { ok: true, status: 200, json: async () => INDEX };
    if (url.endsWith("en.ch.json")) return { ok: true, status: 200, json: async () => zurichFixture };
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
  test("first run picks a calendar from the browser language", async () => {
    stubFetch();
    setLanguages(["de-CH"]);
    render(<App />);
    expect(await screen.findByText("Using “Holidays in Switzerland”.")).toBeInTheDocument();
    // Auto-save runs in an effect after the render that shows the banner.
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).calendar.id).toBe("en.ch"));
  });

  test("first run without a suggestion opens the settings", async () => {
    stubFetch();
    setLanguages(["xx"]);
    render(<App />);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
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

  test("year navigation updates the hash", async () => {
    stubFetch();
    seed();
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Next year" }));
    expect(screen.getByText("2027")).toBeInTheDocument();
    expect(window.location.hash).toBe("#2027");
  });

  test("REVIEW FOCUS: a year without data shows a banner but keeps working", async () => {
    stubFetch();
    seed();
    window.location.hash = "#2019";
    render(<App />);
    expect(await screen.findByText(/There is no holiday data for 2019/)).toBeInTheDocument();
    await userEvent.click(document.querySelector<HTMLButtonElement>('[data-date="2019-04-09"]')!);
    expect(screen.getByRole("heading", { name: "Leave days: 1" })).toBeInTheDocument();
  });

  test("calendar load failure shows retry", async () => {
    const fetchMock = stubFetch();
    seed({ calendar: { id: "el.greek", regions: [], includeObservances: false } });
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

  test("F3: header omits a stale region no longer present in the loaded calendar", async () => {
    stubFetch();
    seed({ calendar: { id: "en.ch", regions: ["Geneva", "Zurich"], includeObservances: false } });
    render(<App />);
    const button = await screen.findByRole("button", { name: /Holidays in Switzerland/ });
    expect(button.textContent).toContain("Zurich");
    expect(button.textContent).not.toContain("Geneva");
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
