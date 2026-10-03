import { Readability } from '@mozilla/readability';
import { browser } from 'wxt/browser';
import type { OffscreenExtract } from '@/lib/messages';

// Service workers have no DOM, so policy HTML is turned into clean text here.
browser.runtime.onMessage.addListener((msg: OffscreenExtract, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'extract') return;
  sendResponse(extract(msg.html, msg.url));
});

function extract(html: string, url: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.prepend(base);
  doc.querySelectorAll('script, style, noscript, svg, iframe').forEach((el) => el.remove());

  const article = new Readability(doc.cloneNode(true) as Document).parse();
  const text = article?.textContent?.trim() || doc.body?.textContent?.trim() || '';
  return text ? text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : null;
}
