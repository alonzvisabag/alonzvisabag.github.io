// ── Her places (🧳): every place she's been, on an illustrated map, with her photos pinned to each. Photos she
// picks from her phone find their own place from where they were taken; a photo from somewhere new adds that place. Saved on her phone right away and backed up through the worker
// (roni/places.json, roni/place-photos.json), the same way as the German words. Uses openView/closeView,
// tapPoint, burstConfetti and escapeHTML from the page, and shrinkImage/blobToBase64 from lib/media-prep.js.
(function () {
  const API = 'https://roni-contribute.alonzvisabag.workers.dev';
  const HOME = { id: 'home', name: 'גראץ', country: 'אוסטריה', lat: 47.0707, lon: 15.4395, emoji: '🏠', text: '' };
  const TLV = { lat: 32.0853, lon: 34.7818 };
  const PIN_COLORS = ['#ffb703', '#ff6b4a', '#4cc9f0', '#06d6a0', '#9b8cff', '#f0447f', '#ff9f1c', '#2ec4b6'];
  const SAME_PLACE_KM = 35;           // a photo this close to a place belongs to it
  const view = document.getElementById('places-view');
  const $ = (id) => document.getElementById(id);
  const esc = (s) => escapeHTML(s == null ? '' : s);
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const fmt = (n) => n.toLocaleString('he-IL');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // A list kept on her phone and backed up through the worker: changes wait in a queue until they are saved.
  function makeList(path, key, field) {
    const L = { saved: read(`roni-${path}-saved`) || [], pending: read(`roni-${path}-pending`) || [], syncing: false, loaded: false };
    const save = () => { write(`roni-${path}-saved`, L.saved); write(`roni-${path}-pending`, L.pending); };
    L.all = () => {
      let list = L.saved.slice();
      for (const op of L.pending) {
        if (op.op === 'add' && !list.some((x) => x.id === op[field].id)) list.push(op[field]);
        if (op.op === 'del') list = list.filter((x) => x.id !== op.id);
      }
      return list;
    };
    L.change = (ops) => { if (!ops.length) return; L.pending.push(...ops); save(); render(); L.sync(); };
    L.sync = async () => {
      if (L.syncing) return;
      L.syncing = true;
      const sending = L.pending.slice(0, 50);
      let ok = false;
      try {
        const res = sending.length
          ? await fetch(`${API}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: sending }) })
          : await fetch(`${API}/${path}`);
        const data = await res.json();
        if (res.ok && Array.isArray(data[key])) {
          L.saved = data[key];
          L.pending = L.pending.filter((op) => !sending.includes(op));
          save();
          ok = true;
        }
      } catch (e) {}
      // first time on this phone and the server can't be reached: start from the copy on the site
      if (!ok && !L.loaded && !L.saved.length) {
        try { const r = await fetch(`${path}.json`, { cache: 'no-store' }); L.saved = (await r.json())[key] || []; } catch (e) {}
      }
      L.loaded = true;
      L.syncing = false;
      render();
      if (ok && L.pending.length) L.sync();
    };
    return L;
  }
  const places = makeList('places', 'places', 'item');
  const photos = makeList('place-photos', 'photos', 'item');

  const allPlaces = () => places.all().sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  const photosOf = (id) => photos.all().filter((p) => p.place === id);
  const colorOf = (p) => (p.id === 'home' ? 'var(--ink)' : PIN_COLORS[allPlaces().findIndex((x) => x.id === p.id) % PIN_COLORS.length]);

  function km(a, b) {
    const R = 6371, r = Math.PI / 180;
    const h = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }

  function pinHTML(p) {
    const first = photosOf(p.id)[0];
    const bg = first ? ` photo" style="background-image:url('media/${encodeURIComponent(first.media)}')` : '';
    return `<span class="pl-bubble${bg}"><span>${esc(p.emoji || '📍')}</span></span><span class="pl-name">${esc(p.name)}</span>`;
  }

  let selected = null;

  // ── the illustrated map: fixed on the Alps, drawn from map-shapes.json
  let shapes = null;
  const COUNTRY_KEYS = { 'גרמניה': 'Germany', 'אוסטריה': 'Austria', 'איטליה': 'Italy', 'סלובניה': 'Slovenia', 'שווייץ': 'Switzerland', "צ'כיה": 'Czechia',
    'הונגריה': 'Hungary', 'קרואטיה': 'Croatia', 'סלובקיה': 'Slovakia', 'ליכטנשטיין': 'Liechtenstein', 'צרפת': 'France', 'בוסניה והרצגובינה': 'Bosnia and Herz.' };
  const PASTELS = ['#ffd9cc', '#fff0bf', '#e6e0ff', '#d8f3e6', '#ffe0ef', '#dff1ff', '#fde2c8', '#e9f5c9'];
  const LABELS = [['Germany', 'גרמניה', 190, 96], ['Austria', 'אוסטריה', 700, 250], ['Italy', 'איטליה', 190, 600], ['Slovenia', 'סלובניה', 715, 545],
    ['Switzerland', 'שווייץ', 60, 445], ['Czechia', "צ'כיה", 760, 52], ['Hungary', 'הונגריה', 935, 300], ['Croatia', 'קרואטיה', 870, 650]];
  const MOUNTAINS = [[120, 300, 1], [180, 350, .8], [330, 280, 1.1], [395, 330, .9], [600, 300, .85], [640, 345, 1], [400, 410, .8], [480, 395, 1.05],
    [560, 410, .75], [690, 430, .8], [250, 410, .9], [330, 430, .7], [150, 410, .75]];
  const countryKey = (c) => COUNTRY_KEYS[String(c || '').replace(/[׳’]/g, "'").trim()];
  const project = (p) => {
    const r = Math.PI / 180;
    return [shapes.tx + shapes.k * p.lon * r, shapes.ty - shapes.k * Math.log(Math.tan(Math.PI / 4 + p.lat * r / 2))];
  };

  async function drawArt() {
    if (!shapes) {
      try { shapes = await (await fetch('map-shapes.json')).json(); } catch (e) { return; }
    }
    const NS = 'http://www.w3.org/2000/svg';
    const svg = $('pl-svg');
    svg.setAttribute('viewBox', `0 0 ${shapes.W} ${shapes.H}`);
    svg.textContent = '';
    const el = (name, attrs, parent = svg) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
    const pat = el('pattern', { id: 'pl-waves', width: '60', height: '26', patternUnits: 'userSpaceOnUse' }, el('defs', {}));
    el('path', { d: 'M4 14 q8 -7 16 0 t16 0', fill: 'none', stroke: '#b7e3f6', 'stroke-width': '2.2', 'stroke-linecap': 'round' }, pat);
    el('rect', { width: shapes.W, height: shapes.H, fill: 'url(#pl-waves)' });

    const list = [HOME, ...allPlaces()];
    const been = [...new Set(list.map((p) => countryKey(p.country)).filter(Boolean))];
    for (const c of shapes.countries) {
      const i = been.indexOf(c.key);
      el('path', { d: c.d, class: 'pl-land' + (i < 0 ? ' other' : ''), fill: i < 0 ? '' : PASTELS[i % PASTELS.length] });
    }
    for (const [x, y, s] of MOUNTAINS) {
      const g = el('g', { transform: `translate(${x} ${y}) scale(${s})`, opacity: '.9' });
      el('path', { d: 'M-26 14 L-6 -18 L14 14 Z', fill: '#d9c4b0' }, g);
      el('path', { d: 'M-4 14 L12 -10 L28 14 Z', fill: '#c9b19b' }, g);
      el('path', { d: 'M-6 -18 L-12 -8 L-8 -10 L-5 -6 L-1 -10 L1 -8 Z', fill: '#fff' }, g);
      el('path', { d: 'M12 -10 L7 -3 L10 -4 L13 -1 L16 -4 Z', fill: '#fff' }, g);
    }
    for (const [key, text, x, y] of LABELS) el('text', { x, y, class: 'pl-clabel' + (been.includes(key) ? ' been' : '') }).textContent = text;
    el('text', { x: '560', y: '730', class: 'pl-sea' }).textContent = 'הים האדריאטי';

    const inside = ([x, y]) => x > 12 && x < shapes.W - 12 && y > 12 && y < shapes.H - 12;
    const [hx, hy] = project(HOME);
    const pins = $('pl-pins');
    pins.textContent = '';
    const outside = [];
    for (const p of list) {
      const xy = project(p);
      if (!inside(xy)) { outside.push(p); continue; }
      const [x, y] = xy;
      if (p !== HOME) {
        const mx = (hx + x) / 2, my = (hy + y) / 2 - Math.hypot(x - hx, y - hy) * 0.22;
        el('path', { d: `M${hx} ${hy} Q${mx} ${my} ${x} ${y}`, class: 'pl-route' });
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pl-pin' + (p === HOME ? ' home' : '') + (selected === p.id ? ' on' : '');
      b.style.left = (x / shapes.W * 100) + '%';
      b.style.top = (y / shapes.H * 100) + '%';
      b.style.setProperty('--c', colorOf(p));
      b.setAttribute('aria-label', `${p.name}, ${p.country}`);
      b.dataset.place = p.id;
      b.innerHTML = pinHTML(p);
      pins.appendChild(b);
    }
    const note = $('pl-outside');
    note.hidden = !outside.length;
    note.innerHTML = 'ועוד מחוץ למפה: ' + outside.map((p) => `<button type="button" data-place="${esc(p.id)}">${esc(p.emoji || '📍')} ${esc(p.name)}</button>`).join(' ');
  }
  $('pl-outside').addEventListener('click', (e) => { const b = e.target.closest('[data-place]'); if (b) select(b.dataset.place); });
  $('pl-pins').addEventListener('click', (e) => { const b = e.target.closest('[data-place]'); if (b) select(b.dataset.place); });

  // ── the card of the chosen place
  function select(id) {
    selected = id;
    const p = id === 'home' ? HOME : allPlaces().find((x) => x.id === id);
    if (!p) return;
    document.querySelectorAll('#places-view .pl-pin').forEach((b) => b.classList.toggle('on', b.dataset.place === id));
    const pics = photosOf(id);
    $('pl-place').innerHTML = `
      <div class="pl-country">${esc(p.country)}</div>
      <h3>${esc(p.emoji || '📍')} ${esc(p.name)}</h3>
      ${p === HOME ? '' : p.text ? `<p class="pl-story">${esc(p.text)}</p><button type="button" class="pl-write" data-edit>✏️ לשנות</button>`
        : '<button type="button" class="pl-write" data-edit>✏️ לכתוב כמה מילים על החוויה שם</button>'}
      ${p === HOME ? `<div class="pl-km">🇮🇱 הבית הגדול: ${fmt(km(HOME, TLV))} ק״מ מכאן</div>` : `<div class="pl-km">📍 ${fmt(km(HOME, p))} ק״מ מהבית בגראץ</div>`}
      ${pics.length ? `<div class="pl-photos">${pics.map((ph) => `<button type="button" data-photo="${esc(ph.id)}" style="background-image:url('media/${encodeURIComponent(ph.media)}')" aria-label="תמונה מ${esc(p.name)}"></button>`).join('')}</div>`
        : p === HOME ? '' : '<div class="pl-nophoto">עוד אין כאן תמונות. מעלים מהאייפון, והן יגיעו לכאן לבד.</div>'}
      ${p === HOME ? '' : '<button type="button" class="pl-remove" data-remove>להסיר את המקום מהמפה</button>'}`;
  }
  $('pl-place').addEventListener('click', (e) => {
    const ph = e.target.closest('[data-photo]');
    if (ph) return openPhoto(ph.dataset.photo);
    // her own words about the place (and its name, for places that came in with a foreign one)
    if (e.target.closest('[data-edit]')) {
      const p = allPlaces().find((x) => x.id === selected);
      if (!p) return;
      const box = e.target.closest('[data-edit]');
      box.outerHTML = `<form class="pl-edit" autocomplete="off">
        <input name="name" maxlength="40" value="${esc(p.name)}" aria-label="שם המקום">
        <textarea name="text" maxlength="200" rows="3" placeholder="מה היה שם? מה הכי זכור לך?" aria-label="כמה מילים על החוויה">${esc(p.text)}</textarea>
        <button class="btn" type="submit">לשמור</button></form>`;
      $('pl-place').querySelector('.pl-edit textarea').focus();
      const story = $('pl-place').querySelector('.pl-story');
      if (story) story.remove();
      return;
    }
    if (e.target.closest('[data-remove]')) {
      const p = allPlaces().find((x) => x.id === selected);
      if (!p || !confirm(`להסיר את ${p.name} מהמפה?`)) return;
      places.change([{ op: 'del', id: p.id }]);
      photos.change(photosOf(p.id).map((x) => ({ op: 'del', id: x.id })));
      select('home');
    }
  });

  $('pl-place').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = allPlaces().find((x) => x.id === selected);
    if (!p) return;
    const name = e.target.elements.name.value.trim() || p.name;
    const text = e.target.elements.text.value.trim();
    places.change([{ op: 'del', id: p.id }, { op: 'add', item: Object.assign({}, p, { name, text }) }]);
    select(p.id);
  });

  let viewing = null;
  function openPhoto(id) {
    const ph = photos.all().find((x) => x.id === id);
    if (!ph) return;
    viewing = ph;
    $('pl-viewer').querySelector('img').src = 'media/' + encodeURIComponent(ph.media);
    $('pl-viewer').hidden = false;
  }
  $('pl-viewer').addEventListener('click', (e) => {
    if (e.target.closest('.pl-v-del')) {
      if (!viewing || !confirm('להסיר את התמונה מהמפה?')) return;
      photos.change([{ op: 'del', id: viewing.id }]);
    }
    $('pl-viewer').hidden = true;
    viewing = null;
  });

  function render() {
    if (!view.classList.contains('show')) return;
    const list = allPlaces();
    const countries = new Set([HOME, ...list].map((p) => p.country).filter(Boolean));
    const n = photos.all().length;
    $('pl-stats').innerHTML = `<span class="pl-stat"><b>${list.length}</b> מקומות</span><span class="pl-stat"><b>${countries.size}</b> מדינות</span>` +
      (n ? `<span class="pl-stat"><b>${n}</b> תמונות</span>` : '') +
      `<span class="pl-stat">בערך <b>${fmt(Math.round(list.reduce((s, p) => s + km(HOME, p) * 2, 0) / 10) * 10)}</b> ק״מ הלוך וחזור</span>`;
    const busy = places.pending.length || photos.pending.length;
    $('pl-status').textContent = busy ? 'נשמר בטלפון. יגובה ברגע שיהיה אינטרנט' : (list.length ? '✓ הכל מגובה' : '');
    drawArt();
    if (!selected || (selected !== 'home' && !list.some((p) => p.id === selected))) selected = list.length ? list[list.length - 1].id : 'home';
    select(selected);
  }

  // ── photos from her phone: each finds its place from where it was taken
  // Reads the location and date a phone writes into a JPEG (the EXIF block near the start of the file).
  function readExif(bytes) {
    const out = { gps: null, taken: '' };
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return out;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 2;
    while (o + 4 <= bytes.length && bytes[o] === 0xFF) {
      const marker = bytes[o + 1], len = dv.getUint16(o + 2), seg = o + 4;
      if (marker === 0xDA) break;
      if (marker === 0xE1 && String.fromCharCode(...bytes.subarray(seg, seg + 4)) === 'Exif') {
        const t = seg + 6, le = bytes[t] === 0x49, end = o + 2 + len;
        const u16 = (p) => dv.getUint16(p, le), u32 = (p) => dv.getUint32(p, le);
        const ok = (p, n) => p >= t && p + n <= end && p + n <= bytes.length;
        const entries = (ifd) => {
          const map = {};
          if (!ok(ifd, 2)) return map;
          for (let i = 0, n = u16(ifd); i < n; i++) { const e = ifd + 2 + i * 12; if (ok(e, 12)) map[u16(e)] = e; }
          return map;
        };
        const rationals = (e, count) => { const v = t + u32(e + 8); const r = []; for (let i = 0; i < count; i++) if (ok(v + i * 8, 8)) r.push(u32(v + i * 8) / (u32(v + i * 8 + 4) || 1)); return r; };
        const ascii = (e) => { const n = u32(e + 4); const v = n > 4 ? t + u32(e + 8) : e + 8; return ok(v, n) ? String.fromCharCode(...bytes.subarray(v, v + n)).replace(/\0.*$/, '') : ''; };
        const ifd0 = entries(t + u32(t + 4));
        if (ifd0[0x8769]) {
          const ex = entries(t + u32(ifd0[0x8769] + 8));
          const d = ex[0x9003] ? ascii(ex[0x9003]) : '';
          const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(d);
          if (m) out.taken = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`;
        }
        if (ifd0[0x8825]) {
          const g = entries(t + u32(ifd0[0x8825] + 8));
          if (g[2] && g[4]) {
            const dms = (e) => { const [a, b, c] = rationals(e, 3); return a + (b || 0) / 60 + (c || 0) / 3600; };
            let lat = dms(g[2]), lon = dms(g[4]);
            if (g[1] && ascii(g[1]).startsWith('S')) lat = -lat;
            if (g[3] && ascii(g[3]).startsWith('W')) lon = -lon;
            if (isFinite(lat) && isFinite(lon) && (lat || lon)) out.gps = { lat, lon };
          }
        }
        return out;
      }
      o += 2 + len;
    }
    return out;
  }

  function nearestPlace(gps) {
    let best = null, bestKm = Infinity;
    for (const p of [HOME, ...allPlaces()]) { const d = km(gps, p); if (d < bestKm) { best = p; bestKm = d; } }
    return bestKm <= SAME_PLACE_KM ? best : null;
  }

  // The name of a place from where a photo was taken (OpenStreetMap; at most one question a second, as they ask).
  let lastGeo = 0;
  async function placeName(gps) {
    const gap = Date.now() - lastGeo;
    if (gap < 1100) await wait(1100 - gap);
    lastGeo = Date.now();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=he&lat=${gps.lat}&lon=${gps.lon}`);
      const a = (await r.json()).address || {};
      const name = a.city || a.town || a.village || a.municipality || a.county || a.state;
      return name ? { name, country: a.country || '' } : null;
    } catch (e) { return null; }
  }

  // ── photos that came without a location: a little game, "where was this taken?", one photo at a time.
  // Kept on her phone until she answers, so she can come back to it later.
  const TRAY_KEY = 'roni-places-tray';
  let tray = read(TRAY_KEY) || [];          // { media, taken, url }; url only during this visit (the file may not be on the site yet)
  const saveTray = () => write(TRAY_KEY, tray.map(({ media, taken }) => ({ media, taken })));
  let answered = 0;
  function renderTray() {
    const box = $('pl-tray');
    box.hidden = !tray.length;
    if (!tray.length) return;
    const t = tray[0];
    const chips = [HOME, ...allPlaces()].map((p) => `<button type="button" data-to="${esc(p.id)}">${esc(p.emoji || '📍')} ${esc(p.name)}</button>`).join('');
    box.innerHTML = `
      <div class="pl-game-top"><b>איפה צילמת את זה? 🤔</b><span>${answered + 1} מתוך ${answered + tray.length}</span></div>
      <img class="pl-game-img" src="${esc(t.url || 'media/' + encodeURIComponent(t.media))}" alt="">
      <div class="pl-game-chips">${chips}</div>
      <form class="pl-game-new" autocomplete="off"><input maxlength="60" placeholder="מקום אחר? כותבים את השם" aria-label="מקום אחר"><button class="btn" type="submit">זה פה</button></form>
      <p class="pl-game-msg" aria-live="polite"></p>
      ${tray.length > 1 ? '<button type="button" class="pl-game-skip" data-skip>לא זוכרת, לתמונה הבאה</button>' : ''}`;
  }
  function assign(placeId, from) {
    const t = tray.shift();
    photos.change([{ op: 'add', item: { id: newId(), place: placeId, media: t.media, takenAt: t.taken } }]);
    if (t.url) URL.revokeObjectURL(t.url);
    answered++;
    saveTray();
    selected = placeId;
    const r = from && from.getBoundingClientRect();
    burstConfetti(r ? r.left + r.width / 2 : innerWidth / 2, r ? r.top + r.height / 2 : innerHeight / 2);
    if (!tray.length) { answered = 0; $('pl-progress').textContent = 'כל התמונות מצאו את המקום שלהן 🎉'; }
    renderTray();
    render();
  }
  $('pl-tray').addEventListener('click', (e) => {
    const b = e.target.closest('[data-to]');
    if (b) return assign(b.dataset.to, b);
    if (e.target.closest('[data-skip]')) { tray.push(tray.shift()); saveTray(); renderTray(); }
  });
  $('pl-tray').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const msg = $('pl-tray').querySelector('.pl-game-msg');
    if (!input.value.trim()) return;
    msg.textContent = 'מחפשת את המקום…';
    const found = await placeByName(input.value);
    if (!found) { msg.textContent = 'לא מצאתי מקום כזה. אולי לנסות לכתוב באנגלית?'; return; }
    assign(found.id, e.target.querySelector('.btn'));
  });

  let uploading = false;
  $('pl-files').addEventListener('change', async (e) => {
    const files = [...e.target.files].slice(0, 40);
    e.target.value = '';
    if (!files.length || uploading) return;
    uploading = true;
    const progress = $('pl-progress');
    const counts = {}, fresh = [];
    let failed = 0, last = null;
    for (let i = 0; i < files.length; i++) {
      progress.textContent = `מעלה תמונה ${i + 1} מתוך ${files.length}…`;
      let meta = { gps: null, taken: '' };
      try { meta = readExif(new Uint8Array(await files[i].slice(0, 192 * 1024).arrayBuffer())); } catch (err) {}
      const small = typeof shrinkImage === 'function' ? await shrinkImage(files[i], true, 1600, 0.82) : null;
      if (!small) { failed++; continue; }
      let place = meta.gps ? nearestPlace(meta.gps) : null;
      if (meta.gps && !place) {
        const found = await placeName(meta.gps);
        if (found) {
          place = { id: newId(), name: found.name, country: found.country, lat: +meta.gps.lat.toFixed(4), lon: +meta.gps.lon.toFixed(4), emoji: '📍', text: '', at: new Date().toISOString() };
          places.change([{ op: 'add', item: place }]);
          fresh.push(place.name);
        }
      }
      let data = {};
      try {
        const res = await fetch(`${API}/place-photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaBase64: await blobToBase64(small) }) });
        data = await res.json();
      } catch (err) {}
      if (!data.ok) { failed++; continue; }
      if (place) {
        photos.change([{ op: 'add', item: { id: newId(), place: place.id, media: data.media, takenAt: meta.taken } }]);
        counts[place.name] = (counts[place.name] || 0) + 1;
        last = place.id;
      } else {
        tray.push({ media: data.media, taken: meta.taken, url: URL.createObjectURL(small) });
        saveTray();
      }
    }
    const placed = Object.entries(counts).map(([name, n]) => `${n} ל${name}`).join(', ');
    progress.textContent = [
      placed ? `נכנסו: ${placed} ✓` : '',
      fresh.length ? `מקום חדש במפה: ${fresh.join(', ')} 🎉` : '',
      failed ? `${failed === 1 ? 'תמונה אחת לא עלתה' : `${failed} תמונות לא עלו`}. אפשר לנסות שוב.` : '',
    ].filter(Boolean).join(' · ');
    if (last) selected = last;
    if (placed || fresh.length) burstConfetti(window.innerWidth / 2, window.innerHeight / 3);
    uploading = false;
    renderTray();
    render();
  });

  // ── a new place by its name
  // A place by its name: one already on the map if it's the same place, otherwise a new one (OpenStreetMap search).
  async function placeByName(text) {
    const name = text.trim().slice(0, 40);
    let hit = null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=he&q=${encodeURIComponent(name)}`);
      hit = (await r.json())[0];
    } catch (err) {}
    if (!hit) return null;
    const lat = +(+hit.lat).toFixed(4), lon = +(+hit.lon).toFixed(4);
    const near = nearestPlace({ lat, lon });
    if (near && km({ lat, lon }, near) < 5) return Object.assign({ existed: true }, near);
    const place = { id: newId(), name, country: (hit.address && hit.address.country) || '', lat, lon, emoji: '📍', text: '', at: new Date().toISOString() };
    places.change([{ op: 'add', item: place }]);
    return place;
  }
  $('pl-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('pl-add-name');
    const msg = $('pl-add-msg');
    if (!input.value.trim()) return;
    msg.textContent = 'מחפשת את המקום…';
    const place = await placeByName(input.value);
    if (!place) { msg.textContent = 'לא מצאתי מקום כזה. אולי לנסות לכתוב באנגלית?'; return; }
    input.value = '';
    msg.textContent = place.existed ? `${place.name} כבר במפה 🙂` : `${place.name} נוסף למפה! 🎉`;
    select(place.id);
    if (!place.existed) render();
  });

  // ── opening and closing
  function openPlaces(pt, done) {
    $('pl-progress').textContent = '';
    $('pl-add-msg').textContent = '';
    openView(view, pt, done);
    render();
    renderTray();
    places.sync();
    photos.sync();
  }
  $('places-open-btn').addEventListener('click', (e) => openPlaces(tapPoint(e)));
  $('places-back-btn').addEventListener('click', () => closeView(view));

  // ── the launch of the map
  // shown every time she comes in, until the end of Wednesday 4 November (Austria time)
  const LAUNCH_UNTIL = Date.parse('2026-11-05T00:00:00+01:00');
  window.placesLaunch = function () {
    if (Date.now() >= LAUNCH_UNTIL || document.getElementById('pl-launch')) return;
    const box = document.createElement('div');
    box.id = 'pl-launch';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `<div class="pl-l-card">
      <div class="pl-l-big"><span>קולולולו!!!</span></div>
      <h2>נולד פיצ'ר חדש באתר!</h2>
      <p><b>המקומות שלי 🧳</b><br>מפה של כל המקומות שהיית בהם מאז שעברת לגראץ. מעלים תמונות מהאייפון, והן מוצאות לבד את המקום שבו צולמו.</p>
      <button type="button" class="btn" data-go>יאללה, למפה!</button>
      <button type="button" class="pl-l-later">אחר כך</button>
    </div>`;
    document.body.appendChild(box);
    for (let i = 0; i < 4; i++) setTimeout(() => burstConfetti(window.innerWidth / 2 + (Math.random() - .5) * 220, window.innerHeight / 2 - 120 + (Math.random() - .5) * 80), 150 + i * 200);
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-go]')) { box.remove(); openPlaces(tapPoint(e)); }
      else if (e.target.closest('.pl-l-later') || e.target === box) box.remove();
    });
    box.querySelector('[data-go]').focus({ preventScroll: true });
  };
})();
