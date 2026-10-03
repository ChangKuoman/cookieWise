import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { sendToBackground } from '@/lib/messages';
import type { StoredSummary } from '@/lib/schema';
import { getSummary } from '@/lib/storage';
import type { PageInfo } from '@/lib/types';

export type SummaryState =
  | { status: 'idle' }
  | { status: 'loading'; stage?: string; startedAt: number }
  | { status: 'done'; summary: StoredSummary }
  | { status: 'error'; error: string; needsSetup?: boolean };

// Mirrors policyPipeline's progressKey; kept here so UI bundles don't pull in the AI SDKs.
const progressKey = (site: string) => `progress:${site}`;

export function useSummary(page: PageInfo | null, autoRun = false) {
  const [state, setState] = useState<SummaryState>({ status: 'idle' });
  const requestId = useRef(0);

  const run = useCallback(
    async (force = false) => {
      if (!page) return;
      const id = ++requestId.current;
      setState({ status: 'loading', startedAt: Date.now() });
      const res = await sendToBackground({ type: 'getSummary', page, force }).catch((e) => ({
        ok: false as const,
        error: String(e?.message ?? e),
      }));
      if (id !== requestId.current) return; // a newer run (Start over) replaced this one
      setState(res.ok ? { status: 'done', summary: res.summary } : { status: 'error', ...res });
    },
    [page],
  );

  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    getSummary(page.site).then((cached) => {
      if (cancelled) return;
      if (cached) setState({ status: 'done', summary: cached });
      else if (autoRun) run();
    });
    return () => {
      cancelled = true;
    };
  }, [page, autoRun, run]);

  // Live progress from the background ("Reading /privacy", "Asking Gemini…").
  useEffect(() => {
    if (!page) return;
    const key = progressKey(page.site);
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const p = changes[key]?.newValue as { stage: string; startedAt: number } | undefined;
      if (area !== 'local' || !p) return;
      setState((s) => (s.status === 'loading' ? { ...s, stage: p.stage } : s));
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, [page]);

  return { state, run };
}
