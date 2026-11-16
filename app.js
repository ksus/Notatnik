'use strict';
/* Drzewko — notatnik drzewiasty (PWA). Bez zależności, bez builda. */
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
    filter: { open: false, q: '', tag: null },
  };

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
    sliders: '<path d="M3 6h9M16 6h5M3 12h3M10 12h11M3 18h11M18 18h3"/><circle cx="14" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
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
  const icon = (name, size = '1.25em') =>
    h('span', {
      class: 'ico',
      html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`,
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
    ({ id: uid(), text, created, tags, collapsed: false, children: [] });

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
    const t = $('#toast');
    t.replaceChildren(h('span', {}, msg));
    if (action) t.append(h('button', { class: 'toast-btn', type: 'button', onclick: () => { hideToast(); onAction && onAction(); } }, action));
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    if (duration) toastTimer = setTimeout(hideToast, duration);
  }
  function hideToast() {
    const t = $('#toast');
    t.classList.remove('show');
    setTimeout(() => { if (!t.classList.contains('show')) t.hidden = true; }, 220);
  }

  /* ================= Filtrowanie ================= */
  const isFiltering = () => state.filter.open && !!(state.filter.q.trim() || state.filter.tag);
  function selfMatch(n) {
    const q = state.filter.q.trim().toLowerCase().replace(/^#/, '');
    if (state.filter.tag && !n.tags.includes(state.filter.tag)) return false;
    if (q && !(n.text.toLowerCase().includes(q) || n.tags.some((t) => t.includes(q)))) return false;
    return true;
  }

  /* ================= Render ================= */
  function render() {
    const tree = $('#tree');
    const filtering = isFiltering();
    const memo = new Map();
    const subtreeHas = (n) => {
      if (memo.has(n.id)) return memo.get(n.id);
      const r = selfMatch(n) || n.children.some(subtreeHas);
      memo.set(n.id, r);
      return r;
    };

    const build = (list, depth) => {
      const ul = h('ul', { class: depth ? 'children' : 'root', role: depth ? 'group' : null });
      for (const n of list) {
        if (filtering && !subtreeHas(n)) continue;
        const open = filtering || !n.collapsed;
        const li = h('li', {
          class: 'node', role: 'treeitem', dataset: { id: n.id },
          'aria-expanded': n.children.length ? String(open) : null,
        });
        li.append(buildRow(n, depth, filtering, open));
        if (n.children.length && open) li.append(build(n.children, depth + 1));
        ul.append(li);
      }
      return ul;
    };

    const list = build(state.roots, 0);
    tree.replaceChildren(list);
    if (!state.roots.length) {
      tree.replaceChildren(h('div', { class: 'empty' },
        h('h2', {}, 'Tu będzie Twoje drzewo myśli'),
        h('p', {}, 'Wpisz pierwszą notatkę na dole. Dodaj ', h('code', {}, '#tag'), ', aby ją otagować.'),
        h('p', {}, h('code', {}, '-'), ' wpis · ', h('code', {}, '--'), ' podwęzeł · ', h('code', {}, '---'), ' kolejny poziom'),
        h('p', {}, 'Przycisk ＋ przy notatce dodaje podwęzeł.')));
    } else if (filtering && !list.children.length) {
      tree.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Brak pasujących notatek.')));
    }
    renderFilterBar();
    updateComposer();
  }

  function buildRow(n, depth, filtering, open) {
    const hasKids = n.children.length > 0;
    const ghost = filtering && !selfMatch(n);
    return h('div', { class: 'row' + (depth === 0 ? ' top' : '') + (n.id === state.targetId ? ' target' : '') + (ghost ? ' ghost' : '') },
      hasKids
        ? h('button', { class: 'toggle' + (open ? ' open' : ''), type: 'button', 'aria-label': open ? 'Zwiń' : 'Rozwiń',
            onclick: () => { n.collapsed = !n.collapsed; saveNotes(); render(); } }, icon('chev'))
        : h('span', { class: 'toggle-spacer' }),
      h('span', { class: 'prefix', 'aria-hidden': 'true' }, '-'.repeat(depth + 1)),
      h('div', {
        class: 'body', role: 'button', tabindex: '0',
        onclick: () => openNodeSheet(n.id),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNodeSheet(n.id); } },
      },
        h('span', { class: 'text' }, n.text),
        h('span', { class: 'meta' },
          depth === 0 ? n.tags.map((t) => h('span', { class: 'chip' }, '#' + t)) : null,
          !open && hasKids ? h('span', { class: 'count', title: 'Ukryte podwęzły' }, '+' + countNodes(n.children)) : null,
          depth === 0 ? h('time', { datetime: n.created }, fmtDate(n.created)) : null)),
      h('button', { class: 'add', type: 'button', title: 'Dodaj podwęzeł', 'aria-label': 'Dodaj podwęzeł',
        onclick: () => setTarget(n.id) }, icon('plus')));
  }

  function renderFilterBar() {
    const bar = $('#filterbar');
    bar.hidden = !state.filter.open;
    $('#btnSearch').classList.toggle('active', state.filter.open);
    if (!state.filter.open) return;
    const tags = allTags();
    const box = $('#fTags');
    if (!tags.length) { box.replaceChildren(h('span', { class: 'hint' }, 'Brak tagów — dopisz #tag do notatki.')); return; }
    box.replaceChildren(...tags.map(({ tag, count }) =>
      h('button', {
        class: 'chip' + (state.filter.tag === tag ? ' on' : ''), type: 'button',
        'aria-pressed': String(state.filter.tag === tag),
        onclick: () => { state.filter.tag = state.filter.tag === tag ? null : tag; render(); },
      }, '#' + tag, h('small', {}, count))));
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
    if (t) $('#cCtxText').textContent = t.node.text;
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

    const addTagFromInput = () => {
      const inp = $('#sTag');
      sheetCtx.tags = uniq([...sheetCtx.tags, ...splitTags(inp.value)]);
      inp.value = ''; renderSheetTags(); inp.focus();
    };

    dlg.replaceChildren(h('div', { class: 'sheet-inner' },
      h('div', { class: 'sheet-head' },
        h('h2', {}, 'Notatka'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Zamknij', onclick: () => dlg.close() }, icon('x'))),

      h('label', { class: 'field' },
        h('span', { class: 'lbl' }, 'Treść'),
        h('input', { id: 'sText', type: 'text', value: node.text, maxlength: '500', autocomplete: 'off', enterkeyhint: 'done',
          onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); dlg.close(); } } })),

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

      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => deleteFromSheet() }, icon('trash'), 'Usuń'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => dlg.close() }, 'Gotowe'))));
    renderSheetTags();
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
  function toMarkdown() {
    const style = state.settings.exportStyle;
    const lines = ['# Notatki', ''];
    (function walk(list, depth) {
      for (const n of list) {
        const prefix = style === 'dashes' ? '-'.repeat(depth + 1) : '  '.repeat(depth) + '-';
        if (depth === 0) {   // tagi i data tylko przy węzłach głównych
          const tags = n.tags.length ? ' ' + n.tags.map((t) => '#' + t).join(' ') : '';
          lines.push(`${prefix} ${n.text}${tags} · ${exportDate(n.created)}`);
        } else {
          lines.push(`${prefix} ${n.text}`);
        }
        walk(n.children, depth + 1);
      }
    })(state.roots, 0);
    return lines.join('\n') + '\n';
  }

  const DATE_TAIL = /\s*·\s*(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?\s*$/;

  // Rozumie zarówno „- / -- / ---”, jak i klasyczne listy z wcięciami (spacje/tabulatory, -, *, +)
  function parseMarkdown(md) {
    const roots = [];
    const stack = [];
    for (const line of String(md).replace(/\r\n?/g, '\n').split('\n')) {
      const m = /^([ \t]*)(-+|\*|\+)[ \t]+(\S.*)$/.exec(line);
      if (!m) continue;
      const indent = m[1].replace(/\t/g, '    ').length;
      const dashes = m[2][0] === '-' ? m[2].length : 1;
      const key = dashes + indent;

      let body = m[3].trim();
      let created = null;
      const dm = DATE_TAIL.exec(body);
      if (dm) {
        created = new Date(+dm[1], +dm[2] - 1, +dm[3], +(dm[4] || 0), +(dm[5] || 0)).toISOString();
        body = body.slice(0, dm.index);
      }
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

  const fileName = () => { const d = new Date(); return `mindnotes-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.md`; };

  function exportMd() {
    if (!state.roots.length) { toast('Nie ma jeszcze czego eksportować.'); return; }
    const blob = new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: fileName() });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Wyeksportowano ' + countNodes(state.roots) + ' notatek do pliku .md');
  }

  const canShareFiles = () => {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'a.md', { type: 'text/plain' })] })); }
    catch (e) { return false; }
  };
  async function shareMd() {
    if (!state.roots.length) { toast('Nie ma jeszcze czego udostępnić.'); return; }
    const file = new File([toMarkdown()], fileName(), { type: 'text/plain' });
    try { await navigator.share({ files: [file], title: 'Notatki z MindNotes' }); }
    catch (e) { if (e.name !== 'AbortError') toast('Nie udało się udostępnić pliku.'); }
  }

  async function importFile(file) {
    let text;
    try { text = await (file.text ? file.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); })); }
    catch (e) { toast('Nie udało się odczytać pliku.'); return; }
    const imported = parseMarkdown(text);
    const n = countNodes(imported);
    if (!n) { toast('W pliku nie znaleziono wpisów (linie zaczynające się od -, -- itd.).', { duration: 6000 }); return; }

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
        h('div', { class: 'preview' }, h('span', { class: 'prefix' }, '--'), ' Przykładowy podwęzeł ', h('span', { class: 'chip' }, '#tag'))),

      h('div', { class: 'section' },
        h('h3', {}, 'Format eksportu .md'),
        segmented('exportStyle', [['dashes', '- / -- / ---'], ['indent', 'Wcięcia']], s.exportStyle,
          (v) => { s.exportStyle = v; saveSettings(); }),
        h('p', { class: 'hint' }, 'Import rozpoznaje oba formaty.')),

      h('div', { class: 'section' },
        h('h3', {}, 'Drzewo'),
        h('div', { class: 'two' },
          h('button', { class: 'btn', type: 'button', onclick: () => { setCollapsedAll(state.roots, false); saveNotes(); render(); } }, 'Rozwiń wszystko'),
          h('button', { class: 'btn', type: 'button', onclick: () => { setCollapsedAll(state.roots, true); saveNotes(); render(); } }, 'Zwiń wszystko'))),

      h('div', { class: 'section' },
        h('h3', {}, 'Kopia zapasowa'),
        h('div', { class: 'two' },
          h('button', { class: 'btn', type: 'button', onclick: exportMd }, icon('download'), 'Eksport .md'),
          h('button', { class: 'btn', type: 'button', onclick: () => $('#fileIn').click() }, icon('upload'), 'Import .md')),
        canShareFiles() ? h('div', { class: 'stack', style: 'margin-top:.5rem' },
          h('button', { class: 'btn', type: 'button', onclick: shareMd }, icon('share'), 'Udostępnij plik…')) : null,
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
    $('#btnSettings').append(icon('sliders'));
    $('#btnSettings').addEventListener('click', openSettings);
    $('#btnSearch').addEventListener('click', () => {
      state.filter.open = !state.filter.open;
      if (!state.filter.open) { state.filter.q = ''; state.filter.tag = null; $('#fInput').value = ''; }
      render();
      if (state.filter.open) $('#fInput').focus();
    });
    $('#fInput').addEventListener('input', (e) => { state.filter.q = e.target.value; render(); });

    initComposer();

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
