import { useCallback, useEffect, useState } from 'react';
import { sendToBackground } from '@/lib/messages';
import type { StoredSummary } from '@/lib/schema';
import { getSummary } from '@/lib/storage';
import type { PageInfo } from '@/lib/types';

export type SummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; summary: StoredSummary }
  | { status: 'error'; error: string; needsSetup?: boolean };

export function useSummary(page: PageInfo | null, autoRun = false) {
  const [state, setState] = useState<SummaryState>({ status: 'idle' });

  const run = useCallback(
    async (force = false) => {
      if (!page) return;
      setState({ status: 'loading' });
      const res = await sendToBackground({ type: 'getSummary', page, force }).catch((e) => ({
        ok: false as const,
        error: String(e?.message ?? e),
      }));
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

  return { state, run };
}
