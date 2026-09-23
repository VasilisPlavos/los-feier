import { expect, test } from "@playwright/test";

const seededState = {
  version: 1,
  language: null,
  calendar: { id: "en.ch", regions: ["Zurich"], includeObservances: false },
  holidayRules: {},
  yearOverrides: {},
  customHolidays: [],
  weeklyPlan: [0, 0, 0, 0, 0, 1, 1],
  leave: {},
  theme: "system",
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

  test("suggests the Greek calendar and shows the Greek UI", async ({ page }) => {
    await page.goto("./#2026");
    await expect(page.getByText("Χρησιμοποιείται το «Διακοπές στην Ελλάδα».")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Αργίες", level: 1 })).toBeVisible();
  });
});
