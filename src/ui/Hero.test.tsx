import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { renderWithI18n } from "../test/render";
import { Hero } from "./Hero";

describe("Hero", () => {
  test("names the year and says what the page does", () => {
    renderWithI18n(<Hero year={2027} />);
    expect(screen.getByRole("heading", { level: 2, name: "Holiday calendar 2027" })).toBeInTheDocument();
    expect(screen.getByText(/click the days you plan to take off/)).toBeInTheDocument();
  });

  test("is translated to Greek", () => {
    renderWithI18n(<Hero year={2026} />, "el");
    expect(screen.getByRole("heading", { name: "Ημερολόγιο αργιών 2026" })).toBeInTheDocument();
  });
});
