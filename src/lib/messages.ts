import { browser } from 'wxt/browser';
import type { StoredSummary } from './schema';
import type { CookieRef, PageInfo, SiteReport } from './types';

/** Messages handled by the background service worker. */
export type BackgroundRequest =
  | { type: 'getSummary'; page: PageInfo; force?: boolean }
  | { type: 'getSiteReport'; site: string; resourceHosts: string[] }
  | { type: 'deleteCookies'; cookies: CookieRef[] }
  | { type: 'openOptions' };

export type BackgroundResponse<T extends BackgroundRequest['type']> = T extends 'getSummary'
  ? { ok: true; summary: StoredSummary } | { ok: false; error: string; needsSetup?: boolean }
  : T extends 'getSiteReport'
    ? SiteReport
    : T extends 'deleteCookies'
      ? { deleted: number }
      : void;

export function sendToBackground<R extends BackgroundRequest>(req: R): Promise<BackgroundResponse<R['type']>> {
  return browser.runtime.sendMessage(req);
}

/** Messages handled by the content script. */
export type ContentRequest = { type: 'getPageInfo' };

export function sendToTab<T = unknown>(tabId: number, req: ContentRequest): Promise<T> {
  return browser.tabs.sendMessage(tabId, req);
}

/** Message handled by the offscreen document. */
export interface OffscreenExtract {
  target: 'offscreen';
  type: 'extract';
  html: string;
  url: string;
}
