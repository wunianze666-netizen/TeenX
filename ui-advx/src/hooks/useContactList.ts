import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ContactGrantSummary, type ContactRequestBox, type ContactRequestSummary } from "../api";
import { appendContactGrants, appendContactRequests } from "../profile-state";

export type ContactTab = ContactRequestBox | "approved";

export function useContactList(initialTab: ContactTab) {
  const [tab, setTab] = useState<ContactTab>(initialTab);
  const [requests, setRequests] = useState<readonly ContactRequestSummary[]>([]);
  const [contacts, setContacts] = useState<readonly ContactGrantSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const generation = useRef(0);
  const loadMoreController = useRef<AbortController | null>(null);
  const reloadTab = useRef<ContactTab | null>(null);
  const initialTabValue = useRef(initialTab);

  useEffect(() => {
    if (initialTabValue.current !== initialTab) {
      initialTabValue.current = initialTab;
      if (tab === initialTab) return;
      generation.current += 1;
      setTab(initialTab);
    }
  }, [initialTab, tab]);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreController.current?.abort();
    const currentGeneration = ++generation.current;
    const preservesRows = reloadTab.current === tab;
    reloadTab.current = null;
    if (!preservesRows) {
      setRequests([]);
      setContacts([]);
      setNextCursor(null);
    }
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    const request = tab === "approved"
      ? api.listContacts(undefined, controller.signal).then((page) => {
          if (generation.current !== currentGeneration) return;
          setContacts(page.items);
          setNextCursor(page.nextCursor);
        })
      : api.listContactRequests(tab, undefined, controller.signal).then((page) => {
          if (generation.current !== currentGeneration) return;
          setRequests(page.items);
          setNextCursor(page.nextCursor);
        });
    void request.catch((cause: unknown) => {
      if (controller.signal.aborted || generation.current !== currentGeneration) return;
      setError(cause instanceof Error ? cause.message : "联络列表暂时无法读取");
    }).finally(() => {
      if (generation.current === currentGeneration) setLoading(false);
    });
    return () => {
      controller.abort();
      loadMoreController.current?.abort();
    };
  }, [reloadKey, tab]);

  const changeTab = useCallback((nextTab: ContactTab) => {
    if (nextTab === tab) return;
    loadMoreController.current?.abort();
    generation.current += 1;
    setTab(nextTab);
  }, [tab]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const controller = new AbortController();
    loadMoreController.current?.abort();
    loadMoreController.current = controller;
    const currentGeneration = generation.current;
    setLoadingMore(true);
    setError(null);
    try {
      if (tab === "approved") {
        const page = await api.listContacts(nextCursor, controller.signal);
        if (generation.current !== currentGeneration) return;
        setContacts((current) => appendContactGrants(current, page.items));
        setNextCursor(page.nextCursor);
      } else {
        const page = await api.listContactRequests(tab, nextCursor, controller.signal);
        if (generation.current !== currentGeneration) return;
        setRequests((current) => appendContactRequests(current, page.items));
        setNextCursor(page.nextCursor);
      }
    } catch (cause) {
      if (controller.signal.aborted || generation.current !== currentGeneration) return;
      setError(cause instanceof Error ? cause.message : "下一页联络列表加载失败");
    } finally {
      if (loadMoreController.current === controller) loadMoreController.current = null;
      if (generation.current === currentGeneration) setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, tab]);

  return {
    tab,
    setTab: changeTab,
    requests,
    contacts,
    nextCursor,
    loading,
    loadingMore,
    error,
    reload: () => {
      loadMoreController.current?.abort();
      generation.current += 1;
      reloadTab.current = tab;
      setReloadKey((value) => value + 1);
    },
    removeRequest: (requestId: string) => setRequests((current) => current.filter((item) => item.requestId !== requestId)),
    applyContact: (publicId: string, next: ContactGrantSummary | undefined) => setContacts((current) => next
      ? current.map((item) => item.counterpart.publicId === publicId ? next : item)
      : current.filter((item) => item.counterpart.publicId !== publicId)),
    loadMore,
  } as const;
}
