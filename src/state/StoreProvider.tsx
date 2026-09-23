import { createContext, useContext, useEffect, useReducer, useState, type Dispatch, type ReactNode } from "react";
import type { AppState } from "../core/types";
import { reducer, type Action } from "./reducer";
import { getStorage, loadState, saveState } from "./storage";

interface StoreValue {
  state: AppState;
  dispatch: Dispatch<Action>;
  recoveredBackup: string | null;
  dismissRecovered(): void;
  saveFailed: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, storage }: { children: ReactNode; storage?: Storage | null }) {
  const [store] = useState(() => (storage === undefined ? getStorage() : storage));
  const [initial] = useState(() => loadState(store));
  const [state, dispatch] = useReducer(reducer, initial.state);
  const [recoveredBackup, setRecoveredBackup] = useState(initial.recoveredBackup);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    setSaveFailed(!saveState(store, state));
  }, [store, state]);

  return (
    <StoreContext.Provider
      value={{ state, dispatch, recoveredBackup, dismissRecovered: () => setRecoveredBackup(null), saveFailed }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside <StoreProvider>");
  return value;
}
