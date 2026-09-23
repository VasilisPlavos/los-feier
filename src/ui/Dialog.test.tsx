import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  test("renders nothing when closed", () => {
    render(<Dialog open={false} onClose={() => {}} labelledBy="t"><h2 id="t">Title</h2></Dialog>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("labelled by its heading; backdrop click closes, clicks inside do not", () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} labelledBy="t" className="picker"><h2 id="t">Title</h2><button>Inside</button></Dialog>);
    const dialog = screen.getByRole("dialog", { name: "Title" });
    expect(dialog).toHaveClass("dialog", "picker");
    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("Escape calls the latest onClose", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Dialog open onClose={first} labelledBy="t"><h2 id="t">T</h2><button>x</button></Dialog>);
    rerender(<Dialog open onClose={second} labelledBy="t"><h2 id="t">T</h2><button>x</button></Dialog>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });

  test("closing by the parent restores focus to the opener", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<Dialog open onClose={() => {}} labelledBy="t"><h2 id="t">T</h2><button>x</button></Dialog>);
    expect(document.activeElement).toHaveTextContent("x");
    rerender(<Dialog open={false} onClose={() => {}} labelledBy="t"><h2 id="t">T</h2><button>x</button></Dialog>);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
