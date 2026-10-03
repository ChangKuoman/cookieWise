import ReactDOM from 'react-dom/client';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { browser } from 'wxt/browser';
import '@/assets/ui.css';
import { detectBanner, type BannerMatch } from '@/lib/consent';
import { siteOfUrl } from '@/lib/domain';
import type { ContentRequest } from '@/lib/messages';
import { findPolicyLinks } from '@/lib/policyFinder';
import { getSettings } from '@/lib/storage';
import type { PageInfo } from '@/lib/types';
import { Overlay } from './Overlay';

const BANNER_WAIT_MS = 15_000;

export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',
  async main(ctx) {
    const site = siteOfUrl(location.href);
    if (!site) return;
    let banner: BannerMatch | null = null;

    const pageInfo = (): PageInfo => ({
      url: location.href,
      site,
      policyLinks: findPolicyLinks(document, banner?.root),
      resourceHosts: resourceHosts(),
      bannerCmp: banner?.cmp ?? null,
    });

    browser.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
      if (msg?.type === 'getPageInfo') sendResponse(pageInfo());
    });

    const settings = await getSettings();
    if (!settings.showBannerBadge) return;

    banner = await waitForBanner(ctx);
    if (!banner || ctx.isInvalid) return;
    const found = banner;

    const ui = await createShadowRootUi(ctx, {
      name: 'cookiewise-overlay',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(
          <Overlay banner={found} getPage={pageInfo} autoAnalyze={settings.autoAnalyze} onClose={() => ui.remove()} />,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});

/** Banners often render late, so watch the DOM for a while. */
function waitForBanner(ctx: ContentScriptContext) {
  return new Promise<BannerMatch | null>((resolve) => {
    const immediate = detectBanner();
    if (immediate) return resolve(immediate);

    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      ctx.setTimeout(() => {
        pending = false;
        const m = detectBanner();
        if (m) finish(m);
      }, 400);
    });
    const finish = (m: BannerMatch | null) => {
      observer.disconnect();
      resolve(m);
    };
    observer.observe(document.documentElement, { childList: true, subtree: true });
    ctx.setTimeout(() => finish(detectBanner()), BANNER_WAIT_MS);
    ctx.onInvalidated(() => finish(null));
  });
}

function resourceHosts(): string[] {
  const hosts = new Set<string>();
  for (const e of performance.getEntriesByType('resource')) {
    try {
      hosts.add(new URL(e.name).hostname);
    } catch {
      /* ignore */
    }
  }
  for (const el of document.querySelectorAll<HTMLIFrameElement | HTMLScriptElement>('iframe[src], script[src]')) {
    try {
      hosts.add(new URL(el.src).hostname);
    } catch {
      /* ignore */
    }
  }
  return [...hosts];
}
