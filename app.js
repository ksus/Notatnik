'use strict';
/* Drzewko — notatnik drzewiasty (PWA). Bez builda. Biblioteki mapy myśli (lib/) ładowane są leniwie, tylko przy eksporcie mapy. (...)*/
(() => {
  /* ================= Stałe i stan ================= */
  const KEY_NOTES = 'drzewko.notes.v1';
  const KEY_SETTINGS = 'drzewko.settings.v1';
  const DEFAULT_SETTINGS = { theme: 'system', fontSize: 17, exportStyle: 'dashes', autoNest: true, bkSince: 0, lastExternalBackup: 0, lastFileBackup: 0, bkRemindedAt: 0, bkRemindDays: 0 };
  const FS_MIN = 13;
  const FS_MAX = 26;

  const state = {
    roots: [],                 // drzewo: { id, text, created, tags[], collapsed, children[] }
    settings: { ...DEFAULT_SETTINGS },
    targetId: null,            // pod którym węzłem dodajemy (null = najwyższy poziom)
    filter: { open: false, q: '', tag: null, fav: false },
    view: 'main',              // 'main' = aktywne notatki, 'archive' = archiwum
    focusId: null,             // notatka, w którą „weszliśmy” (widok wątku); null = wszystkie notatki
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
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',    chev: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    unarchive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    indent: '<path d="M4 4v16M9 12h11M15 7l5 5-5 5"/>',
    subnode: '<path d="M5 4v8a3 3 0 0 0 3 3h11M15 10l5 5-5 5"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
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

  /* ----- linki www: http(s)://… i www.… w treści wpisów ----- */
  // Adresy są na czas formatowania zamieniane na znaczniki (\uE000n\uE001), żeby ** -- ~~ == wewnątrz adresu go nie psuły.
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`\uE000\uE001]+/gi;
  const URL_TOKEN_RE = /\uE000(\d+)\uE001/g;
  function extractUrls(text) {
    const urls = [];
    const t = String(text).replace(URL_RE, (m) => {
      let url = m, tail = '';
      for (;;) { // odetnij znaki, które zwykle kończą zdanie lub formatowanie, a nie adres
        const c = url[url.length - 1];
        const unbalanced = c === ')' && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length;
        if (/[.,;:!?*~=\-'"\]}»”…]/.test(c) || unbalanced) { tail = c + tail; url = url.slice(0, -1); } else break;
      }
      if (!/^(https?:\/\/|www\.)[^/.\s]/i.test(url)) return m; // sam „www.” bez domeny — nie link
      urls.push(url);
      return '\uE000' + (urls.length - 1) + '\uE001' + tail;
    });
    return { t, urls };
  }
  const urlLabel = (u) => { try { return new URL(urlHref(u)).hostname.replace(/^www\./i, '') || u; } catch (e) { return u; } };
  const urlHref = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
  // tekst + znaczniki adresów → fragment DOM z klikalnymi linkami (nowa karta przeglądarki)
  function linkFrag(str, urls) {
    const frag = document.createDocumentFragment();
    let last = 0, m;
    const re = new RegExp(URL_TOKEN_RE.source, 'g');
    while ((m = re.exec(str))) {
      if (m.index > last) frag.append(str.slice(last, m.index));
      const u = urls[Number(m[1])];
      const href = urlHref(u);
      // sam adres (skrócony do domeny) jest zwykłym tekstem wpisu: dotknięcie edytuje, przesuwanie i przeciąganie działają;
      // link otwiera dopiero osobna ikonka ↗ obok (nowa karta przeglądarki)
      frag.append(
        h('span', { class: 'ext-url', title: href }, urlLabel(u)),
        h('a', { class: 'ext-open', href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Otwórz link: ' + urlLabel(u), title: 'Otwórz w nowej karcie: ' + href,
          onclick: (e) => e.stopPropagation(), onpointerdown: (e) => e.stopPropagation(), onkeydown: (e) => e.stopPropagation() }, icon('external', '.95em')));
      last = m.index + m[0].length;
    }
    if (last < str.length) frag.append(str.slice(last));
    return frag;
  }

  function renderInline(text, level = 0, urls) {
    if (level === 0 && !urls) { const x = extractUrls(text); text = x.t; urls = x.urls; }
    const frag = document.createDocumentFragment();
    const re = new RegExp(INLINE_SRC, 'g');
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(linkFrag(text.slice(last, m.index), urls));
      const [, mark, inner] = m;
      const content = level < 4 ? renderInline(inner, level + 1, urls) : linkFrag(inner, urls);
      let el;
      if (mark === '***') el = h('strong', {}, h('em', {}, content));
      else if (mark === '**') el = h('strong', {}, content);
      else if (mark === '*') el = h('em', {}, content);
      else if (mark === '==') el = h('mark', {}, content);
      else el = h('del', {}, content);
      frag.append(el);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(linkFrag(text.slice(last), urls));
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
        archived: depth === 0 && !!n.archived,   // archiwum dotyczy tylko notatek głównych
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
    state.settings.autoNest = state.settings.autoNest !== false;
  }

  function saveNotes() {
    try { localStorage.setItem(KEY_NOTES, JSON.stringify({ v: 1, roots: state.roots })); bkAfterSave(); }
    catch (e) { toast('Nie udało się zapisać — brak miejsca w pamięci przeglądarki?'); }
  }
  function saveSettings() {
    try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(state.settings)); } catch (e) { /* ignoruj */ }
  }

  /* ================= Automatyczne kopie zapasowe =================
     Warstwa 1: migawki w IndexedDB (ostatnie 3), przywracanie w Ustawieniach.
     Warstwa 2: automatyczny zapis pliku .md na dysku (File System Access API — Chrome/Edge na komputerze).
     Warstwa 3: przypomnienie o kopii zewnętrznej (eksport / udostępnij), gdy minął tydzień. */
  const BK = { DB: 'drzewko.backup', MAX: 3, GAP: 3 * 3600e3, FILE_DELAY: 20000, SNAP_DELAY: 5000 };
  const bkFileSupported = typeof window.showSaveFilePicker === 'function';
  let bkDbP = null, bkSnapTimer = 0, bkFileTimer = 0, bkHandle = null, bkFileStatus = '';   // '', 'ok', 'perm', 'err'

  function bkOpen() {
    if (!bkDbP) bkDbP = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('Brak IndexedDB'));
      const r = indexedDB.open(BK.DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('snaps', { keyPath: 'ts' }); r.result.createObjectStore('kv'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return bkDbP;
  }
  async function bkReq(store, mode, fn) {
    const db = await bkOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(store, mode);
      const r = fn(tx.objectStore(store));
      tx.oncomplete = () => res(r && r.result);
      tx.onerror = tx.onabort = () => rej(tx.error);
    });
  }
  const bkHash = (s) => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return s.length + ':' + x; };
  async function bkList() {
    const all = (await bkReq('snaps', 'readonly', (s) => s.getAll())) || [];
    return all.sort((a, b) => b.ts - a.ts);
  }

  // Migawka bieżących notatek. Pomija, gdy nic się nie zmieniło; bez force — także gdy ostatnia jest świeższa niż GAP.
  async function bkSnapshot(reason, { force = false } = {}) {
    if (!state.roots.length) return false;
    const json = JSON.stringify(state.roots);       // zrzut w chwili wywołania (zanim operacja zmieni dane)
    const count = countNodes(state.roots);
    const hash = bkHash(json);
    try {
      const last = (await bkList())[0];
      if (last && last.hash === hash) return false;
      if (!force && last && Date.now() - last.ts < BK.GAP) return false;
      let ts = Date.now(); if (last && ts <= last.ts) ts = last.ts + 1;
      await bkReq('snaps', 'readwrite', (s) => s.put({ ts, hash, count, reason, data: json }));
      for (const old of (await bkList()).slice(BK.MAX)) await bkReq('snaps', 'readwrite', (s) => s.delete(old.ts));
      return true;
    } catch (e) { console.warn('Migawka nie powiodła się', e); return false; }
  }

  // Co ile dni przypominać o kopii zewnętrznej: 0 = domyślnie (telefon 3 dni, komputer 7), -1 = wyłączone
  const bkTouch = () => matchMedia('(hover: none) and (pointer: coarse)').matches;
  function bkRemindDays() { const d = Number(state.settings.bkRemindDays) || 0; return d < 0 ? -1 : (d || (bkTouch() ? 3 : 7)); }
  function bkMarkExternal() { state.settings.lastExternalBackup = Date.now(); saveSettings(); }

  // Warstwa 2: zapis pliku
  async function bkLoadHandle() {
    if (!bkFileSupported) return;
    try {
      bkHandle = (await bkReq('kv', 'readonly', (s) => s.get('fileHandle'))) || null;
      if (bkHandle) bkFileStatus = (await bkHandle.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'perm';
    } catch (e) { bkHandle = null; }
  }
  async function bkWriteFile() {
    if (!bkHandle) return false;
    try {
      if ((await bkHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') { bkFileStatus = 'perm'; return false; }
      const w = await bkHandle.createWritable();
      await w.write(toMarkdown(state.roots));
      await w.close();
      bkFileStatus = 'ok';
      state.settings.lastFileBackup = Date.now();
      bkMarkExternal();
      return true;
    } catch (e) { bkFileStatus = 'err'; return false; }
  }
  async function bkChooseFile() {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'drzewko-kopia.md',
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      });
      bkHandle = handle;
      await bkReq('kv', 'readwrite', (s) => s.put(handle, 'fileHandle'));
      bkFileStatus = 'ok';
      return bkWriteFile();
    } catch (e) { return false; }      // anulowano wybór
  }
  async function bkGrantFile() {
    try {
      if (bkHandle && (await bkHandle.requestPermission({ mode: 'readwrite' })) === 'granted') { bkFileStatus = 'ok'; return bkWriteFile(); }
    } catch (e) { /* ignoruj */ }
    return false;
  }
  async function bkForgetFile() {
    bkHandle = null; bkFileStatus = '';
    try { await bkReq('kv', 'readwrite', (s) => s.delete('fileHandle')); } catch (e) { /* ignoruj */ }
  }

  // Wywoływane po każdym zapisie notatek
  function bkAfterSave() {
    clearTimeout(bkSnapTimer); bkSnapTimer = setTimeout(() => bkSnapshot('auto'), BK.SNAP_DELAY);
    if (bkHandle) { clearTimeout(bkFileTimer); bkFileTimer = setTimeout(bkWriteFile, BK.FILE_DELAY); }
  }

  async function bkRestore(snap) {
    let roots;
    try { roots = sanitizeNodes(JSON.parse(snap.data)); } catch (e) { toast('Ta kopia jest uszkodzona.'); return; }
    await bkSnapshot('przed przywróceniem', { force: true });
    state.roots = roots; state.targetId = null;
    saveNotes(); render();
    toast(`Przywrócono kopię z ${fmtDate(new Date(snap.ts).toISOString())}`, { duration: 5000 });
  }

  function bkInit() {
    const s = state.settings;
    if (!s.bkSince) { s.bkSince = Date.now(); saveSettings(); }
    bkLoadHandle().then(() => {
      if (!bkHandle) return;
      if (bkFileStatus === 'ok') bkWriteFile();
      else if (bkFileStatus === 'perm' && !bkTouch()) setTimeout(() => toast('Kopia do pliku wstrzymana — przeglądarka wymaga ponownej zgody.',
        { action: 'Zezwól', duration: 15000, onAction: async () => { if (await bkGrantFile()) toast('Zapisano kopię do pliku'); } }), 1500);
    });
    setTimeout(() => bkSnapshot('start'), 3000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { bkSnapshot('auto'); if (bkHandle) bkWriteFile(); }
    });
    // Warstwa 3: przypomnienie
    setTimeout(() => {
      if (!state.roots.length) return;
      const days0 = bkRemindDays(); if (days0 < 0) return;
      const last = s.lastExternalBackup || s.bkSince;
      if (Date.now() - last < days0 * 864e5 || Date.now() - (s.bkRemindedAt || 0) < 864e5) return;
      s.bkRemindedAt = Date.now(); saveSettings();
      const days = Math.floor((Date.now() - last) / 864e5);
      toast(`Ostatnia kopia poza aplikacją: ${s.lastExternalBackup ? days + ' dni temu' : 'brak'}. Zapisz ją w chmurze lub wyślij sobie.`,
        { action: 'Zrób kopię', duration: 15000, onAction: () => shareMd() });
    }, 6000);
  }

  // Sekcja w Ustawieniach
  function bkSection(dlg) {
    const list = h('div', { class: 'stack' });
    const fillList = async () => {
      let snaps = [];
      try { snaps = await bkList(); } catch (e) { /* brak IndexedDB */ }
      list.replaceChildren(...(snaps.length ? snaps.map((sn) => h('div', { class: 'two', style: 'align-items:center' },
        h('span', { class: 'hint', style: 'margin:0' }, `${fmtDate(new Date(sn.ts).toISOString())} · ${sn.count} not.`),
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          const ans = await ask({ title: 'Przywrócić tę kopię?', message: `Obecne notatki zostaną zastąpione kopią z ${fmtDate(new Date(sn.ts).toISOString())} (${sn.count} notatek). Aktualny stan zapiszemy jeszcze jako osobną kopię.`,
            actions: [{ value: 'ok', label: 'Przywróć', kind: 'danger' }, { value: '', label: 'Anuluj' }] });
          if (ans === 'ok') { dlg.close(); bkRestore(sn); }
        } }, 'Przywróć'))) : [h('p', { class: 'hint' }, 'Brak kopii — pierwsza powstanie automatycznie po zapisaniu notatek.')]));
    };
    fillList();

    const status = h('p', { class: 'hint' });
    const fileBox = h('div', { class: 'stack', style: 'margin-top:.5rem' });
    const fillFile = () => {
      if (!bkFileSupported) { fileBox.replaceChildren(); return; }
      const when = state.settings.lastFileBackup ? fmtDate(new Date(state.settings.lastFileBackup).toISOString()) : 'jeszcze nie zapisano';
      const btns = [];
      if (!bkHandle) btns.push(h('button', { class: 'btn', type: 'button', onclick: async () => { await bkChooseFile(); fillFile(); } }, icon('download'), 'Wybierz plik kopii na dysku…'));
      else {
        if (bkFileStatus === 'perm') btns.push(h('button', { class: 'btn primary', type: 'button', onclick: async () => { await bkGrantFile(); fillFile(); } }, 'Zezwól na zapis do pliku'));
        btns.push(h('button', { class: 'btn', type: 'button', onclick: async () => { await bkWriteFile(); fillFile(); } }, 'Zapisz do pliku teraz'));
        btns.push(h('button', { class: 'btn', type: 'button', onclick: async () => { await bkForgetFile(); fillFile(); } }, 'Wyłącz zapis do pliku'));
      }
      status.textContent = !bkHandle ? 'Aplikacja może sama aktualizować plik .md na dysku (np. w folderze zsynchronizowanym z OneDrive/Dyskiem Google).'
        : bkFileStatus === 'perm' ? 'Przeglądarka wymaga ponownego zezwolenia na zapis — kliknij przycisk poniżej.'
        : bkFileStatus === 'err' ? 'Nie udało się zapisać pliku. Spróbuj ponownie lub wybierz inny plik.'
        : `Plik jest aktualizowany automatycznie po zmianach. Ostatni zapis: ${when}.`;
      fileBox.replaceChildren(...btns);
    };
    fillFile();

    return h('div', { class: 'section' },
      h('h3', {}, 'Automatyczne kopie'),
      h('p', { class: 'hint' }, `Aplikacja sama zapisuje w tej przeglądarce do ${BK.MAX} ostatnich kopii (po zmianach, nie częściej niż co kilka godzin; zawsze przed importem i usunięciem wszystkiego).`),
      list,
      bkFileSupported ? status : null, fileBox,
      h('label', { class: 'hint', style: 'display:flex;align-items:center;gap:.5rem;margin-top:.6rem' }, 'Przypominaj o kopii (eksport / „Udostępnij”) co:',
        h('select', { 'aria-label': 'Przypomnienie o kopii', onchange: (e) => { state.settings.bkRemindDays = Number(e.target.value); saveSettings(); } },
          [[0, 'domyślnie (' + (bkTouch() ? 3 : 7) + ' dni)'], [2, '2 dni'], [3, '3 dni'], [5, '5 dni'], [7, '7 dni'], [14, '14 dni'], [-1, 'nigdy']]
            .map(([v, t]) => h('option', { value: String(v), selected: (Number(state.settings.bkRemindDays) || 0) === v }, t)))),
      h('p', { class: 'hint' }, 'Kopie w przeglądarce znikną razem z jej danymi — dlatego od czasu do czasu zrób też eksport .md lub „Udostępnij…”.'));
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
    ({ id: uid(), text, created, tags, collapsed: false, fav: false, archived: false, children: [] });

  const isArch = () => state.view === 'archive';
  const activeRoots = () => state.roots.filter((n) => !n.archived);
  const viewRoots = () => state.roots.filter((n) => !!n.archived === isArch());

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
  // indeks sąsiada w danym kierunku (notatki główne: pomijamy te z drugiego widoku — archiwum / aktywne); -1 gdy brak
  function siblingIndex(l, dir) {
    let j = l.index + dir;
    if (!l.parent) while (j >= 0 && j < l.list.length && !!l.list[j].archived !== !!l.node.archived) j += dir;
    return j < 0 || j >= l.list.length ? -1 : j;
  }
  function moveNode(id, dir) {
    const l = locate(id); if (!l) return;
    const j = siblingIndex(l, dir);
    if (j < 0) return;
    [l.list[l.index], l.list[j]] = [l.list[j], l.list[l.index]];
  }
  function indentNode(id) {            // staje się podwęzłem poprzedniego rodzeństwa
    const l = locate(id); if (!l) return;
    const pj = siblingIndex(l, -1); if (pj < 0) return;
    const prev = l.list[pj];
    l.list.splice(l.index, 1);
    prev.children.push(l.node);
    prev.collapsed = false;
  }
  function outdentNode(id) {           // wychodzi poziom wyżej, zaraz za rodzicem
    const l = locate(id); if (!l || !l.parent) return;
    const pl = locate(l.parent.id);
    l.list.splice(l.index, 1);
    if (!pl.parent) l.node.archived = !!pl.node.archived;   // nowa notatka główna zostaje tam, gdzie był jej rodzic
    pl.list.splice(pl.index + 1, 0, l.node);
  }
  function removeNode(id) {
    const l = locate(id); if (!l) return;
    if (state.focusId && (state.focusId === id || locate(state.focusId, l.node.children))) {
      state.focusId = l.parent ? l.parent.id : null;   // usunięto bieżący wątek — wracamy poziom wyżej
      state.targetId = state.focusId;
    }
    l.list.splice(l.index, 1);
  }
  function setCollapsedAll(list, value) {
    for (const n of list) { if (n.children.length) n.collapsed = value; setCollapsedAll(n.children, value); }
  }
  function allTags(roots = viewRoots()) {
    const m = new Map();
    (function walk(list) { for (const n of list) { for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1); walk(n.children); } })(roots);
    return [...m].map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'pl'));
  }

  // Przenosi notatkę główną do archiwum (value = true) albo z powrotem (false) — z możliwością cofnięcia
  function archiveNode(id, value) {
    destructive(value ? 'Przeniesiono do archiwum' : 'Przywrócono z archiwum', () => {
      const l = locate(id); if (l && !l.parent) l.node.archived = value;
      state.targetId = null;
    });
  }
  function setView(v) {
    state.view = v; state.targetId = null; state.focusId = null;
    state.filter.tag = null; state.filter.fav = false;   // tagi dotyczą tylko bieżącego widoku
    $('#main').scrollTop = 0;
    render();
  }

  // Operacja z możliwością cofnięcia (toast „Cofnij”)
  function destructive(message, fn, { backup = false } = {}) {
    if (backup) bkSnapshot('przed operacją', { force: true });
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

    const fo = filtering ? null : focusInfo();   // widok wątku (notatka + jej podgałęzie); wyszukiwanie zawsze obejmuje cały notatnik
    const list = fo ? build(fo.node.children, fo.depth + 1, false) : build(viewRoots(), 0, false);
    if (fo) {
      list.classList.add('focus-list');
      tree.replaceChildren(buildFocusHead(fo), list.children.length ? list
        : h('div', { class: 'empty small' }, h('p', {}, 'Brak podwęzłów. Dodaj pierwszy z paska na dole.')));
      // w widoku wątku nowe wpisy trafiają domyślnie pod bieżącą notatkę (albo pod jej potomka wybranego przyciskiem ＋)
      if (!(state.targetId && (state.targetId === fo.node.id || locate(state.targetId, fo.node.children)))) state.targetId = fo.node.id;
    } else {
      tree.replaceChildren(list);
    }
    if (!fo && !list.children.length) {
      const archived = state.roots.length - activeRoots().length;
      if (filtering) tree.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Brak pasujących notatek.')));
      else if (isArch()) tree.replaceChildren(h('div', { class: 'empty' },
        h('h2', {}, 'Archiwum jest puste'),
        h('p', {}, 'Przeciągnij notatkę w prawo, aby ją tu przenieść.')));
      else if (state.roots.length) tree.replaceChildren(h('div', { class: 'empty' },
        h('h2', {}, 'Wszystko w archiwum'),
        h('p', {}, `Aktywnych notatek: 0. W archiwum: ${archived}.`)));
    }
    if (!fo && !state.roots.length) {
      tree.replaceChildren(h('div', { class: 'empty' },
        h('h2', {}, 'Tu będzie Twoje drzewo myśli'),
        h('p', {}, 'Wpisz pierwszą notatkę na dole. Dodaj ', h('code', {}, '#tag'), ', aby ją otagować.'),
        h('p', {}, 'Formatuj: ', h('code', {}, '**pogrubienie**'), ' ', h('code', {}, '*kursywa*'), ' ', h('code', {}, '~~przekreślenie~~'), ' ', h('code', {}, '==zakreślenie==')),
        h('p', {}, 'Zadania: ', h('code', {}, '[ ] do zrobienia'), ' ', h('code', {}, '[x] zrobione')),
        h('p', {}, 'Przycisk ＋ przy notatce dodaje podwęzeł, ★ oznacza ulubione.')));
    }
    renderChrome();
    renderFilterBar();
    updateComposer();
  }

  // przycisk Archiwum (z licznikiem), pasek archiwum i widoczność paska dodawania
  function renderChrome() {
    const arch = isArch(), count = state.roots.length - activeRoots().length;
    const b = $('#btnArchive'), badge = $('.badge', b);
    b.classList.toggle('active', arch);
    b.setAttribute('aria-pressed', String(arch));
    const label = arch ? 'Wróć do notatek' : 'Archiwum' + (count ? ` (${count})` : '');
    b.setAttribute('aria-label', label); b.title = label;
    badge.textContent = String(count); 
    // badge.hidden = arch || !count;
    badge.hidden = true; // <-- zawsze ukryte (pokazywanie ilości notatek w archiwum)
    const bar = $('#archbar');
    bar.hidden = !arch;
    if (arch) bar.replaceChildren(
      h('div', {}, h('b', {}, 'Archiwum'), ` · ${count}`),
      h('p', {}, 'Przeciągnij w prawo, aby przywrócić, w lewo, aby usunąć.'));
    $('#composer').hidden = arch;
    // nagłówek: w widoku wątku ← i tytuł bieżącej notatki zamiast logo
    const fo = (arch || isFiltering()) ? null : focusInfo(), h1 = $('.top h1');
    if (h1Default === null) h1Default = h1.innerHTML;
    if (fo) {
      h1.classList.add('in-focus');
      h1.replaceChildren(
        h('button', { class: 'icon-btn back', type: 'button', title: 'Poziom wyżej', 'aria-label': 'Wróć poziom wyżej', onclick: () => navigateTo(fo.parent ? fo.parent.id : null, 1) }, icon('back')),
        h('span', { class: 'top-title' }, plain(fo.node.text)));
    } else if (h1.classList.contains('in-focus')) {
      h1.classList.remove('in-focus'); h1.innerHTML = h1Default;
    }
  }

  // ikona aplikacji obok „MindNotes”: zwija wszystkie gałęzie (zostają same tytuły notatek głównych)
  function collapseAll() {
    let count = 0;
    const walk = (list) => { for (const n of list) { if (n.children.length) { if (!n.collapsed) { n.collapsed = true; count++; } walk(n.children); } } };
    walk(state.roots);
    if (count) { saveNotes(); render(); }
    toast(count ? 'Zwinięto wszystkie gałęzie' : 'Wszystkie gałęzie są już zwinięte');
  }

  /* ================= Widok wątku (wejście w notatkę) ================= */
  let h1Default = null, histN = 0;
  // notatka, w której jesteśmy (z lokalizacją), albo null, gdy wątek nie istnieje / jest w archiwum
  function focusInfo() {
    if (!state.focusId || isArch()) return null;
    const l = locate(state.focusId);
    let top = l;
    while (top && top.parent) top = locate(top.parent.id);
    if (!l || !top || top.node.archived) { state.focusId = null; return null; }
    return l;
  }
  const focusActive = () => (isFiltering() || isArch()) ? null : focusInfo();
  function pathTo(id) {   // notatki od głównej do wskazanej
    const arr = [];
    for (let l = locate(id); l; l = l.parent ? locate(l.parent.id) : null) arr.unshift(l.node);
    return arr;
  }
  function setFocus(id, anim) {
    state.focusId = id; state.targetId = id;
    $('#main').scrollTop = 0;
    render();
    const t = $('#tree');
    if (anim) { t.classList.remove('nav-fwd', 'nav-back'); void t.offsetWidth; t.classList.add(anim); }
  }
  // przycisk › w wierszu: notatka z podgałęziami → jej wątek; wpis bez podgałęzi (z wyników wyszukiwania) → wątek jego rodzica z podświetleniem wpisu.
  // Wejście z wyszukiwania zamyka wyszukiwanie (widok wątku nie pokazuje się podczas filtrowania).
  function enterFromRow(n) {
    let id = n.id, flashId = null;
    if (!n.children.length && isFiltering()) {   // z wyników: wpis bez podgałęzi → wątek rodzica (jeśli ma rodzica)
      const l = locate(n.id);
      if (l && l.parent) { id = l.parent.id; flashId = n.id; }
    }
    if (state.filter.open || isFiltering()) {
      state.filter = { open: false, q: '', tag: null, fav: false };
      $('#fInput').value = '';
    }
    enterNode(id);
    if (flashId) setTimeout(() => flash(flashId), 250);
  }
  function enterNode(id) {
    const n = (history.state && history.state.n) || 0;
    try { history.pushState({ n: n + 1, f: id }, ''); histN = n + 1; } catch (e) { /* bez historii też działa */ }
    setFocus(id, 'nav-fwd');
  }
  // wyjście o `levels` poziomów w górę do notatki toId (null = „Wszystkie”); przycisk „wstecz” w telefonie robi to samo
  function navigateTo(toId, levels) {
    const n = (history.state && history.state.n) || 0;
    if (n >= levels) history.go(-levels);   // popstate ustawi widok
    else {
      try { history.replaceState(toId ? { n: 0, f: toId } : { n: 0 }, ''); histN = 0; } catch (e) { /* ignoruj */ }
      setFocus(toId, 'nav-back');
    }
  }
  function buildFocusHead(fo) {
    const n = fo.node, isRoot = !fo.parent, path = pathTo(n.id);
    const crumbs = [{ label: 'Wszystkie', id: null, level: 0 }, ...path.slice(0, -1).map((x, i) => ({ label: plain(x.text), id: x.id, level: i + 1 }))];
    const shown = crumbs.length > 3 ? [crumbs[0], null, ...crumbs.slice(-2)] : crumbs;   // długą ścieżkę skracamy do „…”
    const nav = h('nav', { class: 'crumbs', 'aria-label': 'Ścieżka' });
    for (const c of shown) {
      nav.append(c
        ? h('button', { class: 'crumb', type: 'button', onclick: () => navigateTo(c.id, path.length - c.level) }, c.label)
        : h('span', { class: 'crumb-dots' }, '…'),
      h('span', { class: 'crumb-sep', 'aria-hidden': 'true' }, '›'));
    }
    const task = taskOf(n.text);
    return h('div', { class: 'focus-head' }, nav,
      h('div', { class: 'focus-row' },
        h('button', { class: 'focus-title' + (task && task.done ? ' done' : ''), type: 'button', title: 'Edytuj notatkę', onclick: () => openNodeSheet(n.id) },
          renderInline(task ? task.rest : n.text))),
      isRoot ? h('div', { class: 'meta focus-meta' },
        ...n.tags.map((t) => h('span', { class: 'chip' }, '#' + t)),
        h('button', { class: 'fav-btn' + (n.fav ? ' on' : ''), type: 'button', 'aria-pressed': String(!!n.fav),
          title: n.fav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych', 'aria-label': n.fav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych',
          onclick: () => { n.fav = !n.fav; saveNotes(); render(); } }, icon('star', '1.15em', !!n.fav)),
        h('time', { datetime: n.created }, fmtDate(n.created))) : null);
  }

  function buildRow(n, depth, ghost, open) {
    const hasKids = n.children.length > 0;
    const canDrag = depth === 0 && !isArch() && activeRoots().length > 1 && !isFiltering(); // zmiana kolejności tylko notatek głównych, nie podczas filtrowania i nie w archiwum
    return h('div', { class: 'row' + (depth === 0 ? ' top' : '') + (n.id === state.targetId ? ' target' : '') + (ghost ? ' ghost' : '') },
      hasKids
        ? h('button', { class: 'toggle' + (open ? ' open' : ''), type: 'button', 'aria-label': open ? 'Zwiń' : 'Rozwiń',
            onclick: () => { n.collapsed = !n.collapsed; saveNotes(); render(); } }, icon('chev'))
        : h('span', { class: 'toggle-spacer' }),
      h('span', { class: 'prefix', 'aria-hidden': 'true' }, '-'.repeat(depth + 1)),
      h('div', {
        class: 'body sortable', role: 'button', tabindex: '0',
        onclick: () => { if (Date.now() < noClickUntil) return; openNodeSheet(n.id); },
        onpointerdown: (e) => armGesture(e, n.id, canDrag),   // główne: przytrzymanie = kolejność, w bok = archiwum / usuń; podwęzły: w lewo = usuń
        oncontextmenu: (e) => e.preventDefault(),
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
          depth === 0 && n.fav ? h('span', { class: 'fav-mark', role: 'img', 'aria-label': 'Ulubione', title: 'Ulubione' }, icon('star', '1.1em', true)) : null,   // ★ w wierszu tagów, po tagach
          // licznik ukrytych podwęzłów jest tylko informacją (nie przycisk) — dotknięcie go nie blokuje przeciągania; rozwija strzałka po lewej
          !open && hasKids ? h('span', { class: 'count', title: 'Ukryte podwęzły', 'aria-label': countNodes(n.children) + ' ukrytych podwęzłów' }, '+' + countNodes(n.children)) : null,
          depth === 0 ? h('time', { datetime: n.created }, fmtDate(n.created)) : null)),
      // › wchodzi w notatkę z podgałęziami; w wynikach wyszukiwania także przy wpisie bez podgałęzi (otwiera wątek jego rodzica)
      !isArch()
        ? h('button', { class: 'enter', type: 'button',
            title: hasKids ? 'Wejdź w notatkę (tylko jej podgałęzie)' : (isFiltering() && depth > 0 ? 'Pokaż w wątku (razem z sąsiednimi wpisami)' : 'Wejdź w notatkę (jeszcze bez podgałęzi)'),
            'aria-label': (hasKids ? 'Wejdź w notatkę: ' : 'Wejdź: ') + plain(n.text),
            onclick: () => enterFromRow(n) }, icon('chev'))
        : null,
      isArch() ? null : h('button', { class: 'add', type: 'button', title: 'Dodaj podwęzeł', 'aria-label': 'Dodaj podwęzeł',
        onclick: () => setTarget(n.id) }, icon('plus')));
  }

  /* ================= Przeciąganie notatek (zmiana kolejności; główne i podwęzły w obrębie rodzica) ================= */
  // Zmiana kolejności — dotyk / rysik: przytrzymaj tytuł notatki ~0,4 s bez ruchu, potem przeciągnij.
  // Mysz (komputer): złap tytuł i przesuń o kilka pikseli. Krótkie dotknięcie nadal otwiera okno notatki.
  const HOLD_MS = 380, MOVE_SLOP = 8, SWIPE_SWITCH = 24;   // SWIPE_SWITCH: ruch w bok po przytrzymaniu zamienia „podniesienie” w przesunięcie
  let dragging = false;     // trwa przeciąganie lub przesuwanie w bok — blokuje przewijanie listy palcem
  let noClickUntil = 0;     // po przeciągnięciu ignorujemy „kliknięcie” dosyłane po puszczeniu
  let gestureEnd = null;    // zakończenie trwającego gestu (zabezpieczenie, gdyby zdarzenie puszczenia nie dotarło do notatki)

  // Jeden punkt wejścia dla gestów na tytule notatki głównej:
  //  • przesunięcie poziome: w prawo = archiwizuj (w archiwum: przywróć), w lewo = usuń (z opcją „Cofnij”),
  //  • przytrzymanie (dotyk) lub złapanie (mysz) i ruch w pionie = zmiana kolejności,
  //  • ruch palca w pionie przed końcem przytrzymania = zwykłe przewijanie listy.
  function armGesture(e, id, allowReorder) {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0) || dragging) return;
    const el = e.currentTarget, li = el.closest('li.node'), ul = li && li.parentElement;
    if (!ul) return;
    const isRoot = ul.classList.contains('root');   // podwęzły: kolejność tylko w obrębie rodzica, w lewo = usuń, bez archiwizacji
    const reorder = isRoot ? allowReorder && ul.children.length === viewRoots().length      // główne: lista pełna (bez filtra)
      : !isArch() && !isFiltering() && ul.children.length > 1;                               // podwęzły: kolejność w obrębie jednego rodzica
    const pid = e.pointerId, x0 = e.clientX, y0 = e.clientY, mouse = e.pointerType === 'mouse';
    let x = x0, y = y0, timer = 0;
    const disarm = () => {
      clearTimeout(timer);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', disarm);
      el.removeEventListener('pointercancel', disarm);
    };
    const go = () => { disarm(); beginDrag(el, li, ul, pid, x, y, id); };
    const onMove = (ev) => {
      if (ev.pointerId !== pid) return;
      x = ev.clientX; y = ev.clientY;
      const dx = x - x0, dy = y - y0;
      if (Math.hypot(dx, dy) <= MOVE_SLOP) return;
      if (Math.abs(dx) > Math.abs(dy)) { disarm(); beginSwipe(el, li, pid, x0, id, !isRoot); }
      else if (mouse && reorder) go();
      else disarm();                                   // palec w pionie = zwykłe przewijanie
    };
    if (!mouse && reorder) timer = setTimeout(go, HOLD_MS);
    try { el.setPointerCapture(pid); } catch (err) { /* ignoruj */ }   // mysz: śledź ruch także poza tytułem
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', disarm);
    el.addEventListener('pointercancel', disarm);
  }

  // Przesuwanie notatki w bok: pod spodem tło z etykietą akcji; po przekroczeniu progu puszczenie wykonuje akcję.
  function beginSwipe(el, li, pid, x0, id, leftOnly = false) {
    const row = $('.row', li); if (!row) return;
    const inArchive = isArch();
    dragging = true;
    try { el.setPointerCapture(pid); } catch (err) { /* ignoruj */ }
    const W = row.offsetWidth, TH = Math.min(120, W * 0.3);
    li.classList.add('swiping');
    const bg = h('div', { class: 'swipe-bg' });
    li.prepend(bg);
    let dx = 0, dir = 0, armed = false;
    const setDir = (d) => {
      if (d === dir) return;
      dir = d;
      bg.className = 'swipe-bg ' + (d > 0 ? 'right' : 'left') + (armed ? ' armed' : '');
      bg.replaceChildren(...(d > 0
        ? [icon(inArchive ? 'unarchive' : 'archive', '1.3em'), inArchive ? 'Przywróć' : 'Archiwizuj']
        : [icon('trash', '1.3em'), 'Usuń']));
    };
    const update = () => {
      row.style.transform = `translateX(${dx}px)`;
      if (dx) setDir(dx > 0 ? 1 : -1);
      const a = Math.abs(dx) >= TH;
      if (a !== armed) {
        armed = a; bg.classList.toggle('armed', a);
        if (a) { try { navigator.vibrate && navigator.vibrate(12); } catch (err) { /* ignoruj */ } }
      }
    };
    const onMove = (ev) => { if (ev.pointerId !== pid) return; dx = ev.clientX - x0; if (leftOnly && dx > 0) dx = 0; update(); };
    let done = false;
    const finish = (commit) => {
      if (done) return; done = true; gestureEnd = null;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      dragging = false; noClickUntil = Date.now() + 400;
      row.style.transition = 'transform .16s ease';
      if (commit && armed) {
        const d = dir;
        row.style.transform = `translateX(${d > 0 ? W : -W}px)`;     // wysuń poza ekran, potem wykonaj akcję
        setTimeout(() => {
          if (d > 0) archiveNode(id, !inArchive);
          else destructive('Notatka usunięta', () => { removeNode(id); state.targetId = null; });
        }, 170);
      } else {
        row.style.transform = '';                                      // za krótko — wróć na miejsce
        setTimeout(render, 170);
      }
    };
    const onUp = () => finish(true), onCancel = () => finish(false);
    gestureEnd = finish;
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    update();
  }

  // Podczas przeciągania gałąź jest chowana, żeby dało się ją łatwo przenieść.
  function beginDrag(el, li, ul, pid, startX, startY, id) {
    const lis = [...ul.children], from = lis.indexOf(li), main = $('#main'), isRoot = ul.classList.contains('root');
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
    // przytrzymanie, a potem ruch w bok = jednak przesunięcie (archiwizuj / usuń), a nie zmiana kolejności
    const switchToSwipe = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      if (raf) cancelAnimationFrame(raf);
      done = true; gestureEnd = null; dragging = false;
      ul.classList.remove('sorting'); li.classList.remove('dragging');
      li.style.transform = ''; lis.forEach((x) => { x.style.transform = ''; });
      beginSwipe(el, li, pid, startX, id, !isRoot);
    };
    const onMove = (ev) => {
      if (ev.pointerId !== pid) return;
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (Math.abs(dx) > SWIPE_SWITCH && Math.abs(dx) > 1.5 * Math.abs(dy)) { switchToSwipe(); return; }
      clientY = ev.clientY; update(); if (!raf) raf = requestAnimationFrame(tick);
    };
    let done = false;
    const finish = (commit) => {
      if (done) return; done = true; gestureEnd = null;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      if (raf) cancelAnimationFrame(raf);
      dragging = false; noClickUntil = Date.now() + 400;
      if (commit && to !== from && !isRoot) {
        const l = locate(id);                      // podwęzeł: przestaw w tablicy rodzica
        if (l) { const [moved] = l.list.splice(l.index, 1); l.list.splice(to, 0, moved); }
        saveNotes(); render(); flash(id);
      } else if (commit && to !== from) {
        // indeksy dotyczą widocznej listy; notatki z archiwum zostają na swoich miejscach w tablicy
        const vis = activeRoots(), moved = vis[from], rest = vis.filter((x) => x !== moved);
        state.roots.splice(state.roots.indexOf(moved), 1);
        state.roots.splice(to < rest.length ? state.roots.indexOf(rest[to]) : state.roots.indexOf(rest[rest.length - 1]) + 1, 0, moved);
        saveNotes(); render(); flash(id);
      } else render();               // odtwarza widok (czyści transformacje)
    };
    const onUp = () => finish(true), onCancel = () => finish(false);
    gestureEnd = finish;
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
    const lbl = $('#cCtxLabel');
    $('#cCtx').hidden = !t;   // bez wybranej notatki nie ma czego pokazywać (poziom to zawsze „główny”)
    if (t) { lbl.replaceChildren(icon('subnode', '1.1em')); lbl.title = 'Dodajesz pod:'; lbl.setAttribute('aria-label', 'Dodajesz pod:'); }
    $('#cCtxText').textContent = t ? plain(t.node.text) : '';
    const fo = focusActive(), atFocus = !!(fo && state.targetId === fo.node.id);   // w widoku wątku nie wychodzimy ponad bieżącą notatkę
    $('#cReset').hidden = !t || atFocus;
    $('#cOut').disabled = !t || atFocus;
    $('#cIn').disabled = (t ? t.node.children : activeRoots()).length === 0;
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
    const l = state.targetId ? locate(state.targetId).node.children : activeRoots();
    if (l.length) setTarget(l[l.length - 1].id);
  };
  const goOut = () => {
    if (!state.targetId) return;
    const l = locate(state.targetId);
    setTarget(l.parent ? l.parent.id : null);
  };

  let composerBusy = false;
  async function submitComposer() {
    if (composerBusy) return;
    const input = $('#cInput');
    let raw = input.value;
    if (hasVerseRef(raw)) { composerBusy = true; try { raw = await expandVerses(raw); } finally { composerBusy = false; } }
    const node = addNode(state.targetId, raw);
    if (!node) return;
    input.value = ''; fitComposer();
    // po nowym temacie (notatka główna) kolejne wpisy domyślnie trafiają pod niego — jeśli włączone w Ustawieniach
    if (!state.targetId && state.settings.autoNest) state.targetId = node.id;
    saveNotes(); render(); flash(node.id);
    input.focus();
  }

  // pole wpisywania rośnie razem z tekstem (jak w komunikatorach): do 4 wierszy, potem się przewija
  function fitComposer() {
    const el = $('#cInput'); if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px'; // max-height z CSS ogranicza do 4 wierszy
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
    $('#cReset').addEventListener('click', () => { const fo = focusActive(); setTarget(fo ? fo.node.id : null); });
    $('#cInput').addEventListener('input', fitComposer);
    $('#cInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submitComposer(); }
      else if (e.key === 'Tab') {
        if (!e.shiftKey && vSugTab()) { e.preventDefault(); return; }
        if (e.shiftKey && !$('#cOut').disabled) { e.preventDefault(); goOut(); }
        else if (!e.shiftKey && !$('#cIn').disabled) { e.preventDefault(); goDeeper(); }
      }
    });
    initVerseSuggest();
    // wysokość paska → położenie toasta
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => document.documentElement.style.setProperty('--composer-h', $('#composer').offsetHeight + 'px'))
        .observe($('#composer'));
    }
  }

  /* ================= Wersety biblijne (UBG, offline) =================
     Wpisz np. @J 3,16 · @Ps 23,1-3 · @1 Kor 13,4-7 · @Rz 8,28.30 · @Ps 23 (cały rozdział)
     i zatwierdź notatkę — namiar zamieni się w tekst wersetu. Tekst: lib/ubg.json (Uwspółcześniona Biblia Gdańska). */
  const BIBLE_URL = 'lib/ubg.json';
  const VERSE_RE_SRC = '@((?:[1-3]\\s?)?[\\p{L}]+\\.?)\\s*(\\d+)(?:\\s*[,:]\\s*(\\d+(?:\\s*[-–]\\s*\\d+)?(?:\\s*[.;]\\s*\\d+(?:\\s*[-–]\\s*\\d+)?)*))?';
  const BOOK_ALIASES = {
    GEN: 'rdz genesis 1mojzeszowa 1mojz 1m rodzaju ksiegarodzaju', EXO: 'wj exodus 2mojzeszowa 2mojz 2m wyjscia ksiegawyjscia',
    LEV: 'kpl lev 3mojzeszowa 3mojz 3m kaplanska kaplanska', NUM: 'lb num 4mojzeszowa 4mojz 4m liczb', DEU: 'pwt deut 5mojzeszowa 5mojz 5m powtorzonegoprawa',
    JOS: 'joz jozuego', JDG: 'sdz sedziow', RUT: 'rt rut', '1SA': '1sm 1sam 1samuela', '2SA': '2sm 2sam 2samuela',
    '1KI': '1krl 1krolewska 1krolow', '2KI': '2krl 2krolewska 2krolow', '1CH': '1krn 1kron 1kronik', '2CH': '2krn 2kron 2kronik',
    EZR: 'ezd ezdrasza', NEH: 'ne neh nehemiasza', EST: 'est estery', JOB: 'hi job hiob hioba', PSA: 'ps psalm psalmy psalmow psalmu',
    PRO: 'prz przyp przypowiesci przyslow', ECC: 'koh kazn kaz kaznodziei koheleta', SNG: 'pnp piesn piesnnapiesni piesnnadpiesniami',
    ISA: 'iz izaj izajasza', JER: 'jr jer jeremiasza', LAM: 'lm tr treny lamentacje', EZK: 'ez ezech ezechiela', DAN: 'dn dan daniela',
    HOS: 'oz ozeasza', JOL: 'jl joela', AMO: 'am amosa', OBA: 'ab abd abdiasza', JON: 'jon jonasza', MIC: 'mi mic mich micheasza',
    NAM: 'na nah nahuma', HAB: 'ha hab habakuka', ZEP: 'so sof sofoniasza', HAG: 'ag aggeusza', ZEC: 'za zach zachariasza', MAL: 'ml mal malachiasza',
    MAT: 'mt mat mateusza', MRK: 'mk mar marka', LUK: 'lk luk lukasza', JHN: 'j jan jana', ACT: 'dz dzieje dziejow dziejeapostolskie',
    ROM: 'rz rzym rzymian', '1CO': '1kor 1koryntian', '2CO': '2kor 2koryntian', GAL: 'ga gal galacjan', EPH: 'ef efez efezjan',
    PHP: 'flp filip filipian', COL: 'kol kolosan', '1TH': '1tes 1tesaloniczan', '2TH': '2tes 2tesaloniczan', '1TI': '1tm 1tym 1tymoteusza',
    '2TI': '2tm 2tym 2tymoteusza', TIT: 'tt tyt tytusa', PHM: 'flm filem filemona', HEB: 'hbr hebr hebrajczykow', JAS: 'jk jak jakuba',
    '1PE': '1p 1pt 1pio 1piotra', '2PE': '2p 2pt 2pio 2piotra', '1JN': '1j 1jan 1jana', '2JN': '2j 2jan 2jana', '3JN': '3j 3jan 3jana',
    JUD: 'jud judy', REV: 'ap obj apokalipsa objawienie objawienia',
  };
  const bkNorm = (s) => s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s.]/g, '');
  let bibleData = null, bibleLoading = null, bibleAliases = null;

  function ensureBible() {
    if (bibleData) return Promise.resolve(bibleData);
    if (!bibleLoading) bibleLoading = fetch(BIBLE_URL).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => {
        bibleData = d; bibleAliases = new Map();
        for (const [id, list] of Object.entries(BOOK_ALIASES)) for (const a of list.split(' ')) bibleAliases.set(a, id);
        for (const [id, b] of Object.entries(d.books)) { bibleAliases.set(bkNorm(b.a), id); bibleAliases.set(bkNorm(b.n), id); }
        return d;
      })
      .catch((e) => { bibleLoading = null; throw e; });
    return bibleLoading;
  }

  function bibleBookId(name) {
    const k = bkNorm(name);
    if (bibleAliases.has(k)) return bibleAliases.get(k);
    if (k.length < 3) return null;
    const hits = new Set(); for (const [a, id] of bibleAliases) if (a.startsWith(k)) hits.add(id);
    return hits.size === 1 ? [...hits][0] : null;
  }

  // Zamienia jedno dopasowanie regexa na tekst wersetów; null = nie znaleziono
  function bibleLookup(bookName, chapter, spec) {
    const id = bibleBookId(bookName); if (!id) return null;
    const book = bibleData.books[id], ch = book.c[+chapter - 1]; if (!ch) return null;
    const nums = [];
    if (!spec) for (let i = 1; i <= ch.length; i++) nums.push(i);
    else for (const part of spec.split(/[.;]/)) {
      const m = part.match(/(\d+)(?:\s*[-–]\s*(\d+))?/); if (!m) return null;
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (a < 1 || b < a || b > ch.length) return null;
      for (let i = a; i <= b; i++) nums.push(i);
    }
    if (!nums.length) return null;
    const body = nums.length === 1 ? ch[nums[0] - 1] : nums.map((n) => `[${n}] ${ch[n - 1]}`).join(' ');
    const label = `${book.a} ${chapter}${spec ? ',' + spec.replace(/\s+/g, '').replace(/[–]/g, '-') : ''}`;
    return `„${body}” (${label} UBG)`;
  }

  const hasVerseRef = (text) => new RegExp(VERSE_RE_SRC, 'u').test(text);

  // Synchronicznie (gdy Biblia już wczytana); zwraca { text, missing[] }
  function expandVersesSync(text) {
    const missing = [];
    const out = text.replace(new RegExp(VERSE_RE_SRC, 'gu'), (all, book, ch, spec) => {
      const r = bibleLookup(book, ch, spec);
      if (r == null) { missing.push(all); return all; }
      return r;
    });
    return { text: out, missing };
  }

  async function expandVerses(text) {
    if (!hasVerseRef(text)) return text;
    try { await ensureBible(); }
    catch (e) {
      const why = location.protocol === 'file:' ? 'otwarto z pliku — uruchom aplikację przez adres http(s)'
        : /HTTP 404/.test(e.message) ? 'brak pliku lib/ubg.json na serwerze (błąd 404)' : (e.message || 'błąd sieci');
      toast(`Nie udało się wczytać tekstu Biblii: ${why}.`, { duration: 9000 }); return text;
    }
    const { text: out, missing } = expandVersesSync(text);
    if (missing.length) toast(`Nie znaleziono wersetu: ${missing.join(', ')}`, { duration: 6000 });
    return out;
  }

  /* ----- podpowiedzi namiarów (pasek nad polem pisania): @R… → księga → rozdział → werset ----- */
  const BOOK_RE = '((?:[1-3]\\s?)?[\\p{L}]+\\.?)';
  let vSugEl = null, vSugItems = [];
  const vWide = () => matchMedia('(min-width: 700px) and (hover: hover)').matches;

  function vSugContext(input) {
    const before = input.value.slice(0, input.selectionStart);
    const at = before.lastIndexOf('@');
    if (at < 0 || (at > 0 && !/[\s(„"]/.test(before[at - 1]))) return null;
    return { at, tail: before.slice(at + 1) };
  }

  // zwraca { items: [{ label, small, insert }], preview } albo null
  function vSugCompute(tail) {
    const D = bibleData; if (!D) return null;
    const closeBook = (id) => D.books[id].a + ' ';
    let m = new RegExp('^((?:[1-3]\\s?)?[\\p{L}]*)\\.?$', 'u').exec(tail);
    if (m && m[1]) {                                                      // etap 1: księga
      const key = bkNorm(m[1]); const ids = new Set(); const exact = [];
      for (const [a, id] of bibleAliases) if (a.startsWith(key)) { ids.add(id); if (a === key) exact.push(id); }
      if (!ids.size) return null;
      const list = [...new Set([...exact, ...D.order.filter((id) => ids.has(id))])].slice(0, 12);
      if (list.length === 1 && bkNorm(D.books[list[0]].a) === key) { /* księga już wpisana — przejdź do rozdziałów */ }
      else return { items: list.map((id) => ({ label: D.books[id].a, small: D.books[id].n, insert: closeBook(id) })) };
    }
    m = new RegExp('^' + BOOK_RE + '\\s*(\\d*)$', 'u').exec(tail);
    if (m) {                                                              // etap 2: rozdział
      const id = bibleBookId(m[1]); if (!id) return null;
      const book = D.books[id], typed = m[2], items = [];
      for (let n = 1; n <= book.c.length; n++) if (String(n).startsWith(typed)) items.push({ label: String(n), insert: `${book.a} ${n},` });
      return items.length ? { items: items.slice(0, 60) } : null;
    }
    m = new RegExp('^' + BOOK_RE + '\\s*(\\d+)\\s*[,:]\\s*([\\d\\-–.;\\s]*)$', 'u').exec(tail);
    if (m) {                                                              // etap 3: werset
      const id = bibleBookId(m[1]); if (!id) return null;
      const book = D.books[id], ch = book.c[+m[2] - 1]; if (!ch) return null;
      const spec = m[3].replace(/\s+/g, ''), head = `${book.a} ${m[2]},`;
      const lastNum = (spec.match(/(\d+)$/) || [])[1] || '', base = spec.slice(0, spec.length - lastNum.length);
      const items = [];
      if (lastNum && !spec.endsWith('-') && ch.length > 1) { items.push({ label: '–', small: 'zakres', insert: head + spec + '-' }); items.push({ label: '·', small: 'kolejny', insert: head + spec + '.' }); }
      const from = +((base.match(/(\d+)-$/) || [])[1] || 0) + 1;     // po „28-” podpowiadaj od 29
      for (let n = from; n <= ch.length && items.length < 60; n++) if (String(n).startsWith(lastNum)) items.push({ label: String(n), insert: head + base + n });
      const pv = +(lastNum || (spec.match(/(\d+)/) || [])[1] || 0);
      return { items, preview: pv && ch[pv - 1] ? `${book.a} ${m[2]},${pv} — ${ch[pv - 1]}` : (ch.length + ' wersetów — wybierz numer') };
    }
    return null;
  }

  function vSugUpdate() {
    const input = $('#cInput'); if (!vSugEl) return;
    const ctx = vSugContext(input);
    if (!ctx) { vSugItems = []; vSugEl.hidden = true; return; }
    if (!bibleData) { ensureBible().then(vSugUpdate).catch(() => {}); return; }
    const r = vSugCompute(ctx.tail);
    if (!r || !r.items.length) { vSugItems = []; vSugEl.hidden = true; return; }
    vSugItems = r.items.map((it) => ({ ...it, at: ctx.at, end: input.selectionStart }));
    const kids = [];
    if (r.preview && vWide()) kids.push(h('div', { class: 'vpreview' }, r.preview));
    kids.push(h('div', { class: 'vrow' }, vSugItems.map((it) => h('button', { class: 'chip suggest', type: 'button',
      onmousedown: (e) => e.preventDefault(), onclick: () => vSugApply(it) }, it.label, it.small ? h('small', {}, ' ' + it.small) : null))));
    vSugEl.replaceChildren(...kids);
    vSugEl.hidden = false;
  }

  function vSugApply(it) {
    const input = $('#cInput');
    input.setRangeText('@' + it.insert, it.at, it.end, 'end');
    fitComposer();
    input.focus();
    vSugUpdate();
  }

  // Tab na komputerze przyjmuje pierwszą podpowiedź; zwraca true, gdy obsłużył
  function vSugTab() {
    if (!vSugItems.length || vSugEl.hidden) return false;
    vSugApply(vSugItems[0]); return true;
  }

  function initVerseSuggest() {
    vSugEl = h('div', { id: 'vSug', class: 'vsug', hidden: true });
    $('#composer').insertBefore(vSugEl, $('#composer .inputrow'));
    const input = $('#cInput');
    input.addEventListener('input', vSugUpdate);
    input.addEventListener('click', vSugUpdate);
    input.addEventListener('keyup', (e) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') vSugUpdate(); });
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input && vSugEl) vSugEl.hidden = true; }, 150));
    input.addEventListener('focus', vSugUpdate);
  }

  /* ================= Arkusz notatki ================= */
  let sheetCtx = null; // { id, tags[] }

  function openNodeSheet(id) {
    const loc = locate(id); if (!loc) return;
    sheetCtx = { id, tags: [...loc.node.tags] };
    renderNodeSheet();
    $('#sheet').showModal();
    fitSheetText();
  }

  // pole treści rośnie razem z tekstem (zawija wiersze, min. 3 wiersze, potem przewija się)
  function fitSheetText() {
    const el = $('#sText'); if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  function commitSheet() {
    if (!sheetCtx) return;
    const loc = locate(sheetCtx.id); if (!loc) return;
    const txt = $('#sText'), tagIn = $('#sTag');
    if (txt) {
      let val = txt.value;
      if (hasVerseRef(val)) {
        if (bibleData) { const r = expandVersesSync(val); val = r.text; if (r.missing.length) toast(`Nie znaleziono wersetu: ${r.missing.join(', ')}`, { duration: 6000 }); }
        else { const nid = loc.node.id; ensureBible().then(() => { const l = locate(nid); if (l) { l.node.text = expandVersesSync(l.node.text).text; saveNotes(); render(); } }).catch(() => toast('Nie udało się wczytać tekstu Biblii.')); }
      }
      const p = parseEntry(val, loc.depth === 0);
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
        h('textarea', { id: 'sText', rows: '3', maxlength: '500', autocomplete: 'off', enterkeyhint: 'done', spellcheck: 'true',
          oninput: fitSheetText,
          onkeydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); dlg.close(); } } }, node.text),
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
          tool('up', 'W górę', siblingIndex(loc, -1) >= 0, (id) => moveNode(id, -1)),
          tool('down', 'W dół', siblingIndex(loc, 1) >= 0, (id) => moveNode(id, 1)),
          tool('indent', 'Wcięcie', siblingIndex(loc, -1) >= 0, indentNode),
          tool('outdent', 'Wysuń', !!parent, outdentNode))),

      isArch() ? null : h('div', { class: 'two' },
        h('button', { class: 'btn', type: 'button', onclick: () => { const id = sheetCtx.id; commitSheet(); $('#sheet').close(); setTarget(id); } }, icon('plus'), 'Podwęzeł'),
        h('button', { class: 'btn', type: 'button', onclick: () => { const p = parent ? parent.id : null; commitSheet(); $('#sheet').close(); setTarget(p); } }, icon('plus'), 'Obok')),

      isRoot ? h('div', { class: 'stack', style: 'margin-top:.5rem' },
        h('button', { class: 'btn', type: 'button', onclick: () => archiveFromSheet() },
          icon(node.archived ? 'unarchive' : 'archive'), node.archived ? 'Przywróć z archiwum' : 'Przenieś do archiwum')) : null,

      h('div', { class: 'two', style: 'margin-top:.5rem' },
        h('button', { class: 'btn', type: 'button', onclick: () => exportBranch(false) }, icon('download'), isRoot ? 'Eksport notatki .md' : 'Eksport gałęzi .md'),
        h('button', { class: 'btn', type: 'button', onclick: () => exportBranch(true) }, icon('share'), 'Udostępnij…')),
      h('div', { class: 'stack', style: 'margin-top:.5rem' },
        h('button', { class: 'btn', type: 'button', onclick: () => exportBranchDoc() }, icon('download'), 'Sformatowany widok .html')),

      h('div', { class: 'field' },
        h('span', { class: 'lbl' }, 'Mapa myśli (markmap)'),
        mapButtons((f) => exportBranchMap(f))),

      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => deleteFromSheet() }, icon('trash'), 'Usuń'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => dlg.close() }, 'Gotowe'))));
    renderSheetTags();
    if (dlg.open) fitSheetText();
  }

  // eksport jednej notatki razem z jej podwęzłami (z arkusza notatki)
  function exportBranch(share) {
    commitSheet();
    const l = locate(sheetCtx.id); if (!l) return;
    (share ? shareMd : exportMd)([l.node], plain(l.node.text));
  }
  function exportBranchDoc() {
    commitSheet();
    const l = locate(sheetCtx.id); if (!l) return;
    exportDoc([l.node], plain(l.node.text));
  }
  function exportBranchMap(format) {
    commitSheet();
    const l = locate(sheetCtx.id); if (!l) return;
    exportMap(format, [l.node], plain(l.node.text));
  }

  function archiveFromSheet() {
    const id = sheetCtx.id, l = locate(id); if (!l || l.parent) return;
    const to = !l.node.archived;
    commitSheet(); sheetCtx = null;
    $('#sheet').close();
    archiveNode(id, to);
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
        if (depth === 0) lines.push(`<!-- ${[exportDate(n.created), ...(n.fav ? ['★'] : []), ...(n.archived ? ['📦'] : []), ...n.tags.map((t) => '#' + t)].join(' ')} -->`);
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
    return { created: dm ? toIso(dm[1], dm[2], dm[3], dm[4], dm[5]) : null, tags: uniq(tags), fav: /★/.test(s), archived: /📦/.test(s) };
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
        if (meta.archived) last.archived = true;
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
    if (nodes === state.roots) bkMarkExternal();
    if (!nodes.length) { toast('Nie ma jeszcze czego eksportować.'); return; }
    downloadBlob(new Blob([toMarkdown(nodes)], { type: 'text/markdown;charset=utf-8' }), fileName(title));
    toast('Wyeksportowano ' + countNodes(nodes) + ' wpisów do pliku .md');
  }

  /* ================= Eksport sformatowanego widoku markdown (.html) ================= */
  // Ta sama struktura co w pliku .md (# notatka, ## podwęzeł, głębiej listy), ale jako gotowa, ładnie
  // sformatowana strona: samodzielny plik bez skryptów i bibliotek, jasny/ciemny motyw, przyjazny drukowi.
  const DOC_CSS = `
:root{--bg:#fff;--fg:#1f2430;--muted:#6b7280;--line:#e5e7eb;--accent:#2c6b5a;--chip:#eef4f2;--mark:#fff0a0}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--fg:#e6e8ec;--muted:#9aa1ad;--line:#2a2e36;--accent:#6fc2aa;--chip:#1e2a27;--mark:#5c5010}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:46rem;margin:0 auto;padding:2rem 1.25rem 3rem}
section.note{margin:0 0 2.5rem}
section.note+section.note{padding-top:2rem;border-top:1px solid var(--line)}
h1{font-size:1.9rem;line-height:1.25;margin:0 0 .35rem;letter-spacing:-.01em}
h2{font-size:1.3rem;line-height:1.3;margin:1.8rem 0 .5rem;padding-bottom:.25rem;border-bottom:1px solid var(--line)}
.meta{display:flex;flex-wrap:wrap;gap:.4rem .6rem;align-items:center;margin:0 0 1rem;color:var(--muted);font-size:.85rem}
.tag{background:var(--chip);color:var(--accent);padding:.05rem .55rem;border-radius:999px;font-weight:600}
ul{margin:.3rem 0;padding-left:1.4rem}
ul ul{margin:.15rem 0}
li{margin:.2rem 0}
li.task{list-style:none;margin-left:-1.4rem;padding-left:0}
mark{background:var(--mark);color:inherit;padding:0 .15em;border-radius:3px}
a{color:var(--accent);overflow-wrap:anywhere}
del{opacity:.7}
.cb{display:inline-block;position:relative;box-sizing:border-box;width:.95em;height:.95em;margin-right:.45em;vertical-align:-.12em;border:1.6px solid currentColor;border-radius:.2em;opacity:.8}
.cb.on{background:var(--accent);border-color:var(--accent);opacity:1}
.cb.on::after{content:"";position:absolute;left:.27em;top:.03em;width:.26em;height:.52em;border:solid #fff;border-width:0 .15em .15em 0;transform:rotate(45deg)}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem}
@media print{:root{--bg:#fff;--fg:#000;--muted:#555;--line:#ccc;--accent:#1d5a48;--chip:#eee;--mark:#fff0a0}body{font-size:12pt}main{max-width:none;padding:0}section.note{break-inside:auto}h1,h2{break-after:avoid}li{break-inside:avoid}}
`;

  function buildDocHtml(nodes, title) {
    const label = (text) => {
      const t = taskOf(text);
      return t
        ? `<span class="cb${t.done ? ' on' : ''}" role="img" aria-label="${t.done ? 'zrobione' : 'do zrobienia'}"></span>${inlineHtml(t.rest)}`
        : inlineHtml(text);
    };
    const list = (kids) => {
      if (!kids.length) return '';
      return '<ul>' + kids.map((n) => `<li${taskOf(n.text) ? ' class="task"' : ''}>${label(n.text)}${list(n.children)}</li>`).join('') + '</ul>';
    };
    const section = (n) => { // poziom 2 (##) + jego lista
      return `<h2>${label(n.text)}</h2>\n${list(n.children)}`;
    };
    const note = (n) => {
      const meta = [exportDate(n.created), ...(n.fav ? ['★'] : []), ...(n.archived ? ['📦 archiwum'] : [])]
        .map((s) => `<span>${escHtml(s)}</span>`)
        .concat(n.tags.map((t) => `<span class="tag">#${escHtml(t)}</span>`)).join('');
      return `<section class="note">\n<h1>${label(n.text)}</h1>\n<div class="meta">${meta}</div>\n${n.children.map(section).join('\n')}\n</section>`;
    };
    const docTitle = title ? plain(title) : 'MindNotes';
    const d = new Date();
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escHtml(docTitle)}</title>
<style>${DOC_CSS}</style>
</head>
<body>
<main>
${nodes.map(note).join('\n')}
<footer>Wyeksportowano z MindNotes · ${stamp}</footer>
</main>
</body>
</html>
`;
  }

  function exportDoc(nodes = state.roots, title = '') {
    if (!nodes.length) { toast('Nie ma jeszcze czego eksportować.'); return; }
    downloadBlob(new Blob([buildDocHtml(nodes, title)], { type: 'text/html;charset=utf-8' }),
      fileName(title, 'html').replace(/\.html$/, '-widok.html'));
    toast('Wyeksportowano ' + countNodes(nodes) + ' wpisów do sformatowanego pliku .html');
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
  function inlineHtml(text, level = 0, urls) {
    if (level === 0 && !urls) { const x = extractUrls(text); text = x.t; urls = x.urls; }
    const esc = (str) => escHtml(str).replace(URL_TOKEN_RE, (_, i) => {
      const u = urls[Number(i)];
      return `<a href="${escHtml(urlHref(u))}" target="_blank" rel="noopener noreferrer">${escHtml(u)}</a>`;
    });
    const re = new RegExp(INLINE_SRC, 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index));
      const [, mark, inner] = m;
      const c = level < 4 ? inlineHtml(inner, level + 1, urls) : esc(inner);
      out += mark === '***' ? `<strong><em>${c}</em></strong>`
        : mark === '**' ? `<strong>${c}</strong>`
        : mark === '*' ? `<em>${c}</em>`
        : mark === '==' ? `<mark>${c}</mark>`
        : `<del>${c}</del>`;
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
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
  async function exportMap(format, nodes = activeRoots(), title = '') {
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
    if (nodes === state.roots) bkMarkExternal();
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
    }, { backup: true });
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
        h('h3', {}, 'Dodawanie'),
        h('label', { class: 'hint', style: 'display:flex;align-items:center;gap:.6rem;margin:0' },
          h('input', { type: 'checkbox', checked: s.autoNest ? '' : null, style: 'width:1.3rem;height:1.3rem;accent-color:var(--accent);flex:none',
            onchange: (e) => { s.autoNest = e.target.checked; saveSettings(); } }),
          'Po dodaniu nowego tematu dodawaj kolejne wpisy pod nim (poziom wyżej: ⇤ / Shift+Tab / ✕)')),

      h('div', { class: 'section' },
        h('h3', {}, 'Drzewo'),
        h('div', { class: 'two' },
          h('button', { class: 'btn', type: 'button', onclick: () => { setCollapsedAll(state.roots, false); saveNotes(); render(); } }, 'Rozwiń wszystko'),
          h('button', { class: 'btn', type: 'button', onclick: () => { setCollapsedAll(state.roots, true); saveNotes(); render(); } }, 'Zwiń wszystko'))),

      h('div', { class: 'section' },
        h('h3', {}, 'Mapa myśli'),
        mapButtons((f) => exportMap(f)),
        h('p', { class: 'hint' }, 'Eksport całego notatnika jako mapa markmap: SVG (grafika wektorowa), PNG (obraz) albo HTML (interaktywna mapa z przybliżaniem, działa bez internetu). Pojedynczą notatkę lub gałąź wyeksportujesz w jej oknie. Mapa zawiera wszystkie gałęzie, także zwinięte, ale bez notatek z archiwum.')),

      h('div', { class: 'section' },
        h('h3', {}, 'Kopia zapasowa'),
        h('div', { class: 'two' },
          h('button', { class: 'btn', type: 'button', onclick: () => exportMd() }, icon('download'), 'Eksport .md'),
          h('button', { class: 'btn', type: 'button', onclick: () => $('#fileIn').click() }, icon('upload'), 'Import .md')),
        h('div', { class: 'two', style: 'margin-top:.5rem' },
          h('button', { class: 'btn', type: 'button', onclick: () => shareMd() }, icon('share'), 'Udostępnij…'),
          h('button', { class: 'btn', type: 'button', onclick: () => exportDoc() }, icon('download'), 'Widok .html')),
        h('p', { class: 'hint' }, 'Format .md jest zgodny z markmap.js.org (# notatka, ## podwęzeł, niżej lista; **pogrubienie**, *kursywa*, ~~przekreślenie~~). Pojedynczą notatkę z gałęziami wyeksportujesz w jej oknie. Import rozpoznaje też starszy format z myślnikami.'),
        h('p', { class: 'hint' }, '„Widok .html” to ta sama treść co w .md, ale jako sformatowana strona (nagłówki, listy, pogrubienia, zadania, tagi) — samodzielny plik, który otworzysz w przeglądarce lub wydrukujesz. To nie jest kopia zapasowa (nie da się go zaimportować).'),
        h('p', { class: 'hint' }, 'Notatki są zapisane tylko w tej przeglądarce (na tym urządzeniu). Rób eksport od czasu do czasu — wyczyszczenie danych przeglądarki je usuwa (razem z automatycznymi kopiami).')),

      bkSection(dlg),

      h('div', { class: 'section' },
        h('h3', {}, 'Wersety biblijne'),
        h('p', { class: 'hint' }, 'Wpisz w notatce @ i kilka liter księgi — nad polem pojawią się podpowiedzi (księga → rozdział → werset; na komputerze Tab przyjmuje pierwszą). Namiar możesz też wpisać w całości, np. @J 3,16 · @Ps 23,1-3 · @1 Kor 13,4-7 · @Rz 8,28.30 · @Ps 23 (cały rozdział) — po zatwierdzeniu zamieni się w tekst wersetu. Działa offline.'),
        h('p', { class: 'hint' }, 'Tekst: Uwspółcześniona Biblia Gdańska (UBG), © 2018 Fundacja Wrota Nadziei, licencja CC BY-ND 4.0 (tekst bez zmian). Źródło: ebible.org/details.php?id=polubg')),

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
            if (ans === 'del') { dlg.close(); destructive('Usunięto wszystkie notatki', () => { state.roots = []; state.targetId = null; }, { backup: true }); }
          } }, icon('trash'), 'Usuń wszystkie notatki'),
        h('p', { class: 'hint' }, `Liczba notatek: ${countNodes(state.roots)}`)),

      h('div', { class: 'section' },
        h('h3', {}, 'O aplikacji'),
        h('p', { class: 'hint' }, 'Autor projektu: ', h('a', { class: 'ext-link', href: 'mailto:krysus@gmail.com' }, 'krysus@gmail.com')))));
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

    $('#btnArchive').append(icon('archive'), h('span', { class: 'badge', hidden: true }));
    $('#btnArchive').addEventListener('click', () => setView(isArch() ? 'main' : 'archive'));
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
    // delegacja zdarzeń, bo zawartość nagłówka jest podmieniana w widoku wątku
    $('.top h1').addEventListener('click', (e) => { if (e.target.closest('#btnCollapse')) collapseAll(); });
    // widok wątku: „wstecz” w telefonie / przeglądarce wychodzi poziom wyżej; Esc robi to samo na komputerze
    try { history.replaceState({ n: 0 }, ''); } catch (e) { /* ignoruj */ }
    window.addEventListener('popstate', (e) => {
      const n = (e.state && e.state.n) || 0, f = e.state && e.state.f;
      const valid = f && locate(f) ? f : null;
      const anim = n < histN ? 'nav-back' : 'nav-fwd';
      histN = n;
      document.querySelectorAll('dialog[open]').forEach((d) => d.close());
      setFocus(valid, anim);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !state.focusId || document.querySelector('dialog[open]')) return;
      const a = document.activeElement;
      if (a && a.matches && a.matches('input, textarea, select') && a.value) return;   // najpierw Esc ma dotyczyć wpisywanego tekstu
      const fo = focusActive(); if (!fo) return;
      e.preventDefault(); navigateTo(fo.parent ? fo.parent.id : null, 1);
    });
    // zabezpieczenie: gdyby puszczenie palca nie dotarło do notatki (np. przejęcie gestu przez system), kończymy gest tutaj
    window.addEventListener('pointerup', () => { if (dragging && gestureEnd) gestureEnd(true); });
    window.addEventListener('pointercancel', () => { if (dragging && gestureEnd) gestureEnd(false); });
    window.addEventListener('blur', () => { if (dragging && gestureEnd) gestureEnd(false); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && dragging && gestureEnd) gestureEnd(false); });
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
    bkInit();
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
