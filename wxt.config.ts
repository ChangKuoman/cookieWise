import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'CookieWise',
    description:
      'Know what you give away before you click "Accept". AI-summarized privacy policies + a cookie manager that ranks cookies by risk.',
    permissions: ['cookies', 'storage', 'tabs', 'offscreen'],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'CookieWise' },
  },
});
