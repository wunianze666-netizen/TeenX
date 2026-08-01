import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type MeSummary } from "../api";

interface CaptainContextValue {
  summary: MeSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateNickname: (nickname: string) => Promise<void>;
}

const CaptainContext = createContext<CaptainContextValue | null>(null);

export function CaptainProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<MeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  async function refresh() {
    const requestGeneration = generation.current + 1;
    generation.current = requestGeneration;
    setError(null);
    try {
      const next = await api.me();
      if (generation.current === requestGeneration) setSummary(next);
    } catch (cause) {
      if (generation.current === requestGeneration) setError(cause instanceof Error ? cause.message : "队长身份加载失败");
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, []);

  async function updateNickname(nickname: string) {
    const requestGeneration = generation.current + 1;
    generation.current = requestGeneration;
    await api.updateProfile({ name: nickname });
    const next = await api.me();
    if (generation.current === requestGeneration) {
      setSummary(next);
      setError(null);
    }
  }

  return (
    <CaptainContext.Provider value={{ summary, loading, error, refresh, updateNickname }}>
      {children}
    </CaptainContext.Provider>
  );
}

export function useCaptain() {
  const context = useContext(CaptainContext);
  if (!context) throw new Error("useCaptain must be used within CaptainProvider");
  return context;
}
