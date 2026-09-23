import { expect, test } from "@playwright/test";

const seededState = {
  version: 2,
  language: null,
  theme: "system",
  leave: {},
  profiles: {
    "2026": {
      calendars: [{ id: "en.ch", regions: ["Zurich"] }],
      includeObservances: false,
      holidayRules: {},
      customHolidays: [],
      weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
    },
  },
};

test.describe("with a Zurich profile", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => {
      if (!localStorage.getItem("holidays.state")) localStorage.setItem("holidays.state", JSON.stringify(state));
    }, seededState);
  });

  test("mobile keeps 3 month columns and scrolls horizontally", async ({ page }) => {
    await page.goto("./#2026");
    const grid = page.getByTestId("year-grid");
    await expect(grid.locator("[data-month]")).toHaveCount(12);
    const columns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(3);
    const overflows = await page.getByTestId("grid-scroller").evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(overflows).toBe(true);
  });

  test("clicking a day adds leave, updates the summary and survives a reload", async ({ page }) => {
    await page.goto("./#2026");
    const summary = page.getByTestId("summary-bar");
    await expect(summary).toContainText("Leave 0");
    const day = page.locator('[data-date="2026-04-07"]');
    await day.click();
    await expect(day).toHaveAttribute("data-leave", "1");
    await expect(summary).toContainText("Leave 1");
    await page.reload();
    await expect(page.locator('[data-date="2026-04-07"]')).toHaveAttribute("data-leave", "1");
  });

  test("adding a second calendar and a region", async ({ page }) => {
    await page.goto("./#2026");
    await page.getByRole("tab", { name: "Holidays" }).click();
    await page.getByRole("button", { name: "Change" }).click();
    const dialog = page.getByRole("dialog", { name: "Holiday calendars · from 2026 onwards" });
    await dialog.getByRole("searchbox", { name: "Search calendars…" }).fill("christian");
    await dialog.getByRole("checkbox", { name: "Christian Holidays" }).check();
    const regions = dialog.getByRole("group", { name: "Regions · Holidays in Switzerland" });
    await regions.getByRole("checkbox", { name: "Bern", exact: true }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const panel = page.locator(".calendars-panel");
    await panel.getByRole("button", { name: /Calendars \(2\)/ }).click();
    await expect(panel.getByText("Holidays in Switzerland — Bern, Zurich")).toBeVisible();
    await expect(panel.getByText("Christian Holidays", { exact: true })).toBeVisible();
  });

  test("a change in 2027 keeps 2026 as it was and can be undone", async ({ page }) => {
    await page.goto("./#2027");
    await page.getByRole("tab", { name: "Holidays" }).click();
    const easter2027 = page.locator('[data-date="2027-03-29"]');
    await expect(easter2027).toHaveAttribute("data-holiday", "1");
    await page.getByRole("checkbox", { name: "Counts as holiday: Easter Monday (regional holiday)" }).uncheck();
    await expect(easter2027).not.toHaveAttribute("data-holiday");
    await expect(page.getByRole("button", { name: /from 2027/ })).toBeVisible();

    await page.getByRole("button", { name: "Previous year" }).click();
    await expect(page.locator('[data-date="2026-04-06"]')).toHaveAttribute("data-holiday", "1");
    await expect(page.getByRole("button", { name: /from 2026/ })).toBeVisible();

    await page.getByRole("button", { name: "Next year" }).click();
    await page.getByRole("button", { name: /Calendars \(1\)/ }).click();
    await page.getByRole("button", { name: "Remove the 2027 settings" }).click();
    await expect(page.locator('[data-date="2027-03-29"]')).toHaveAttribute("data-holiday", "1");
  });

  test("bottom tabs switch panels", async ({ page }) => {
    await page.goto("./#2026");
    await page.getByRole("tab", { name: "Plan" }).click();
    await expect(page.getByRole("heading", { name: "Weekly plan" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Leave days/ })).toBeHidden();
  });
});

test.describe("REVIEW FOCUS: timezone west of UTC", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => localStorage.setItem("holidays.state", JSON.stringify(state)), seededState);
  });

  test("dates stay under the right weekday and clicks store the same date", async ({ page }) => {
    await page.goto("./#2026");
    const day = page.locator('[data-date="2026-04-07"]');
    await expect(day).toHaveAttribute("data-weekday", "1"); // Tuesday
    await expect(page.locator('[data-date="2026-04-06"]')).toHaveAttribute("data-holiday", "1"); // Easter Monday
    await day.click();
    const leave = await page.evaluate(() => JSON.parse(localStorage.getItem("holidays.state")!).leave);
    expect(leave).toEqual({ "2026-04-07": 1 });
  });
});

test.describe("first run in Greek", () => {
  test.use({ locale: "el-GR" });

  test("asks for calendars with the Greek one suggested, then shows the Greek UI", async ({ page }) => {
    await page.goto("./#2026");
    const dialog = page.getByRole("dialog", { name: "Παρακαλώ επιλέξτε ημερολόγια" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "Διακοπές στην Ελλάδα" })).toBeChecked();
    await dialog.getByRole("button", { name: "Συνέχεια" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Αργίες", level: 1 })).toBeVisible();
    await expect(page.locator('[data-date="2026-03-25"]')).toHaveAttribute("data-holiday", "1");
  });
});
