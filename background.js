const SG = 'https://app.thestorygraph.com';

function searchTerm({ title, author, isbn }) {
  if (isbn) return isbn;
  const short = title.split(/,\s*or\s|[:(]/i)[0].trim();
  return `${short} ${author}`.trim();
}

async function find(info) {
  const key = 'gr:' + info.id;
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached) return cached;
  const term = searchTerm(info);
  const searchUrl = `${SG}/browse?search_term=${encodeURIComponent(term)}`;
  let result = { url: searchUrl, exact: false };
  try {
    const html = await (await fetch(searchUrl, { credentials: 'include' })).text();
    const m = html.match(/href="\/books\/([0-9a-f-]{36})"/);
    if (m) {
      result = { url: `${SG}/books/${m[1]}`, exact: true, bookId: m[1] };
      await chrome.storage.local.set({ [key]: result });
    }
  } catch (e) {}
  return result;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Replays the same form POST the StoryGraph status menu submits.
async function setStatus(bookId, status) {
  const page = await fetch(`${SG}/books/${bookId}`, { credentials: 'include' });
  const html = await page.text();
  const forms = [...html.matchAll(/<form[^>]*action="([^"]*update-status[^"]*)"[^>]*>([\s\S]*?)<\/form>/g)];
  const form = forms.find((f) => decode(f[1]).includes(`status=${status}`));
  if (!form) {
    return { ok: false, error: /sign_in|Log in/i.test(html) && !forms.length ? 'not logged in to StoryGraph' : `no “${status}” action found` };
  }
  const body = new URLSearchParams();
  for (const i of form[2].matchAll(/<input[^>]*>/g)) {
    const name = (i[0].match(/name="([^"]*)"/) || [])[1];
    const value = (i[0].match(/value="([^"]*)"/) || [])[1] || '';
    if (name) body.append(name, decode(value));
  }
  const csrf = (html.match(/name="csrf-token" content="([^"]+)"/) || [])[1];
  const res = await fetch(SG + decode(form[1]), {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrf || '', 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/javascript' },
    body,
  });
  return res.ok ? { ok: true } : { ok: false, error: 'HTTP ' + res.status };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const job = msg.type === 'find' ? find(msg.info) : msg.type === 'status' ? setStatus(msg.bookId, msg.status) : null;
  if (!job) return;
  job.then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

// ---- StoryGraph → Goodreads ----
const GR = 'https://www.goodreads.com';
const norm = (s) => s.toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, ' ').trim();

async function findGoodreads({ sgId, title, author }) {
  const key = 'sg:' + sgId;
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached) return cached;
  const short = title.split(/,\s*or\s|[:(]/i)[0].trim();
  const term = `${short} ${author}`.trim();
  const searchUrl = `${GR}/search?q=${encodeURIComponent(term)}`;
  let result = { url: searchUrl, exact: false };
  try {
    const html = await (await fetch(searchUrl, { credentials: 'include' })).text();
    const hits = [];
    for (const m of html.matchAll(/<a\b([^>]*?)href="\/book\/show\/(\d+)[^"]*"([^>]*)>([\s\S]*?)<\/a>/g)) {
      const label = (m[1] + m[3]).match(/aria-label="([^"]*)"/);
      const text = label ? label[1].replace(/ by .*$/, '') : m[4].replace(/<[^>]*>/g, '');
      if (norm(text)) hits.push({ id: m[2], title: norm(text) });
    }
    // Goodreads search is noisy (study guides, box sets): require an exact title match.
    const hit = hits.find((h) => h.title === norm(title)) || hits.find((h) => h.title === norm(short));
    if (hit) {
      result = { url: `${GR}/book/show/${hit.id}`, exact: true, grId: hit.id };
      await chrome.storage.local.set({ [key]: result });
    }
  } catch (e) {}
  return result;
}

// Opens the Goodreads book page in a background tab; its content script clicks the shelf UI.
const waiting = new Map(); // tabId -> sendResponse
async function applyGoodreads(grId, status, sendResponse) {
  await chrome.storage.local.set({ ['pending:' + grId]: { status, ts: Date.now() } });
  const tab = await chrome.tabs.create({ url: `${GR}/book/show/${grId}`, active: false });
  const timer = setTimeout(() => finish(tab.id, { ok: false, error: 'timed out (logged in to Goodreads?)' }), 30000);
  waiting.set(tab.id, { sendResponse, timer });
}
function finish(tabId, result) {
  const w = waiting.get(tabId);
  if (!w) return;
  waiting.delete(tabId);
  clearTimeout(w.timer);
  w.sendResponse(result);
  chrome.tabs.remove(tabId).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'findGoodreads') {
    findGoodreads(msg).then(sendResponse);
    return true;
  }
  if (msg.type === 'applyGoodreads') {
    applyGoodreads(msg.grId, msg.status, sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'applied' && sender.tab) finish(sender.tab.id, { ok: msg.ok, error: msg.error });
});
