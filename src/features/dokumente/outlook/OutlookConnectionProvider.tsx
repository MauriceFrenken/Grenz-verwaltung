import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  clearOutlookSession,
  getValidAccessToken,
  isTokenExpired,
  loadStoredAccounts,
  removeOutlookAccount,
  updateAccountProfile,
} from "./auth";
import { isOutlookConfigured, OUTLOOK_CONNECTED_EVENT, OUTLOOK_STORAGE_KEY } from "./config";
import { fetchOutlookProfile } from "./graph";
import type { OutlookAccount, OutlookConnectionState } from "./types";

const initialState: OutlookConnectionState = {
  connected: false,
  configured: isOutlookConfigured(),
  accounts: [],
  loading: true,
  error: null,
  profileError: null,
};

type OutlookConnectionContextValue = {
  state: OutlookConnectionState;
  refresh: () => Promise<void>;
  disconnect: (accountId?: string) => void;
};

const OutlookConnectionContext = createContext<OutlookConnectionContextValue | null>(null);

async function refreshAccount(account: OutlookAccount): Promise<OutlookAccount | null> {
  try {
    if (!isTokenExpired(account.tokens)) {
      if (account.profile) return account;
      const profile = await fetchOutlookProfile(account.id);
      updateAccountProfile(account.id, profile);
      return { ...account, profile };
    }

    const accessToken = await getValidAccessToken(account.id);
    if (!accessToken) return null;

    const tokens = loadStoredAccounts().find((a) => a.id === account.id)?.tokens ?? account.tokens;
    let profile = account.profile;
    if (!profile) {
      profile = await fetchOutlookProfile(account.id);
      updateAccountProfile(account.id, profile);
    }

    return { id: account.id, tokens, profile };
  } catch {
    removeOutlookAccount(account.id);
    return null;
  }
}

function useOutlookConnectionState(): OutlookConnectionContextValue {
  const [state, setState] = useState<OutlookConnectionState>(initialState);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null, profileError: null }));

    const stored = loadStoredAccounts();
    if (stored.length === 0) {
      setState({
        connected: false,
        configured: isOutlookConfigured(),
        accounts: [],
        loading: false,
        error: null,
        profileError: null,
      });
      return;
    }

    const refreshed = await Promise.all(stored.map((account) => refreshAccount(account)));
    const accounts = refreshed.filter((account): account is OutlookAccount => account !== null);

    if (accounts.length === 0) {
      setState({
        connected: false,
        configured: isOutlookConfigured(),
        accounts: [],
        loading: false,
        error: "Alle Outlook-Verbindungen sind abgelaufen — bitte erneut verbinden.",
        profileError: null,
      });
      return;
    }

    const profileErrors = accounts.filter((account) => !account.profile);
    setState({
      connected: true,
      configured: isOutlookConfigured(),
      accounts,
      loading: false,
      error: null,
      profileError:
        profileErrors.length > 0
          ? `${profileErrors.length} Konto(en) ohne Profilinformationen`
          : null,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onConnected = () => {
      void refresh();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === OUTLOOK_STORAGE_KEY) {
        void refresh();
      }
    };

    const onFocus = () => {
      void refresh();
    };

    window.addEventListener(OUTLOOK_CONNECTED_EVENT, onConnected);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener(OUTLOOK_CONNECTED_EVENT, onConnected);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const disconnect = useCallback((accountId?: string) => {
    if (accountId) {
      removeOutlookAccount(accountId);
      setState((prev) => {
        const accounts = prev.accounts.filter((account) => account.id !== accountId);
        return {
          ...prev,
          connected: accounts.length > 0,
          accounts,
          loading: false,
          error: null,
          profileError: accounts.some((account) => !account.profile) ? prev.profileError : null,
        };
      });
      return;
    }

    clearOutlookSession();
    setState({
      connected: false,
      configured: isOutlookConfigured(),
      accounts: [],
      loading: false,
      error: null,
      profileError: null,
    });
  }, []);

  return useMemo(() => ({ state, refresh, disconnect }), [state, refresh, disconnect]);
}

export function OutlookConnectionProvider({ children }: { children: ReactNode }) {
  const value = useOutlookConnectionState();
  return (
    <OutlookConnectionContext.Provider value={value}>{children}</OutlookConnectionContext.Provider>
  );
}

export function useOutlookConnection() {
  const context = useContext(OutlookConnectionContext);
  if (!context) {
    throw new Error("useOutlookConnection must be used within OutlookConnectionProvider");
  }
  return context;
}
