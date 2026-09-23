import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { renderWithI18n } from "../test/render";
import { AboutDialog } from "./AboutDialog";

describe("AboutDialog", () => {
  test("renders nothing when closed", () => {
    renderWithI18n(<AboutDialog open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("explains the app, the name and the data source, and links to the code", () => {
    renderWithI18n(<AboutDialog open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "About Los Feier" });
    expect(dialog).toHaveTextContent("helps you plan your leave around public holidays");
    expect(dialog).toHaveTextContent("Why “Los Feier”?");
    expect(dialog).toHaveTextContent("Google's public holiday calendars");
    expect(screen.getByRole("link", { name: "Source code on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/VasilisPlavos/los-feier",
    );
  });

  test("Close closes it", async () => {
    const onClose = vi.fn();
    renderWithI18n(<AboutDialog open onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("is translated to Greek", () => {
    renderWithI18n(<AboutDialog open onClose={() => {}} />, "el");
    expect(screen.getByRole("dialog", { name: "Σχετικά με το Los Feier" })).toBeInTheDocument();
  });
});
