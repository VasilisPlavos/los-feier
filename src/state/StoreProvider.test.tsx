import { act, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { StoreProvider, useStore } from "./StoreProvider";
import { STORAGE_KEY } from "./storage";

function Probe() {
  const { state, dispatch, saveFailed, recoveredBackup } = useStore();
  return (
    <div>
      <span data-testid="leave">{JSON.stringify(state.leave)}</span>
      <span data-testid="saveFailed">{String(saveFailed)}</span>
      <span data-testid="recovered">{String(recoveredBackup)}</span>
      <button onClick={() => dispatch({ type: "toggleLeave", date: "2026-04-07", room: 1 })}>toggle</button>
    </div>
  );
}

describe("StoreProvider", () => {
  test("auto-saves every change to localStorage", () => {
    render(<StoreProvider><Probe /></StoreProvider>);
    act(() => screen.getByText("toggle").click());
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).leave).toEqual({ "2026-04-07": 1 });
    expect(screen.getByTestId("saveFailed")).toHaveTextContent("false");
  });

  test("loads the saved state on start", () => {
    render(<StoreProvider><Probe /></StoreProvider>);
    act(() => screen.getByText("toggle").click());
    render(<StoreProvider><Probe /></StoreProvider>);
    expect(screen.getAllByTestId("leave")[1]).toHaveTextContent('{"2026-04-07":1}');
  });

  test("reports a corrupted saved state", () => {
    localStorage.setItem(STORAGE_KEY, "{broken");
    render(<StoreProvider><Probe /></StoreProvider>);
    expect(screen.getByTestId("recovered")).toHaveTextContent("{broken");
  });

  test("REVIEW FOCUS: works without storage and reports saveFailed", () => {
    render(<StoreProvider storage={null}><Probe /></StoreProvider>);
    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("leave")).toHaveTextContent('{"2026-04-07":1}');
    expect(screen.getByTestId("saveFailed")).toHaveTextContent("true");
  });
});
