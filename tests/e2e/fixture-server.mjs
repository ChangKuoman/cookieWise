// Local test site: a page with a OneTrust-style banner that tracks before consent,
// a privacy policy, and a fake /summarize endpoint so the e2e test never calls the real API.
import http from 'node:http';

export const PORT = 5199;

const POLICY = `
<h1>Privacy Policy</h1>
<p>This Privacy Policy explains how Example Shop collects and uses your information.</p>
<h2>Information we collect</h2>
<p>We collect your email address and password to create your account, and your shipping address and payment details to deliver your orders.</p>
<p>We automatically collect device identifiers, browsing activity on our site, and approximate location for analytics and advertising.</p>
<h2>Sharing</h2>
<p>We may sell your personal information to advertising partners and data brokers. We share browsing data with 214 advertising partners to show you personalized ads across other websites.</p>
<h2>Retention</h2>
<p>We keep your data for as long as your account is active and for 5 years after it is closed.</p>
<h2>Your rights</h2>
<p>You can request deletion of your data or opt out of the sale of your data by emailing privacy@example.test.</p>
`.repeat(2);

const SUMMARY = {
  tldr: 'Example Shop needs your email, address and payment details to sell you things, but also sells your browsing data to 214 ad partners and data brokers.',
  score: 'F',
  scoreReason: 'The policy explicitly allows selling personal information to data brokers.',
  strictlyNecessary: [
    { data: 'Email and password', purpose: 'Create and secure your account', quote: 'We collect your email address and password to create your account' },
    { data: 'Shipping address and payment details', purpose: 'Deliver and charge for orders', quote: '' },
  ],
  optional: [
    { data: 'Browsing activity and device IDs', purpose: 'Personalized ads on other websites', category: 'advertising', risk: 'dangerous' },
    { data: 'Approximate location', purpose: 'Analytics', category: 'analytics', risk: 'moderate' },
  ],
  thirdParties: [{ name: 'Advertising partners and data brokers', purpose: 'Cross-site ad targeting', sells: true, risk: 'dangerous' }],
  sellsData: true,
  partnerCount: 214,
  retention: 'While your account is active, plus 5 years after closing it.',
  yourRights: ['Delete your data', 'Opt out of the sale of your data'],
  howToOptOut: 'Email privacy@example.test.',
  redFlags: [
    { flag: 'Sells your data to data brokers', severity: 'high', quote: 'We may sell your personal information to advertising partners and data brokers.' },
    { flag: 'Keeps data for years', severity: 'med', quote: 'We store everything forever.' },
  ],
};

const PAGE = `<!doctype html><html><head><title>Example Shop</title></head><body style="font-family:sans-serif;padding:40px">
<h1>Example Shop</h1><p>Welcome! Lots of products here.</p>
<script>
  // Tracks before the user has consented (a common real-world violation).
  document.cookie = "_fbp=fb.1.1696240000000.1234567890; max-age=7776000; path=/";
  document.cookie = "_ga=GA1.1.987654321.1696240000; max-age=63072000; path=/";
</script>
<div id="onetrust-banner-sdk" style="position:fixed;left:0;right:0;bottom:0;background:#f1f1f1;padding:20px;border-top:1px solid #ccc">
  We use cookies to improve your experience and for advertising. See our <a href="/privacy">Privacy Policy</a>.
  <button id="onetrust-pc-btn-handler">Cookie Settings</button>
  <button id="onetrust-reject-all-handler">Reject All</button>
  <button id="onetrust-accept-btn-handler">Accept All Cookies</button>
</div>
<script>
  const hide = () => (document.getElementById('onetrust-banner-sdk').style.display = 'none');
  document.getElementById('onetrust-reject-all-handler').onclick = () => {
    document.cookie = "OptanonConsent=groups=C0001:1,C0002:0,C0004:0; max-age=31536000; path=/";
    hide();
  };
  document.getElementById('onetrust-accept-btn-handler').onclick = () => {
    document.cookie = "OptanonConsent=groups=C0001:1,C0002:1,C0004:1; max-age=31536000; path=/";
    document.cookie = "_gcl_au=1.1.123456789.1696240000; max-age=7776000; path=/";
    hide();
  };
</script>
</body></html>`;

export function startFixtureServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/summarize' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        server.lastSummarizeRequest = JSON.parse(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ summary: SUMMARY, truncated: false, model: 'fixture' }));
      });
      return;
    }
    if (req.url === '/privacy') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html><head><title>Privacy</title></head><body><main>${POLICY}</main></body></html>`);
    }
    if (req.url === '/') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': ['PHPSESSID=k3j4h5g6f7d8s9a0q1w2e3r4; Path=/; HttpOnly', 'lang=en; Path=/; Max-Age=31536000'],
      });
      return res.end(PAGE);
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}
