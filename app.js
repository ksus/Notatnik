'use strict';
/* Drzewko — notatnik drzewiasty (PWA). Bez builda. Biblioteki mapy myśli (lib/) ładowane są leniwie, tylko przy eksporcie mapy. */
(() => {
  /* ================= Stałe i stan ================= */
  const KEY_NOTES = 'drzewko.notes.v1';
  const KEY_SETTINGS = 'drzewko.settings.v1';
  const DEFAULT_SETTINGS = { theme: 'system', fontSize: 17, exportStyle: 'dashes' };
  const FS_MIN = 13;
  const FS_MAX = 26;

  const state = {
    roots: [],                 // drzewo: { id, text, created, tags[], collapsed, children[] }
    settings: { ...DEFAULT_SETTINGS },
    targetId: null,            // pod którym węzłem dodajemy (null = najwyższy poziom)
    filter: { open: false, q: '', tag: null, fav: false },
  };
  const toastEl = document.getElementById('toast');

  /* ================= Pomocnicze ================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const uniq = (arr) => [...new Set(arr)];
  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  // Tworzenie elementów DOM (bez innerHTML dla treści użytkownika)
  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v; // tylko stałe, zaufane ciągi (ikony)
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    indent: '<path d="M4 4v16M9 12h11M15 7l5 5-5 5"/>',
    outdent: '<path d="M20 4v16M15 12H4M9 7l-5 5 5 5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.3 10.8 7.4-3.6M8.3 13.2l7.4 3.6"/>',
  };
  const icon = (name, size = '1.25em', filled = false) =>
    h('span', {
      class: 'ico',
      html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`,
    });

  /* ----- daty ----- */
  const dtFmt = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  const fmtDate = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : dtFmt.format(d); };
  const pad = (n) => String(n).padStart(2, '0');
  const exportDate = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const validIso = (x) => { const t = Date.parse(x); return isNaN(t) ? new Date().toISOString() : new Date(t).toISOString(); };

  /* ----- tagi ----- */
  const TAG_RE = /(^|\s)#([\p{L}\p{N}_-]+)/gu;
  const cleanTag = (t) =>
    String(t).replace(/^#+/, '').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
  const splitTags = (s) => uniq(String(s).split(/[\s,;]+/).map(cleanTag).filter(Boolean));

  // „Kupić mleko #zakupy” -> { text: 'Kupić mleko', tags: ['zakupy'] }
  // withTags=false (podwęzły): #tag zostaje zwykłym tekstem
  function parseEntry(raw, withTags = true) {
    const tags = [];
    let text = String(raw);
    if (withTags) text = text.replace(TAG_RE, (m, pre, t) => { const c = cleanTag(t); if (c) tags.push(c); return pre; });
    text = text.replace(/\s+/g, ' ').trim();
    return { text, tags: uniq(tags) };
  }

  /* ----- formatowanie (etykiety markmap): **pogrubienie**, *kursywa*, ~~przekreślenie~~ (także --przekreślenie--), ==zakreślenie== ----- */
  const INLINE_SRC = '(\\*\\*\\*|\\*\\*|~~|==|--|\\*)(\\S(?:.*?\\S)?)\\1';

  // zadanie (lista zadań markmap): „[ ] treść” / „[x] treść” na początku tekstu węzła
  const TASK_RE = /^\[([ xX])\]\s+(\S.*)$/;
  const taskOf = (text) => { const m = TASK_RE.exec(text); return m ? { done: m[1] !== ' ', rest: m[2] } : null; };

  function renderInline(text, level = 0) {
    const frag = document.createDocumentFragment();
    const re = new RegExp(INLINE_SRC, 'g');
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      const [, mark, inner] = m;
      const content = level < 4 ? renderInline(inner, level + 1) : inner;
      let el;
      if (mark === '***') el = h('strong', {}, h('em', {}, content));
      else if (mark === '**') el = h('strong', {}, content);
      else if (mark === '*') el = h('em', {}, content);
      else if (mark === '==') el = h('mark', {}, content);
      else el = h('del', {}, content);
      frag.append(el);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  }
  // tekst bez znaczników (do wyszukiwania i podpisów)
  const plain = (text) => String(text).replace(TASK_RE, '$2').replace(new RegExp(INLINE_SRC, 'g'), (m, mk, inner) => plain(inner));
  // do eksportu: --x-- zamieniamy na standardowe ~~x~~
  const toMarkmapInline = (text) => String(text).replace(new RegExp(INLINE_SRC, 'g'),
    (m, mk, inner) => { const k = mk === '--' ? '~~' : mk; return k + toMarkmapInline(inner) + k; });

  // [ ] → [x] → [ ] (w treści węzła)
  function toggleTask(id) {
    const l = locate(id); if (!l) return;
    l.node.text = l.node.text.replace(/^\[([ xX])\]/, (m, c) => (c === ' ' ? '[x]' : '[ ]'));
    saveNotes(); render();
  }

  /* ================= Zapis / odczyt ================= */
  function sanitizeNodes(list, depth = 0) {
    if (!Array.isArray(list) || depth > 60) return [];
    const out = [];
    for (const n of list) {
      if (!n || typeof n !== 'object') continue;
      const text = String(n.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000);
      if (!text) continue;
      out.push({
        id: typeof n.id === 'string' && n.id ? n.id : uid(),
        text,
        created: validIso(n.created),
        tags: Array.isArray(n.tags) ? uniq(n.tags.map(cleanTag).filter(Boolean)) : [],
        collapsed: !!n.collapsed,
        fav: !!n.fav,
        children: sanitizeNodes(n.children, depth + 1),
      });
    }
    return out;
  }

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY_NOTES);
      if (raw) { const d = JSON.parse(raw); state.roots = sanitizeNodes(Array.isArray(d) ? d : d.roots); }
    } catch (e) { console.warn('Nie udało się wczytać notatek', e); }
    try {
      const raw = localStorage.getItem(KEY_SETTINGS);
      if (raw) Object.assign(state.settings, JSON.parse(raw));
    } catch (e) { /* ignoruj */ }
    const fs = Number(state.settings.fontSize);
    state.settings.fontSize = Math.min(FS_MAX, Math.max(FS_MIN, isNaN(fs) ? 17 : fs));
    if (!['light', 'dark', 'system'].includes(state.settings.theme)) state.settings.theme = 'system';
    if (!['dashes', 'indent'].includes(state.settings.exportStyle)) state.settings.exportStyle = 'dashes';
  }

  function saveNotes() {
    try { localStorage.setItem(KEY_NOTES, JSON.stringify({ v: 1, roots: state.roots })); }
    catch (e) { toast('Nie udało się zapisać — brak miejsca w pamięci przeglądarki?'); }
  }
  function saveSettings() {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(state.settings)); } catch (e) { /* ignoruj */ }
  }

  /* ================= Operacje na drzewie ================= */
  function locate(id, list = state.roots, parent = null, depth = 0) {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.id === id) return { node: n, list, index: i, parent, depth };
      const r = locate(id, n.children, n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  const countNodes = (list) => list.reduce((s, n) => s + 1 + countNodes(n.children), 0);
  const makeNode = (text, tags = [], created = new Date().toISOString()) =>
    ({ id: uid(), text, created, tags, collapsed: false, fav: false, children: [] });

  function addNode(parentId, raw) {
    const p = parseEntry(raw, !parentId); // tagi tylko w węzłach głównych
    if (!p.text) return null;
    const node = makeNode(p.text, p.tags);
    let list = state.roots;
    if (parentId) {
      const loc = locate(parentId);
      if (!loc) return null;
      loc.node.collapsed = false;
      list = loc.node.children;
    }
    list.push(node);
    return node;
  }
  function moveNode(id, dir) {
    const l = locate(id); if (!l) return;
    const j = l.index + dir;
    if (j < 0 || j >= l.list.length) return;
    [l.list[l.index], l.list[j]] = [l.list[j], l.list[l.index]];
  }
  function indentNode(id) {            // staje się podwęzłem poprzedniego rodzeństwa
    const l = locate(id); if (!l || l.index === 0) return;
    const prev = l.list[l.index - 1];
    l.list.splice(l.index, 1);
    prev.children.push(l.node);
    prev.collapsed = false;
  }
  function outdentNode(id) {           // wychodzi poziom wyżej, zaraz za rodzicem
    const l = locate(id); if (!l || !l.parent) return;
    const pl = locate(l.parent.id);
    l.list.splice(l.index, 1);
    pl.list.splice(pl.index + 1, 0, l.node);
  }
  function removeNode(id) {
    const l = locate(id); if (!l) return;
    l.list.splice(l.index, 1);
  }
  function setCollapsedAll(list, value) {
    for (const n of list) { if (n.children.length) n.collapsed = value; setCollapsedAll(n.children, value); }
  }
  function allTags() {
    const m = new Map();
    (function walk(list) { for (const n of list) { for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1); walk(n.children); } })(state.roots);
    return [...m].map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pl'));
  }

  // Operacja z możliwością cofnięcia (toast „Cofnij”)
  function destructive(message, fn) {
    const before = JSON.stringify(state.roots);
    fn(); saveNotes(); render();
    toast(message, {
      action: 'Cofnij', duration: 7000,
      onAction: () => { state.roots = JSON.parse(before); saveNotes(); render(); },
    });
  }

  /* ================= Toast ================= */
  let toastTimer = 0;
  function toast(msg, { action, onAction, duration = 4000 } = {}) {
    const t = toastEl;
    // otwarte okno (dialog) jest nad resztą strony — toast musi być w nim, żeby był widoczny
    const open = [...document.querySelectorAll('dialog[open]')];
    const host = open.length ? open[open.length - 1] : $('#app');
    if (t.parentElement !== host) host.append(t);
    t.classList.toggle('in-dialog', open.length > 0);
    t.replaceChildren(h('span', {}, msg));
    if (action) t.append(h('button', { class: 'toast-btn', type: 'button', onclick: () => { hideToast(); onAction && onAction(); } }, action));
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    if (duration) toastTimer = setTimeout(hideToast, duration);
  }
  function hideToast() {
    const t = toastEl;
    t.classList.remove('show');
    setTimeout(() => { if (!t.classList.contains('show')) t.hidden = true; }, 220);
  }

  /* ================= Filtrowanie ================= */
  const isFiltering = () => state.filter.open && !!(state.filter.q.trim() || state.filter.tag || state.filter.fav);
  const filterQuery = () => state.filter.q.trim().toLowerCase().replace(/^#/, '');
  // tag i „ulubione” dotyczą notatek głównych; wyszukiwany tekst — dowolnego węzła
  const rootPasses = (n) => (!state.filter.tag || n.tags.includes(state.filter.tag)) && (!state.filter.fav || n.fav);
  const textMatch = (n, q) => !q || plain(n.text).toLowerCase().includes(q) || n.tags.some((t) => t.includes(q));

  /* ================= Render ================= */
  function render() {
    const tree = $('#tree');
    const filtering = isFiltering();
    const q = filterQuery();
    const memo = new Map();
    const hasMatch = (n) => {   // czy któryś potomek pasuje do wyszukiwanego tekstu
      if (memo.has(n.id)) return memo.get(n.id);
      const r = n.children.some((c) => textMatch(c, q) || hasMatch(c));
      memo.set(n.id, r);
      return r;
    };

    // full = przodek pasuje do filtra, więc pokazujemy całą jego gałąź
    const build = (list, depth, full) => {
      const ul = h('ul', { class: depth ? 'children' : 'root', role: depth ? 'group' : null });
      for (const n of list) {
        const self = textMatch(n, q);
        if (filtering) {
          if (depth === 0 && !rootPasses(n)) continue;
          if (!full && !self && !hasMatch(n)) continue;
        }
        const open = filtering || !n.collapsed;
        const li = h('li', {
          class: 'node', role: 'treeitem', dataset: { id: n.id },
          'aria-expanded': n.children.length ? String(open) : null,
        });
        li.append(buildRow(n, depth, filtering && !full && !self, open));
        if (n.children.length && open) li.append(build(n.children, depth + 1, full || (filtering && self)));
        ul.append(li);
      }
      return ul;
    };

    const list = build(state.roots, 0, false);
    tree.replaceChildren(list);
    if (!state.roots.length) {
      tree.replaceChildren(h('div', { class: 'empty' },
        h('h2', {}, 'Tu będzie Twoje drzewo myśli'),
        h('p', {}, 'Wpisz pierwszą notatkę na dole. Dodaj ', h('code', {}, '#tag'), ', aby ją otagować.'),
        h('p', {}, 'Formatuj: ', h('code', {}, '**pogrubienie**'), ' ', h('code', {}, '*kursywa*'), ' ', h('code', {}, '~~przekreślenie~~'), ' ', h('code', {}, '==zakreślenie==')),
        h('p', {}, 'Zadania: ', h('code', {}, '[ ] do zrobienia'), ' ', h('code', {}, '[x] zrobione')),
        h('p', {}, 'Przycisk ＋ przy notatce dodaje podwęzeł, ★ oznacza ulubione.')));
    } else if (filtering && !list.children.length) {
      tree.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Brak pasujących notatek.')));
    }
    renderFilterBar();
    updateComposer();
  }

  function buildRow(n, depth, ghost, open) {
    const hasKids = n.children.length > 0;
    const canDrag = depth === 0 && state.roots.length > 1 && !isFiltering(); // przeciąganie tylko notatek głównych, nie podczas filtrowania
    return h('div', { class: 'row' + (depth === 0 ? ' top' : '') + (n.id === state.targetId ? ' target' : '') + (ghost ? ' ghost' : '') },
      hasKids
        ? h('button', { class: 'toggle' + (open ? ' open' : ''), type: 'button', 'aria-label': open ? 'Zwiń' : 'Rozwiń',
            onclick: () => { n.collapsed = !n.collapsed; saveNotes(); render(); } }, icon('chev'))
        : h('span', { class: 'toggle-spacer' }),
      h('span', { class: 'prefix', 'aria-hidden': 'true' }, '-'.repeat(depth + 1)),
      h('div', {
        class: 'body' + (canDrag ? ' sortable' : ''), role: 'button', tabindex: '0',
        onclick: () => { if (Date.now() < noClickUntil) return; openNodeSheet(n.id); },
        onpointerdown: canDrag ? (e) => armDrag(e, n.id) : null,       // przytrzymaj tytuł, aby przeciągnąć
        oncontextmenu: canDrag ? (e) => e.preventDefault() : null,
        onkeydown: (e) => {
          if (canDrag && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {   // Alt + ↑/↓ = przesuń notatkę
            e.preventDefault(); moveNode(n.id, e.key === 'ArrowUp' ? -1 : 1); saveNotes(); render();
            const el = $(`[data-id="${CSS.escape(n.id)}"] .body`); if (el) el.focus();
          } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNodeSheet(n.id); }
        },
      },
        (() => {
          const task = taskOf(n.text);
          return h('span', { class: 'text' + (task && task.done ? ' done' : '') },
            task ? h('button', {
              class: 'cb' + (task.done ? ' on' : ''), type: 'button', role: 'checkbox', 'aria-checked': String(task.done),
              'aria-label': task.done ? 'Zadanie wykonane — odznacz' : 'Zadanie do zrobienia — zaznacz',
              onpointerdown: (e) => e.stopPropagation(),            // nie uruchamiaj przeciągania
              onkeydown: (e) => e.stopPropagation(),
              onclick: (e) => { e.stopPropagation(); toggleTask(n.id); },
            }) : null,
            renderInline(task ? task.rest : n.text));
        })(),
        h('span', { class: 'meta' },
          depth === 0 ? n.tags.map((t) => h('span', { class: 'chip' }, '#' + t)) : null,
          !open && hasKids ? h('span', { class: 'count', title: 'Ukryte podwęzły' }, '+' + countNodes(n.children)) : null,
          depth === 0 ? h('time', { datetime: n.created }, fmtDate(n.created)) : null)),
      depth === 0
        ? h('button', { class: 'star' + (n.fav ? ' on' : ''), type: 'button', 'aria-pressed': String(!!n.fav),
            title: n.fav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych', 'aria-label': n.fav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych',
            onclick: () => { n.fav = !n.fav; saveNotes(); render(); } }, icon('star', '1.15em', !!n.fav))
        : null,
      h('button', { class: 'add', type: 'button', title: 'Dodaj podwęzeł', 'aria-label': 'Dodaj podwęzeł',
        onclick: () => setTarget(n.id) }, icon('plus')));
  }

  /* ================= Przeciąganie notatek głównych (zmiana kolejności) ================= */
  // Dotyk / rysik: przytrzymaj tytuł notatki ~0,4 s bez ruchu, potem przeciągnij.
  // Mysz (komputer): złap tytuł i przesuń o kilka pikseli. Krótkie dotknięcie nadal otwiera okno notatki.
  const HOLD_MS = 380, MOVE_SLOP = 8;
  let dragging = false;     // trwa przeciąganie — blokuje przewijanie listy palcem
  let noClickUntil = 0;     // po przeciągnięciu ignorujemy „kliknięcie” dosyłane po puszczeniu

  function armDrag(e, id) {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || dragging) return;
    const el = e.currentTarget, li = el.closest('li.node'), ul = li && li.parentElement;
    if (!ul || !ul.classList.contains('root') || ul.children.length !== state.roots.length) return; // lista niepełna (filtr)
    const pid = e.pointerId, x0 = e.clientX, y0 = e.clientY, mouse = e.pointerType === 'mouse';
    let y = y0, timer = 0;
    const disarm = () => {
      clearTimeout(timer);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', disarm);
      el.removeEventListener('pointercancel', disarm);
    };
    const go = () => { disarm(); beginDrag(el, li, ul, pid, y, id); };
    const onMove = (ev) => {
      if (ev.pointerId !== pid) return;
      y = ev.clientY;
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > MOVE_SLOP) { if (mouse) go(); else disarm(); } // palec ruszył = zwykłe przewijanie
    };
    if (!mouse) timer = setTimeout(go, HOLD_MS);
    try { el.setPointerCapture(pid); } catch (err) { /* ignoruj */ }   // mysz: śledź ruch także poza tytułem
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', disarm);
    el.addEventListener('pointercancel', disarm);
  }

  // Podczas przeciągania gałąź jest chowana, żeby dało się ją łatwo przenieść.
  function beginDrag(el, li, ul, pid, startY, id) {
    const lis = [...ul.children], from = lis.indexOf(li), main = $('#main');
    if (from < 0) return;
    dragging = true;
    try { el.setPointerCapture(pid); } catch (err) { /* ignoruj */ }
    ul.classList.add('sorting'); li.classList.add('dragging');
    try { navigator.vibrate && navigator.vibrate(15); } catch (err) { /* ignoruj */ }

    // pozycje w układzie „treści” (niezależne od przewinięcia), zmierzone po schowaniu dzieci przeciąganej notatki
    const mainTop = main.getBoundingClientRect().top;
    const rects = lis.map((x) => x.getBoundingClientRect());
    const mids = rects.map((r) => r.top - mainTop + main.scrollTop + r.height / 2);
    const dh = rects[from].height, startScroll = main.scrollTop;
    let clientY = startY, to = from, raf = 0;

    const update = () => {
      const dy = clientY - startY + (main.scrollTop - startScroll);
      li.style.transform = `translateY(${dy}px)`;
      const c = mids[from] + dy;
      to = mids.filter((m, j) => j !== from && m < c).length;  // nowy indeks wśród pozostałych
      lis.forEach((x, j) => {
        if (j === from) return;
        x.style.transform = (from < j && j <= to) ? `translateY(${-dh}px)` : (to <= j && j < from) ? `translateY(${dh}px)` : '';
      });
    };
    const tick = () => {            // automatyczne przewijanie przy krawędzi listy
      raf = 0;
      const r = main.getBoundingClientRect(), zone = 56;
      let v = 0;
      if (clientY < r.top + zone) v = -Math.min(18, Math.ceil((r.top + zone - clientY) / 5));
      else if (clientY > r.bottom - zone) v = Math.min(18, Math.ceil((clientY - (r.bottom - zone)) / 5));
      if (v) { main.scrollTop += v; update(); raf = requestAnimationFrame(tick); }
    };
    const onMove = (ev) => { if (ev.pointerId !== pid) return; clientY = ev.clientY; update(); if (!raf) raf = requestAnimationFrame(tick); };
    const finish = (commit) => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      if (raf) cancelAnimationFrame(raf);
      dragging = false; noClickUntil = Date.now() + 400;
      if (commit && to !== from) {
        const [moved] = state.roots.splice(from, 1);
        state.roots.splice(to, 0, moved);
        saveNotes(); render(); flash(id);
      } else render();               // odtwarza widok (czyści transformacje)
    };
    const onUp = () => finish(true), onCancel = () => finish(false);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    update();
  }

  function renderFilterBar() {
    const bar = $('#filterbar');
    bar.hidden = !state.filter.open;
    $('#btnSearch').classList.toggle('active', state.filter.open);
    if (!state.filter.open) return;
    const tags = allTags();
    const chips = [
      h('button', {
        class: 'chip fav' + (state.filter.fav ? ' on' : ''), type: 'button', 'aria-pressed': String(state.filter.fav),
        onclick: () => { state.filter.fav = !state.filter.fav; render(); },
      }, icon('star', '.95em', true), 'Ulubione'),
      ...tags.map(({ tag, count }) =>
        h('button', {
          class: 'chip' + (state.filter.tag === tag ? ' on' : ''), type: 'button',
          'aria-pressed': String(state.filter.tag === tag),
          onclick: () => { state.filter.tag = state.filter.tag === tag ? null : tag; render(); },
        }, '#' + tag, h('small', {}, count))),
    ];
    if (!tags.length) chips.push(h('span', { class: 'hint' }, 'Brak tagów — dopisz #tag do notatki.'));
    $('#fTags').replaceChildren(...chips);
  }

  function flash(id) {
    const li = $(`[data-id="${CSS.escape(id)}"]`);
    if (!li) return;
    const row = $('.row', li);
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    row.classList.add('flash');
    setTimeout(() => row.classList.remove('flash'), 1300);
  }

  /* ================= Pasek dodawania ================= */
  function updateComposer() {
    const t = state.targetId ? locate(state.targetId) : null;
    if (state.targetId && !t) state.targetId = null;
    const depth = t ? t.depth + 1 : 0;
    $('#cPrefix').textContent = '-'.repeat(depth + 1);
    $('#cCtx').hidden = !t;
    if (t) $('#cCtxText').textContent = plain(t.node.text);
    $('#cOut').disabled = !t;
    $('#cIn').disabled = (t ? t.node.children : state.roots).length === 0;
    $('#cInput').placeholder = t ? 'Nowy podwęzeł…' : 'Nowa notatka…';
  }

  function setTarget(id, focus = true) {
    state.targetId = id;
    if (id) { const l = locate(id); if (l && l.node.collapsed) { l.node.collapsed = false; saveNotes(); } }
    render();
    if (focus) $('#cInput').focus();
    if (id) {
      const li = $(`[data-id="${CSS.escape(id)}"]`);
      if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  const goDeeper = () => {
    const l = state.targetId ? locate(state.targetId).node.children : state.roots;
    if (l.length) setTarget(l[l.length - 1].id);
  };
  const goOut = () => {
    if (!state.targetId) return;
    const l = locate(state.targetId);
    setTarget(l.parent ? l.parent.id : null);
  };

  function submitComposer() {
    const input = $('#cInput');
    const node = addNode(state.targetId, input.value);
    if (!node) return;
    input.value = '';
    saveNotes(); render(); flash(node.id);
    input.focus();
  }

  function initComposer() {
    $('#cAdd').append(icon('plus'));
    $('#cOut').append(icon('outdent'));
    $('#cIn').append(icon('indent'));
    $('#cReset').append(icon('x', '1.1em'));
    // przyciski nie zabierają fokusu polu tekstowemu (klawiatura zostaje otwarta)
    for (const b of ['#cAdd', '#cOut', '#cIn', '#cReset']) $(b).addEventListener('mousedown', (e) => e.preventDefault());
    $('#cAdd').addEventListener('click', () => { submitComposer(); });
    $('#cOut').addEventListener('click', () => { goOut(); });
    $('#cIn').addEventListener('click', () => { goDeeper(); });
    $('#cReset').addEventListener('click', () => setTarget(null));
    $('#cInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitComposer(); }
      else if (e.key === 'Tab') {
        if (e.shiftKey && !$('#cOut').disabled) { e.preventDefault(); goOut(); }
        else if (!e.shiftKey && !$('#cIn').disabled) { e.preventDefault(); goDeeper(); }
      }
    });
    // wysokość paska → położenie toasta
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => document.documentElement.style.setProperty('--composer-h', $('#composer').offsetHeight + 'px'))
        .observe($('#composer'));
    }
  }

  /* ================= Arkusz notatki ================= */
  let sheetCtx = null; // { id, tags[] }

  function openNodeSheet(id) {
    const loc = locate(id); if (!loc) return;
    sheetCtx = { id, tags: [...loc.node.tags] };
    renderNodeSheet();
    $('#sheet').showModal();
  }

  function commitSheet() {
    if (!sheetCtx) return;
    const loc = locate(sheetCtx.id); if (!loc) return;
    const txt = $('#sText'), tagIn = $('#sTag');
    if (txt) {
      const p = parseEntry(txt.value, loc.depth === 0);
      if (p.text) loc.node.text = p.text;
      sheetCtx.tags = uniq([...sheetCtx.tags, ...p.tags]);
    }
    if (tagIn && tagIn.value.trim()) { sheetCtx.tags = uniq([...sheetCtx.tags, ...splitTags(tagIn.value)]); tagIn.value = ''; }
    loc.node.tags = sheetCtx.tags.slice();
    saveNotes();
  }

  function renderSheetTags() {
    const box = $('#sTags'), sug = $('#sSuggest');
    if (!box) return;
    box.replaceChildren(...sheetCtx.tags.map((t) =>
      h('span', { class: 'chip' }, '#' + t,
        h('button', { class: 'x', type: 'button', 'aria-label': 'Usuń tag ' + t,
          onclick: () => { sheetCtx.tags = sheetCtx.tags.filter((x) => x !== t); renderSheetTags(); } }, icon('x', '.9em')))));
    const suggestions = allTags().map((x) => x.tag).filter((t) => !sheetCtx.tags.includes(t)).slice(0, 12);
    sug.replaceChildren(...suggestions.map((t) =>
      h('button', { class: 'chip suggest', type: 'button',
        onclick: () => { sheetCtx.tags.push(t); renderSheetTags(); } }, '+ #' + t)));
  }

  function renderNodeSheet() {
    const dlg = $('#sheet');
    const loc = locate(sheetCtx.id); if (!loc) { dlg.close(); return; }
    const { node, index, list, parent, depth } = loc;
    const isRoot = depth === 0; // tagi i data tylko dla węzłów głównych
    const act = (fn) => () => { commitSheet(); fn(sheetCtx.id); saveNotes(); render(); renderNodeSheet(); };
    const tool = (ic, label, ok, fn) =>
      h('button', { class: 'tool', type: 'button', disabled: !ok, onclick: act(fn) }, icon(ic), h('span', {}, label));

    // przyciski B / I / S: opakowują zaznaczenie (lub wstawiają parę znaczników) w polu treści
    const fmtBtn = (label, title, mark, cls) =>
      h('button', { class: 'fmt ' + cls, type: 'button', title, 'aria-label': title,
        onmousedown: (e) => e.preventDefault(),
        onclick: () => {
          const el = $('#sText'); if (!el) return;
          const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? a;
          const sel = el.value.slice(a, b);
          el.setRangeText(mark + sel + mark, a, b, 'preserve');
          const pos = sel ? b + mark.length * 2 : a + mark.length;
          el.focus(); el.setSelectionRange(pos, pos);
        } }, label);

    const addTagFromInput = () => {
      const inp = $('#sTag');
      sheetCtx.tags = uniq([...sheetCtx.tags, ...splitTags(inp.value)]);
      inp.value = ''; renderSheetTags(); inp.focus();
    };

    dlg.replaceChildren(h('div', { class: 'sheet-inner' },
      h('div', { class: 'sheet-head' },
        h('h2', {}, 'Notatka'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zamknij', onclick: () => dlg.close() }, icon('x'))),

      h('div', { class: 'field' },
        h('label', { class: 'lbl', for: 'sText' }, 'Treść'),
        h('input', { id: 'sText', type: 'text', value: node.text, maxlength: '500', autocomplete: 'off', enterkeyhint: 'done',
          onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); dlg.close(); } } }),
        h('div', { class: 'fmtbar', role: 'group', 'aria-label': 'Formatowanie' },
          fmtBtn('B', 'Pogrubienie **tekst**', '**', 'fmt-b'),
          fmtBtn('I', 'Kursywa *tekst*', '*', 'fmt-i'),
          fmtBtn('S', 'Przekreślenie ~~tekst~~', '~~', 'fmt-s'),
          fmtBtn('H', 'Zakreślenie ==tekst==', '==', 'fmt-h'),
          h('button', { class: 'fmt fmt-t', type: 'button', title: 'Zadanie: brak → [ ] → [x] → brak', 'aria-label': 'Zadanie (pole wyboru)',
            onmousedown: (e) => e.preventDefault(),
            onclick: () => {
              const el = $('#sText'); if (!el) return;
              const v = el.value, m = /^\[([ xX])\]\s*/.exec(v);
              const next = !m ? '[ ] ' + v : m[1] === ' ' ? '[x] ' + v.slice(m[0].length) : v.slice(m[0].length);
              el.value = next; el.focus(); el.setSelectionRange(next.length, next.length);
            } }, '☑'),
          h('span', { class: 'hint' }, '**b**  *i*  ~~s~~  ==zakreślenie==  [ ] / [x] zadanie'))),

      isRoot ? h('button', { class: 'btn fav-toggle' + (node.fav ? ' on' : ''), type: 'button', 'aria-pressed': String(!!node.fav),
        onclick: act((id) => { const l = locate(id); if (l) l.node.fav = !l.node.fav; }) },
        icon('star', '1.2em', !!node.fav), node.fav ? 'W ulubionych' : 'Dodaj do ulubionych') : null,

      isRoot ? h('div', { class: 'field' },
        h('span', { class: 'lbl' }, 'Tagi'),
        h('div', { id: 'sTags', class: 'chips' }),
        h('div', { class: 'tag-add' },
          h('input', { id: 'sTag', type: 'text', placeholder: 'dodaj tag…', autocomplete: 'off', autocapitalize: 'none', enterkeyhint: 'done',
            onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && !e.isComposing) { e.preventDefault(); addTagFromInput(); } } }),
          h('button', { class: 'btn small', type: 'button', onclick: addTagFromInput }, 'Dodaj')),
        h('div', { id: 'sSuggest', class: 'chips' })) : null,

      isRoot ? h('p', { class: 'when' }, 'Utworzono: ', h('time', { datetime: node.created }, fmtDate(node.created))) : null,

      h('div', { class: 'field' },
        h('span', { class: 'lbl' }, 'Struktura'),
        h('div', { class: 'grid4' },
          tool('up', 'W górę', index > 0, (id) => moveNode(id, -1)),
          tool('down', 'W dół', index < list.length - 1, (id) => moveNode(id, 1)),
          tool('indent', 'Wcięcie', index > 0, indentNode),
          tool('outdent', 'Wysuń', !!parent, outdentNode))),

      h('div', { class: 'two' },
        h('button', { class: 'btn', type: 'button', onclick: () => { const id = sheetCtx.id; commitSheet(); $('#sheet').close(); setTarget(id); } }, icon('plus'), 'Podwęzeł'),
        h('button', { class: 'btn', type: 'button', onclick: () => { const p = parent ? parent.id : null; commitSheet(); $('#sheet').close(); setTarget(p); } }, icon('plus'), 'Obok')),

      h('div', { class: 'two', style: 'margin-top:.5rem' },
        h('button', { class: 'btn', type: 'button', onclick: () => exportBranch(false) }, icon('download'), isRoot ? 'Eksport notatki .md' : 'Eksport gałęzi .md'),
        h('button', { class: 'btn', type: 'button', onclick: () => exportBranch(true) }, icon('share'), 'Udostępnij…')),

      h('div', { class: 'field' },
        h('span', { class: 'lbl' }, 'Mapa myśli (markmap)'),
        mapButtons((f) => exportBranchMap(f))),

      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => deleteFromSheet() }, icon('trash'), 'Usuń'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => dlg.close() }, 'Gotowe'))));
    renderSheetTags();
  }

  // eksport jednej notatki razem z jej podwęzłami (z arkusza notatki)
  function exportBranch(share) {
    commitSheet();
    const l = locate(sheetCtx.id); if (!l) return;
    (share ? shareMd : exportMd)([l.node], plain(l.node.text));
  }
  function exportBranchMap(format) {
    commitSheet();
    const l = locate(sheetCtx.id); if (!l) return;
    exportMap(format, [l.node], plain(l.node.text));
  }

  async function deleteFromSheet() {
    const id = sheetCtx.id;
    const loc = locate(id); if (!loc) return;
    const kids = countNodes(loc.node.children);
    if (kids > 0) {
      const ans = await ask({
        title: 'Usunąć notatkę?',
        message: `Razem z nią zniknie ${kids} ${kids === 1 ? 'podwęzeł' : 'podwęzłów'}. Możesz to jeszcze cofnąć tuż po usunięciu.`,
        actions: [{ value: 'del', label: 'Usuń', kind: 'danger' }, { value: '', label: 'Anuluj' }],
      });
      if (ans !== 'del') return;
    }
    sheetCtx = null;
    $('#sheet').close();
    destructive('Notatka usunięta', () => removeNode(id));
  }

  /* ================= Okno potwierdzenia ================= */
  function ask({ title, message, actions }) {
    return new Promise((resolve) => {
      const dlg = $('#confirm');
      dlg.returnValue = '';
      dlg.replaceChildren(h('div', { class: 'sheet-inner' },
        h('div', { class: 'sheet-head' }, h('h2', {}, title)),
        message ? h('p', { class: 'confirm-msg' }, message) : null,
        h('div', { class: 'stack' }, actions.map((a) =>
          h('button', { class: 'btn' + (a.kind ? ' ' + a.kind : ''), type: 'button', onclick: () => dlg.close(a.value) }, a.label)))));
      dlg.addEventListener('close', () => resolve(dlg.returnValue || null), { once: true });
      dlg.showModal();
    });
  }

  /* ================= Eksport / import Markdown ================= */
  // Format zgodny z markmap.js.org: "# notatka", "## podwęzeł", głębiej listy z wcięciem 2 spacje.
  // Tagi i data (tylko węzeł główny) trafiają do komentarza HTML pod nagłówkiem — mapa ich nie pokazuje.
  function toMarkdown(nodes = state.roots) {
    const lines = [];
    const blank = () => { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); };
    const emit = (n, depth) => {
      const text = toMarkmapInline(n.text);
      if (depth <= 1) {
        blank();
        lines.push('#'.repeat(depth + 1) + ' ' + text);
        if (depth === 0) lines.push(`<!-- ${[exportDate(n.created), ...(n.fav ? ['★'] : []), ...n.tags.map((t) => '#' + t)].join(' ')} -->`);
        lines.push('');
      } else {
        lines.push('  '.repeat(depth - 2) + '- ' + text);
      }
      n.children.forEach((c) => emit(c, depth + 1));
    };
    nodes.forEach((n) => emit(n, 0));
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.join('\n') + '\n';
  }

  const DATE_TAIL = /\s*·\s*(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?\s*$/;

  const toIso = (y, mo, d, hh, mm) => new Date(+y, +mo - 1, +d, +(hh || 0), +(mm || 0)).toISOString();

  // Starszy format: „- / -- / ---” (liczba myślników = poziom)
  function parseDashes(text) {
    const roots = [];
    const stack = [];
    for (const line of text.split('\n')) {
      const m = /^([ \t]*)(-+|\*|\+)[ \t]+(\S.*)$/.exec(line);
      if (!m) continue;
      const indent = m[1].replace(/\t/g, '    ').length;
      const dashes = m[2][0] === '-' ? m[2].length : 1;
      const key = dashes + indent;

      let body = m[3].trim();
      let created = null;
      const dm = DATE_TAIL.exec(body);
      if (dm) { created = toIso(dm[1], dm[2], dm[3], dm[4], dm[5]); body = body.slice(0, dm.index); }
      while (stack.length && stack[stack.length - 1].key >= key) stack.pop();
      const isRoot = stack.length === 0;
      const p = parseEntry(body, isRoot); // tagi tylko w węzłach głównych
      if (!p.text) continue;
      const node = makeNode(p.text, p.tags, created || new Date().toISOString());
      (isRoot ? roots : stack[stack.length - 1].node.children).push(node);
      stack.push({ key, node });
    }
    return roots;
  }

  // Metadane z komentarza: <!-- 2026-11-16 10:04 #tag1 #tag2 -->
  function parseMeta(s) {
    const dm = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s);
    const tags = [];
    String(s).replace(TAG_RE, (m, pre, t) => { const c = cleanTag(t); if (c) tags.push(c); return m; });
    return { created: dm ? toIso(dm[1], dm[2], dm[3], dm[4], dm[5]) : null, tags: uniq(tags), fav: /★/.test(s) };
  }

  // Rozumie format markmap (# / ## / listy z wcięciami), zwykłe listy z wcięciami (-, *, +, 1.)
  // oraz starszy format z myślnikami.
  function parseMarkdown(md) {
    const text = String(md).replace(/\r\n?/g, '\n');
    if (/^[ \t]*-{2,}[ \t]+\S/m.test(text)) return parseDashes(text);

    const LIST = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(\S.*)$/;
    const HEAD = /^(#{1,6})[ \t]+(\S.*)$/;
    const lines = text.split('\n');
    const roots = [];
    const heads = [];   // { level, node } — nagłówki
    let items = [];     // { indent, node } — elementy listy pod bieżącym nagłówkiem
    let last = null;

    const make = (raw, isRoot) => {
      let body = raw.trim(), created = null;
      const dm = DATE_TAIL.exec(body);
      if (dm) { created = toIso(dm[1], dm[2], dm[3], dm[4], dm[5]); body = body.slice(0, dm.index); }
      const p = parseEntry(body, isRoot); // tagi tylko w węzłach głównych
      return p.text ? makeNode(p.text, p.tags, created || new Date().toISOString()) : null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if ((m = HEAD.exec(line))) {
        const level = m[1].length;
        if (level === 1 && m[2].trim() === 'Notatki' && !roots.length) {
          // nagłówek starego eksportu — pomiń, jeśli zaraz po nim jest lista
          const next = lines.slice(i + 1).find((l) => l.trim());
          if (next && LIST.test(next)) continue;
        }
        while (heads.length && heads[heads.length - 1].level >= level) heads.pop();
        const parent = heads.length ? heads[heads.length - 1].node : null;
        const node = make(m[2], !parent);
        if (!node) continue;
        (parent ? parent.children : roots).push(node);
        heads.push({ level, node }); items = []; last = node;
      } else if ((m = LIST.exec(line))) {
        const indent = m[1].replace(/\t/g, '    ').length;
        while (items.length && items[items.length - 1].indent >= indent) items.pop();
        const parent = items.length ? items[items.length - 1].node : heads.length ? heads[heads.length - 1].node : null;
        const node = make(m[2], !parent);
        if (!node) continue;
        (parent ? parent.children : roots).push(node);
        items.push({ indent, node }); last = node;
      } else if ((m = /^<!--(.*)-->$/.exec(line.trim())) && last && roots.includes(last)) {
        const meta = parseMeta(m[1]);
        if (meta.created) last.created = meta.created;
        if (meta.fav) last.fav = true;
        last.tags = uniq([...last.tags, ...meta.tags]);
      }
    }
    return roots;
  }

  const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const fileName = (title, ext = 'md') => {
    const d = new Date(), s = title ? slug(title) : '';
    return `mindnotes-${s ? s + '-' : ''}${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
  };

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // nodes = cały notatnik (domyślnie) albo jedna notatka / gałąź: exportMd([węzeł], tytuł)
  function exportMd(nodes = state.roots, title = '') {
    if (!nodes.length) { toast('Nie ma jeszcze czego eksportować.'); return; }
    downloadBlob(new Blob([toMarkdown(nodes)], { type: 'text/markdown;charset=utf-8' }), fileName(title));
    toast('Wyeksportowano ' + countNodes(nodes) + ' wpisów do pliku .md');
  }

  /* ================= Eksport mapy myśli: SVG / PNG / HTML (markmap) ================= */
  // Biblioteki (d3 + markmap-view) leżą w lib/ i są w cache service workera, więc działa offline.
  // Ładujemy je dopiero przy pierwszym eksporcie mapy.
  const MM_LIBS = ['lib/d3.min.js', 'lib/markmap-view.js'];
  const MM_FONT = '400 16px/20px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const MM_OPTS = { maxWidth: 360, spacingVertical: 6 };
  // style dla zadań i zakreśleń w mapie (checkbox rysowany CSS-em, żeby wyglądał tak samo w SVG, PNG i HTML)
  const mmCss = () => `.markmap{--markmap-font:${MM_FONT}}`
    + '.markmap mark{background:#fff0a0;color:#1f2430;padding:0 .15em;border-radius:3px}'
    + '.markmap .mm-cb{display:inline-block;position:relative;box-sizing:border-box;width:.95em;height:.95em;margin-right:.4em;vertical-align:-.12em;border:1.6px solid currentColor;border-radius:.2em;opacity:.8}'
    + '.markmap .mm-cb-on{background:#2c6b5a;border-color:#2c6b5a;opacity:1}'
    + '.markmap .mm-cb-on::after{content:"";position:absolute;left:.27em;top:.03em;width:.26em;height:.52em;border:solid #fff;border-width:0 .15em .15em 0;transform:rotate(45deg)}';
  let mmLoading = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Nie wczytano ' + src));
      document.head.append(s);
    });
  }
  function loadMarkmap() {
    if (window.markmap && window.markmap.Markmap) return Promise.resolve();
    if (!mmLoading) {
      mmLoading = (async () => { for (const src of MM_LIBS) await loadScript(src); })()
        .catch((e) => { mmLoading = null; throw e; });
    }
    return mmLoading;
  }

  const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // etykieta węzła jako HTML (markmap renderuje treść węzła jako HTML)
  function inlineHtml(text, level = 0) {
    const re = new RegExp(INLINE_SRC, 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(text))) {
      out += escHtml(text.slice(last, m.index));
      const [, mark, inner] = m;
      const c = level < 4 ? inlineHtml(inner, level + 1) : escHtml(inner);
      out += mark === '***' ? `<strong><em>${c}</em></strong>`
        : mark === '**' ? `<strong>${c}</strong>`
        : mark === '*' ? `<em>${c}</em>`
        : mark === '==' ? `<mark>${c}</mark>`
        : `<del>${c}</del>`;
      last = m.index + m[0].length;
    }
    return out + escHtml(text.slice(last));
  }
  // jeden korzeń mapy: pojedyncza notatka / gałąź albo „MindNotes” z notatkami jako gałęziami
  function toMarkmapTree(nodes, title) {
    const label = (text) => {
      const t = taskOf(text);
      return t ? `<span class="mm-cb${t.done ? ' mm-cb-on' : ''}"></span>${inlineHtml(t.rest)}` : inlineHtml(text);
    };
    const conv = (n) => ({ content: label(n.text), children: n.children.map(conv) });
    return nodes.length === 1 ? conv(nodes[0]) : { content: escHtml(title || 'MindNotes'), children: nodes.map(conv) };
  }

  // Rysuje mapę poza ekranem i zwraca gotowy, samodzielny SVG (bez przesunięcia/zoomu, na białym tle).
  async function renderMapSvg(tree) {
    await loadMarkmap();
    const NS = 'http://www.w3.org/2000/svg';
    const host = h('div', { style: 'position:fixed;left:-99999px;top:0;width:1200px;height:800px;visibility:hidden;pointer-events:none', 'aria-hidden': 'true' });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '1200'); svg.setAttribute('height', '800');
    host.append(svg); document.body.append(host);
    let mm;
    try {
      mm = new window.markmap.Markmap(svg, {
        ...MM_OPTS, duration: 0, zoom: false, pan: false, autoFit: false,
        style: mmCss,
      });
      await mm.setData(JSON.parse(JSON.stringify(tree)));
      // setData wraca przed końcem przejścia d3 (węzły mają jeszcze opacity 0, linie szerokość 0) —
      // wymuszamy dokończenie animacji i czekamy, aż wszystko będzie w stanie docelowym
      const settled = () => [...svg.querySelectorAll('foreignObject.markmap-foreign')].every((f) => f.style.opacity !== '0')
        && [...svg.querySelectorAll('path.markmap-link')].every((p) => p.getAttribute('d') !== 'M0,0C0,0,0,0,0,0');
      for (let i = 0; i < 40 && !settled(); i++) {
        window.d3.timerFlush();
        await new Promise((r) => setTimeout(r, 50));
      }
      const { x1, y1, x2, y2 } = mm.state.rect;
      const pad = 24, width = Math.ceil(x2 - x1 + pad * 2), height = Math.ceil(y2 - y1 + pad * 2);
      const vx = Math.floor(x1 - pad), vy = Math.floor(y1 - pad);
      svg.setAttribute('width', width); svg.setAttribute('height', height);
      svg.setAttribute('viewBox', `${vx} ${vy} ${width} ${height}`);
      mm.g.attr('transform', null);
      const bg = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({ x: vx, y: vy, width, height, fill: '#ffffff' })) bg.setAttribute(k, v);
      svg.insertBefore(bg, svg.firstChild);
      const out = new XMLSerializer().serializeToString(svg);
      return { svg: '<?xml version="1.0" encoding="UTF-8"?>\n' + out, width, height };
    } finally {
      if (mm) mm.destroy();
      host.remove();
    }
  }

  function svgToPng({ svg, width, height }) {
    // piksele: 2× dla ostrości, ale z limitem (Android ma ograniczenia wielkości canvasu)
    const scale = Math.max(0.1, Math.min(2, Math.sqrt(16e6 / (width * height)), 8192 / Math.max(width, height)));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Nie udało się narysować SVG'));
      // data: URL (nie blob:), żeby canvas nie został „skażony” przez foreignObject
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  // Samodzielny plik HTML: interaktywna mapa (zoom, przesuwanie, zwijanie), skrypty wklejone w plik — działa bez internetu.
  async function buildMapHtml(tree, title) {
    await loadMarkmap();
    const [d3src, mmsrc] = await Promise.all(MM_LIBS.map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.text(); })));
    const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script');
    const data = JSON.stringify(tree).replace(/</g, '\\u003c');
    const doc = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title ? plain(title) : 'MindNotes — mapa myśli')}</title>
<style>
  html, body { margin: 0; height: 100%; background: #fff; }
  .markmap-dark body { background: #14161a; }
  #mindmap { position: fixed; inset: 0; width: 100%; height: 100%; }
</style>
</head>
<body>
<svg id="mindmap"></svg>
<script>${safeJs(d3src)}</script>
<script>${safeJs(mmsrc)}</script>
<script>
  if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.classList.add('markmap-dark');
  window.mm = markmap.Markmap.create('#mindmap', {
    autoFit: true, maxWidth: ${MM_OPTS.maxWidth}, spacingVertical: ${MM_OPTS.spacingVertical},
    style: function () { return ${JSON.stringify(mmCss()).replace(/</g, '\\u003c')}; }
  }, ${data});
</script>
</body>
</html>
`;
    return new Blob([doc], { type: 'text/html;charset=utf-8' });
  }

  // format: 'svg' | 'png' | 'html'; nodes = cały notatnik albo jedna notatka / gałąź
  async function exportMap(format, nodes = state.roots, title = '') {
    if (!nodes.length) { toast('Nie ma jeszcze czego eksportować.'); return; }
    toast('Przygotowuję mapę myśli…', { duration: 0 });
    try {
      const tree = toMarkmapTree(nodes, title);
      let blob;
      if (format === 'html') blob = await buildMapHtml(tree, title);
      else {
        const r = await renderMapSvg(tree);
        blob = format === 'png' ? await svgToPng(r) : new Blob([r.svg], { type: 'image/svg+xml;charset=utf-8' });
      }
      downloadBlob(blob, fileName(title, format));
      toast(`Zapisano mapę myśli (.${format})`);
    } catch (e) {
      console.warn('Eksport mapy', e);
      toast('Nie udało się utworzyć mapy myśli.', { duration: 6000 });
    }
  }

  // trzy przyciski formatów (używane w ustawieniach i w oknie notatki)
  const mapButtons = (run) => h('div', { class: 'three' },
    ['svg', 'png', 'html'].map((f) =>
      h('button', { class: 'btn', type: 'button', onclick: () => run(f) }, icon('download'), f.toUpperCase())));

  // Udostępnianie: plik .md → sam tekst → schowek → pobranie. Przycisk działa na każdej przeglądarce.
  async function shareMd(nodes = state.roots, title = '') {
    if (!nodes.length) { toast('Nie ma jeszcze czego udostępnić.'); return; }
    const md = toMarkdown(nodes), name = fileName(title);
    const shareTitle = title ? plain(title) : 'Notatki z MindNotes';
    const aborted = (e) => e && e.name === 'AbortError';

    if (navigator.share) {
      for (const type of ['text/plain', 'text/markdown']) {      // 1) plik
        try {
          const file = new File([md], name, { type });
          if (navigator.canShare && !navigator.canShare({ files: [file] })) continue;
          await navigator.share({ files: [file], title: shareTitle });
          return;
        } catch (e) { if (aborted(e)) return; }
      }
      try { await navigator.share({ title: shareTitle, text: md }); return; }  // 2) sam tekst
      catch (e) { if (aborted(e)) return; }
    }
    try { await navigator.clipboard.writeText(md); toast('Skopiowano treść .md do schowka'); return; }  // 3) schowek
    catch (e) { /* idziemy dalej */ }
    exportMd(nodes, title);                                       // 4) pobranie pliku
  }

  async function importFile(file) {
    let text;
    try { text = await (file.text ? file.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); })); }
    catch (e) { toast('Nie udało się odczytać pliku.'); return; }
    const imported = parseMarkdown(text);
    const n = countNodes(imported);
    if (!n) { toast('W pliku nie znaleziono wpisów (nagłówki # i listy -).', { duration: 6000 }); return; }

    let mode = 'replace';
    if (state.roots.length) {
      mode = await ask({
        title: `Importować ${n} notatek?`,
        message: `W aplikacji jest już ${countNodes(state.roots)} notatek.`,
        actions: [
          { value: 'append', label: 'Dołącz na końcu', kind: 'primary' },
          { value: 'replace', label: 'Zastąp wszystko', kind: 'danger' },
          { value: '', label: 'Anuluj' },
        ],
      });
      if (!mode) return;
    }
    destructive(`Zaimportowano ${n} notatek`, () => {
      state.roots = mode === 'append' ? [...state.roots, ...imported] : imported;
      state.targetId = null;
    });
  }

  /* ================= Ustawienia ================= */
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  function applySettings() {
    const { theme, fontSize } = state.settings;
    const dark = theme === 'dark' || (theme === 'system' && mqDark.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.setProperty('--fs', fontSize + 'px');
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#14161a' : '#faf8f4';
  }

  function segmented(name, options, value, onChange) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup' });
    for (const [val, label] of options) {
      const id = `${name}-${val}`;
      wrap.append(
        h('input', { type: 'radio', name, id, value: val, checked: val === value, onchange: () => onChange(val) }),
        h('label', { for: id }, label));
    }
    return wrap;
  }

  let deferredInstall = null;

  function openSettings() {
    const dlg = $('#settings');
    const s = state.settings;
    const fsVal = h('span', { class: 'val' }, s.fontSize + ' px');
    const range = h('input', { type: 'range', min: String(FS_MIN), max: String(FS_MAX), step: '1', value: String(s.fontSize), 'aria-label': 'Rozmiar czcionki',
      oninput: (e) => setFs(+e.target.value) });
    const setFs = (v) => {
      s.fontSize = Math.min(FS_MAX, Math.max(FS_MIN, v));
      range.value = String(s.fontSize); fsVal.textContent = s.fontSize + ' px';
      applySettings(); saveSettings();
    };
    const iosHint = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;

    dlg.replaceChildren(h('div', { class: 'sheet-inner' },
      h('div', { class: 'sheet-head' },
        h('h2', {}, 'Ustawienia'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zamknij', onclick: () => dlg.close() }, icon('x'))),

      h('div', { class: 'section' },
        h('h3', {}, 'Motyw'),
        segmented('theme', [['light', 'Jasny'], ['dark', 'Ciemny'], ['system', 'Systemowy']], s.theme,
          (v) => { s.theme = v; applySettings(); saveSettings(); })),

      h('div', { class: 'section' },
        h('h3', { class: 'with-val' }, h('span', {}, 'Rozmiar czcionki'), fsVal),
        h('div', { class: 'range-row' },
          h('button', { class: 'btn small', type: 'button', 'aria-label': 'Mniejsza czcionka', onclick: () => setFs(s.fontSize - 1) }, 'A−'),
          range,
          h('button', { class: 'btn small', type: 'button', 'aria-label': 'Większa czcionka', onclick: () => setFs(s.fontSize + 1) }, 'A+')),
        h('div', { class: 'preview' }, renderInline('Przykład: **pogrubienie**, *kursywa*, ~~przekreślenie~~, ==zakreślenie=='))),

      h('div', { class: 'section' },
        h('h3', {}, 'Drzewo'),
        h('div', { class: 'two' },
          h('button', { class: 'btn', type: 'button', onclick: () => { setCollapsedAll(state.roots, false); saveNotes(); render(); } }, 'Rozwiń wszystko'),
          h('button', { class: 'btn', type: 'button', onclick: () => { setCollapsedAll(state.roots, true); saveNotes(); render(); } }, 'Zwiń wszystko'))),

      h('div', { class: 'section' },
        h('h3', {}, 'Mapa myśli'),
        mapButtons((f) => exportMap(f)),
        h('p', { class: 'hint' }, 'Eksport całego notatnika jako mapa markmap: SVG (grafika wektorowa), PNG (obraz) albo HTML (interaktywna mapa z przybliżaniem, działa bez internetu). Pojedynczą notatkę lub gałąź wyeksportujesz w jej oknie. Mapa zawiera wszystkie gałęzie, także zwinięte.')),

      h('div', { class: 'section' },
        h('h3', {}, 'Kopia zapasowa'),
        h('div', { class: 'two' },
          h('button', { class: 'btn', type: 'button', onclick: () => exportMd() }, icon('download'), 'Eksport .md'),
          h('button', { class: 'btn', type: 'button', onclick: () => $('#fileIn').click() }, icon('upload'), 'Import .md')),
        h('div', { class: 'stack', style: 'margin-top:.5rem' },
          h('button', { class: 'btn', type: 'button', onclick: () => shareMd() }, icon('share'), 'Udostępnij…')),
        h('p', { class: 'hint' }, 'Format .md jest zgodny z markmap.js.org (# notatka, ## podwęzeł, niżej lista; **pogrubienie**, *kursywa*, ~~przekreślenie~~). Pojedynczą notatkę z gałęziami wyeksportujesz w jej oknie. Import rozpoznaje też starszy format z myślnikami.'),
        h('p', { class: 'hint' }, 'Notatki są zapisane tylko w tej przeglądarce (na tym urządzeniu). Rób eksport od czasu do czasu — wyczyszczenie danych przeglądarki je usuwa.')),

      (deferredInstall || iosHint) ? h('div', { class: 'section' },
        h('h3', {}, 'Aplikacja'),
        deferredInstall
          ? h('button', { class: 'btn primary', type: 'button', style: 'width:100%', onclick: async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; dlg.close(); } }, 'Zainstaluj na ekranie głównym')
          : h('p', { class: 'hint' }, 'Na iPhonie: Udostępnij → „Do ekranu początkowego”.')) : null,

      h('div', { class: 'section' },
        h('h3', {}, 'Dane'),
        h('button', { class: 'btn danger', type: 'button', style: 'width:100%', disabled: !state.roots.length,
          onclick: async () => {
            const ans = await ask({ title: 'Usunąć wszystkie notatki?', message: `Zniknie ${countNodes(state.roots)} notatek. Tuż po usunięciu możesz to cofnąć.`,
              actions: [{ value: 'del', label: 'Usuń wszystko', kind: 'danger' }, { value: '', label: 'Anuluj' }] });
            if (ans === 'del') { dlg.close(); destructive('Usunięto wszystkie notatki', () => { state.roots = []; state.targetId = null; }); }
          } }, icon('trash'), 'Usuń wszystkie notatki'),
        h('p', { class: 'hint' }, `Liczba notatek: ${countNodes(state.roots)}`))));
    dlg.showModal();
  }

  /* ================= Inicjalizacja ================= */
  function fitViewport() {
    // klawiatura ekranowa: dopasuj aplikację do widocznego obszaru (iOS/Android)
    const vv = window.visualViewport; if (!vv) return;
    const app = $('#app');
    app.style.height = vv.height + 'px';
    app.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
  }

  function init() {
    loadAll();
    applySettings();
    mqDark.addEventListener && mqDark.addEventListener('change', applySettings);

    $('#btnSearch').append(icon('search'));
    $('#btnSettings').append(icon('settings'));
    $('#btnSettings').addEventListener('click', openSettings);
    $('#btnSearch').addEventListener('click', () => {
      state.filter.open = !state.filter.open;
      if (!state.filter.open) { state.filter.q = ''; state.filter.tag = null; state.filter.fav = false; $('#fInput').value = ''; }
      render();
      if (state.filter.open) $('#fInput').focus();
    });
    $('#fInput').addEventListener('input', (e) => { state.filter.q = e.target.value; render(); });

    initComposer();
    // w trakcie przeciągania notatki palec nie może przewijać listy (listener nie-pasywny)
    $('#main').addEventListener('touchmove', (e) => { if (dragging && e.cancelable) e.preventDefault(); }, { passive: false });

    // arkusze: zamknięcie kliknięciem w tło; arkusz notatki zapisuje się przy zamknięciu
    for (const id of ['#sheet', '#settings', '#confirm']) {
      const d = $(id);
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    }
    $('#sheet').addEventListener('close', () => { if (sheetCtx) { commitSheet(); sheetCtx = null; } render(); });
    $('#settings').addEventListener('close', () => render());

    $('#fileIn').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) { $('#settings').close(); importFile(f); }
    });

    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
    window.addEventListener('appinstalled', () => { deferredInstall = null; toast('Zainstalowano aplikację'); });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', fitViewport);
      window.visualViewport.addEventListener('scroll', fitViewport);
      fitViewport();
    }

    // trwały zapis (żeby przeglądarka nie czyściła danych przy braku miejsca)
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* ignoruj */ }

    render();
    registerServiceWorker();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      const prompt = () => toast('Dostępna nowa wersja aplikacji', {
        action: 'Odśwież', duration: 0, onAction: () => reg.waiting && reg.waiting.postMessage('SKIP_WAITING'),
      });
      if (reg.waiting && navigator.serviceWorker.controller) prompt();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) prompt(); });
      });
    }).catch((e) => console.warn('SW:', e));
  }

  init();
})();
