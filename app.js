const state = {
  content: null,
  index: new Map(), // id -> { node, parentId, path }
  clockTimer: null,
};

/* ---------- Content ---------- */
async function loadContent() {
  const res = await fetch('content.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Failed to load content');
  return res.json();
}

function buildIndex(sections, parentId = null, path = []) {
  for (const node of sections) {
    state.index.set(node.id, {
      node,
      parentId,
      path: path.slice(),
    });
    const nextPath = path.concat([{ id: node.id, title: node.title }]);
    if (node.sections) buildIndex(node.sections, node.id, nextPath);
  }
}

function sortedSections(sections) {
  return (sections || [])
    .filter((s) => !s.hidden)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* ---------- Date / time ---------- */
function formatTime() {
  try {
    return new Intl.DateTimeFormat('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toLocaleTimeString();
  }
}

function formatHijri() {
  const d = new Date();
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    try {
      return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d);
    } catch {
      return '';
    }
  }
}

/* ---------- Tiny DOM helper ---------- */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'html') node.innerHTML = v;
    else if (v === true) node.setAttribute(k, '');
    else if (v === false || v == null) { /* skip */ }
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const BACK_ARROW_SVG =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<polyline points="9 6 15 12 9 18"/></svg>';

/* ---------- Render: main ---------- */
function renderMain(root) {
  root.innerHTML = '';

  const header = el(
    'header',
    { class: 'main-header' },
    el('h1', { class: 'app-title' }, 'كنوز'),
    el(
      'div',
      { class: 'datetime' },
      el('div', { class: 'clock', id: 'clock' }, formatTime()),
      el('div', { class: 'hijri', id: 'hijri' }, formatHijri())
    )
  );

  const nav = el('nav', { class: 'section-nav' });
  for (const s of sortedSections(state.content.sections)) {
    nav.append(
      el(
        'a',
        { class: 'nav-btn', href: `#/section/${encodeURIComponent(s.id)}` },
        s.title
      )
    );
  }

  root.append(header, nav);

  if (state.clockTimer) clearInterval(state.clockTimer);
  state.clockTimer = setInterval(() => {
    const c = document.getElementById('clock');
    const h = document.getElementById('hijri');
    if (c) c.textContent = formatTime();
    if (h) h.textContent = formatHijri();
  }, 30000);
}

/* ---------- Render: section ---------- */
function renderSection(root, id) {
  const entry = state.index.get(id);
  if (!entry) {
    showToast('القسم غير موجود');
    location.hash = '#/';
    return;
  }

  if (state.clockTimer) {
    clearInterval(state.clockTimer);
    state.clockTimer = null;
  }

  const { node, parentId, path } = entry;
  root.innerHTML = '';

  /* Header + breadcrumb */
  const crumbs = path.concat([{ id: node.id, title: node.title }]);
  const crumbEls = [];
  crumbs.forEach((c, i) => {
    const isLast = i === crumbs.length - 1;
    if (isLast) {
      crumbEls.push(el('span', { class: 'crumb current' }, c.title));
    } else {
      crumbEls.push(
        el(
          'a',
          { class: 'crumb', href: `#/section/${encodeURIComponent(c.id)}` },
          c.title
        )
      );
    }
    if (!isLast) crumbEls.push(el('span', { class: 'crumb-sep' }, '›'));
  });

  const backHref = parentId
    ? `#/section/${encodeURIComponent(parentId)}`
    : '#/';

  const header = el(
    'header',
    { class: 'section-header' },
    el('a', {
      class: 'back-btn',
      href: backHref,
      'aria-label': 'رجوع',
      html: BACK_ARROW_SVG,
    }),
    el('div', { class: 'breadcrumb' }, ...crumbEls)
  );

  /* Body */
  const body = el('div', { class: 'section-body' });
  const items = (node.items || []).slice();
  const children = sortedSections(node.sections);
  const hasItems = items.length > 0;
  const hasChildren = children.length > 0;

  if (hasItems && hasChildren) {
    body.append(
      el(
        'button',
        {
          class: 'jump-btn',
          onclick: () => {
            document
              .getElementById('subsections')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        },
        'الأقسام الفرعية ↓'
      )
    );
  }

  for (const item of items) {
    const article = el('article', { class: 'text-item' });
    if (item.heading) {
      article.append(el('h3', { class: 'item-heading' }, item.heading));
    }
    article.append(el('p', { class: 'item-body' }, item.body));
    body.append(article);
  }

  if (!hasItems && !hasChildren) {
    body.append(el('p', { class: 'empty' }, 'لا توجد نصوص بعد.'));
  }

  if (hasChildren) {
    const sub = el('div', { class: 'subsection-list', id: 'subsections' });
    if (hasItems) {
      sub.append(el('h2', { class: 'subsections-title' }, 'الأقسام الفرعية'));
    }
    for (const s of children) {
      sub.append(
        el(
          'a',
          { class: 'nav-btn', href: `#/section/${encodeURIComponent(s.id)}` },
          s.title
        )
      );
    }
    body.append(sub);
  }

  root.append(header, body);
  window.scrollTo(0, 0);
}

/* ---------- Router ---------- */
function route() {
  const hash = location.hash || '#/';
  const root = document.getElementById('app');

  const m = hash.match(/^#\/section\/(.+)$/);
  if (m) {
    renderSection(root, decodeURIComponent(m[1]));
    return;
  }
  renderMain(root);
}

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 2200);
}

/* ---------- SYNC HOOK ----------
 * Placeholder for the online update feature.
 * Planned flow:
 *   1. fetch a newer content.json from a remote URL
 *   2. compare `version` (or `updatedAt`) against state.content
 *   3. if newer, replace state.content, rebuild the index, re-render
 *   4. surface a toast on success / error
 */
async function syncContent() {
  // TODO: implement online sync
}

/* ---------- Init ---------- */
async function init() {
  const root = document.getElementById('app');
  root.innerHTML = '<p class="loading">جارٍ التحميل…</p>';

  try {
    state.content = await loadContent();
    state.index.clear();
    buildIndex(state.content.sections || []);
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    console.error(err);
    root.innerHTML = '';
    root.append(
      el(
        'div',
        { class: 'error-state' },
        el('p', {}, 'تعذّر تحميل المحتوى.'),
        el('button', { class: 'retry-btn', onclick: () => init() }, 'إعادة المحاولة')
      )
    );
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('sw.js')
      .catch((err) => console.warn('SW registration failed', err));
  }
}

document.addEventListener('DOMContentLoaded', init);