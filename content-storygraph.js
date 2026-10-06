// StoryGraph book page: show a Goodreads link and mirror status changes to Goodreads.
const send = (msg) => chrome.runtime.sendMessage(msg);

function toast(text) {
  let t = document.getElementById('gr2sg-toast');
  if (!t) { t = document.createElement('div'); t.id = 'gr2sg-toast'; document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 4000);
}

async function init() {
  const sgId = (location.pathname.match(/\/books\/([0-9a-f-]{36})/) || [])[1];
  if (!sgId) return;
  const title = (document.querySelector('h3') || {}).textContent?.trim() || '';
  const author = (document.querySelector('a[href^="/authors/"]') || {}).textContent?.trim() || '';

  const a = document.createElement('a');
  a.id = 'gr2sg-link';
  a.target = '_blank';
  a.rel = 'noopener';
  a.style.background = '#6b5b3e';
  a.textContent = 'Finding on Goodreads…';
  document.body.appendChild(a);
  const gr = await send({ type: 'findGoodreads', sgId, title, author });
  a.href = gr.url;
  a.textContent = gr.exact ? 'Open on Goodreads ↗' : 'Search Goodreads ↗';
  if (!gr.exact) a.classList.add('gr2sg-search');

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.read-status-button');
    const form = btn && btn.closest('form[action*="update-status"]');
    if (!form || !gr.grId) return;
    const status = (form.getAttribute('action').match(/status=([\w-]+)/) || [])[1];
    if (!status) return;
    toast(`Goodreads: setting “${status}”…`);
    const r = await send({ type: 'applyGoodreads', grId: gr.grId, status });
    toast(r.ok ? `Goodreads: marked “${status}”` : `Goodreads sync failed: ${r.error}`);
  }, true);
}
init();
