import { describe, expect, test } from "vitest";
import { BACKUP_KEY, STORAGE_KEY, loadState, saveState } from "./storage";
import { createDefaultState } from "./defaults";
import { exportStateJson } from "./exportImport";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

function throwingStorage(): Storage {
  const s = memoryStorage();
  s.setItem = () => { throw new DOMException("QuotaExceededError"); };
  s.getItem = () => { throw new DOMException("SecurityError"); };
  return s;
}

describe("storage", () => {
  test("uses the los-feier keys", () => {
    expect([STORAGE_KEY, BACKUP_KEY]).toEqual(["los-feier.state", "los-feier.state.backup"]);
  });

  test("round-trips the state", () => {
    const storage = memoryStorage();
    const state = { ...createDefaultState(), leave: { "2026-04-07": 1 as const } };
    expect(saveState(storage, state)).toBe(true);
    expect(loadState(storage)).toEqual({ state, recoveredBackup: null });
  });

  test("empty storage gives the default state", () => {
    expect(loadState(memoryStorage())).toEqual({ state: createDefaultState(), recoveredBackup: null });
  });

  test("corrupted data is backed up and the default state is used", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{broken");
    const result = loadState(storage);
    expect(result.state).toEqual(createDefaultState());
    expect(result.recoveredBackup).toBe("{broken");
    expect(storage.getItem(BACKUP_KEY)).toBe("{broken");
  });

  test("REVIEW FOCUS: no storage at all", () => {
    expect(loadState(null).state).toEqual(createDefaultState());
    expect(saveState(null, createDefaultState())).toBe(false);
  });

  test("REVIEW FOCUS: throwing storage never throws out of load/save", () => {
    const storage = throwingStorage();
    expect(loadState(storage).state).toEqual(createDefaultState());
    expect(saveState(storage, createDefaultState())).toBe(false);
  });

  test("export is pretty JSON of the state", () => {
    const state = createDefaultState();
    expect(JSON.parse(exportStateJson(state))).toEqual(state);
    expect(exportStateJson(state)).toContain("\n  ");
  });
});
