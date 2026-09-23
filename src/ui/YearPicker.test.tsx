import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderWithI18n } from "../test/render";
import { YearPicker } from "./YearPicker";

describe("YearPicker", () => {
  test("lists every year from the first to the last with data", () => {
    renderWithI18n(<YearPicker year={2026} bounds={{ min: 2021, max: 2031 }} onChange={() => {}} />);
    const select = screen.getByRole("combobox", { name: "Year" });
    expect(select).toHaveValue("2026");
    const years = screen.getAllByRole("option").map((o) => o.textContent);
    expect(years).toEqual(["2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028", "2029", "2030", "2031"]);
  });

  test("choosing a year reports it as a number", async () => {
    const onChange = vi.fn();
    renderWithI18n(<YearPicker year={2026} bounds={{ min: 2021, max: 2031 }} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Year" }), "2029");
    expect(onChange).toHaveBeenCalledWith(2029);
  });

  test("shows only the current year until the bounds are known", () => {
    renderWithI18n(<YearPicker year={2026} bounds={null} onChange={() => {}} />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["2026"]);
  });

  test("uses the Greek label", () => {
    renderWithI18n(<YearPicker year={2026} bounds={{ min: 2021, max: 2031 }} onChange={() => {}} />, "el");
    expect(screen.getByRole("combobox", { name: "Έτος" })).toBeInTheDocument();
  });
});
