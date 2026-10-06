// Goodreads book page: show a StoryGraph link and mirror shelf changes.
const STATUS_MAP = {
  'want to read': 'to-read',
  'currently reading': 'currently-reading',
  'read': 'read',
  'did not finish': 'did-not-finish',
};
const SHELF_LABEL = {
  'to-read': 'Want to Read',
  'currently-reading': 'Currently Reading',
  'read': 'Read',
  'did-not-finish': 'Did Not Finish',
};

function bookInfo() {
  let title = '', author = '', isbn = '';
  try {
    const ld = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    title = ld.name || '';
    const a = Array.isArray(ld.author) ? ld.author[0] : ld.author;
    author = (a && a.name) || '';
    isbn = ld.isbn || '';
  } catch (e) {}
  if (!isbn) {
    const nd = document.getElementById('__NEXT_DATA__');
    const m = nd && nd.textContent.match(/"isbn13":"(\d{13})"/);
    if (m) isbn = m[1];
  }
  if (!title) title = (document.querySelector('[data-testid="bookTitle"]') || {}).textContent || '';
  if (!author) author = (document.querySelector('.ContributorLink__name') || {}).textContent || '';
  const id = (location.pathname.match(/\/book\/show\/(\d+)/) || [])[1];
  return { id, title: title.trim(), author: author.trim(), isbn };
}

const send = (msg) => chrome.runtime.sendMessage(msg);

function toast(text) {
  let t = document.getElementById('gr2sg-toast');
  if (!t) { t = document.createElement('div'); t.id = 'gr2sg-toast'; document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3500);
}

function currentShelf() {
  const btn = document.querySelector('.BookActions button[aria-label^="Shelved as"], .BookActions button[aria-label*="shelf" i]');
  if (btn) {
    const m = btn.getAttribute('aria-label').match(/Shelved as '([^']+)'/);
    return (m ? m[1] : btn.textContent).trim().toLowerCase();
  }
  return null; // not shelved / not found
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(250); }
  return null;
}

let applying = false;
// Drives the Goodreads shelf UI to put this book on the given shelf.
async function applyShelf(status) {
  const label = SHELF_LABEL[status];
  if (!label) return { ok: false, error: 'unknown status' };
  applying = true;
  try {
    await waitFor(() => document.querySelector('.BookActions button'));
    await sleep(500);
    if (currentShelf() === label.toLowerCase()) return { ok: true };
    const cands = [...document.querySelectorAll('.BookActions button')].filter((b) => /shelve|shelf/i.test(b.getAttribute('aria-label') || ''));
    const opener = cands[cands.length - 1];
    if (opener) opener.click();
    let choice = await waitFor(() => document.querySelector(`.Overlay button[aria-label^="${label}"]`), 3000);
    if (!choice) {
      choice = [...document.querySelectorAll('.BookActions button')].find((b) => b.textContent.trim().toLowerCase() === label.toLowerCase());
    }
    if (!choice) return { ok: false, error: `no “${label}” button found` };
    choice.click();
    const done = await waitFor(() => currentShelf() === label.toLowerCase(), 6000);
    document.querySelector('.Overlay button[aria-label="Close"]')?.click();
    return done ? { ok: true } : { ok: false, error: 'shelf did not change' };
  } finally {
    setTimeout(() => { applying = false; }, 3000);
  }
}

let info, sg;
async function init() {
  info = bookInfo();
  if (!info.id) return;
  const pkey = 'pending:' + info.id;
  const pending = (await chrome.storage.local.get(pkey))[pkey];
  if (pending) {
    await chrome.storage.local.remove(pkey);
    if (Date.now() - pending.ts < 60000) {
      const r = await applyShelf(pending.status);
      send({ type: 'applied', ...r });
    }
  }
  const a = document.createElement('a');
  a.id = 'gr2sg-link';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Finding on StoryGraph…';
  document.body.appendChild(a);
  sg = await send({ type: 'find', info });
  a.href = sg.url;
  a.textContent = sg.exact ? 'Open on StoryGraph ↗' : 'Search StoryGraph ↗';
  if (!sg.exact) a.classList.add('gr2sg-search');

  let last = currentShelf();
  new MutationObserver(async () => {
    const now = currentShelf();
    if (now === last || applying) { last = now; return; }
    last = now;
    const status = STATUS_MAP[now];
    if (!status || !sg.bookId) return;
    const r = await send({ type: 'status', bookId: sg.bookId, status });
    toast(r.ok ? `StoryGraph: marked “${status}”` : `StoryGraph sync failed: ${r.error}`);
  }).observe(document.querySelector('.BookActions') || document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label'], characterData: true,
  });
}
init();
