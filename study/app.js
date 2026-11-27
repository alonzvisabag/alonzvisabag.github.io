/* לומדים: משחקי לימוד. כל קורס מגיע מקובץ ב־courses/, וכל המשחקים מושכים מאותו מאגר.
   העיקר: תרגול יומי בשליפה מהזיכרון, עם חזרה מרווחת, ערבוב נושאים, הערכת ביטחון ומשוב לכל תשובה. */
(() => {
  const app = document.getElementById('app');
  const COURSES = window.COURSES || [];
  /* extra question files add to a course's topics by id */
  (window.COURSE_ADDS || []).forEach(add => {
    const c = COURSES.find(x => x.id === add.course); if (!c) return;
    Object.entries(add.topics).forEach(([id, parts]) => {
      const t = c.topics.find(x => x.id === id); if (!t) return;
      Object.entries(parts).forEach(([k, arr]) => { t[k] = (t[k] || []).concat(arr); });
    });
  });
  const DIFF = ['מעורב', 'קל', 'בינוני', 'קשה'];
  const BOX_DAYS = [0, 1, 3, 7, 16, 35];
  const DAY = 864e5;
  const DAILY = 25;          // about 20 minutes
  const TUTOR_AFTER = 3;     // mistakes on one principle before the tutor steps in
  const TYPE = { mcq: 'אמריקאית', case: 'מקרה מטופל', distinct: 'הבחנה בין מושגים', tf: 'נכון / לא נכון', open: 'שאלה פתוחה' };
  const CONF = ['מנחש', 'די בטוח', 'בטוח'];

  /* ── storage: per browser; the page still works without it ── */
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let C = COURSES.find(c => c.id === get('study-course', '')) || COURSES[0];
  let S;
  /* srs: box + due per question; st: right/wrong/last/confident-wrong; pw: mistakes per principle since the last tutor note */
  function loadState() { S = Object.assign({ topics: null, diff: 0, cards: {}, srs: {}, st: {}, pw: {}, best: {} }, get('study-' + C.id, {})); }
  const save = () => put('study-' + C.id, S);
  if (!C) { app.innerHTML = '<p>אין עדיין קורסים.</p>'; return; }
  loadState();

  /* ── helpers ── */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let ONLY = null; // practise one topic (from the topic list or a brief) without changing the saved choice
  const topicsOn = () => C.topics.filter(t => ONLY ? t.id === ONLY : !S.topics || S.topics.includes(t.id));
  const dots = d => '●'.repeat(d) + '○'.repeat(3 - d);
  const view = html => { app.innerHTML = html; window.scrollTo(0, 0); };
  const top = (label, right = '') => `<div class="bar-top"><button class="back" data-home>→ ${esc(label)}</button><span class="counter">${right}</span></div>`;
  const on = (sel, fn) => app.querySelectorAll(sel).forEach(el => el.addEventListener('click', fn));
  const homeBtn = () => on('[data-home]', home);
  const srcLine = (t, src) => src
    ? `<div class="src">📍 מקור: ${esc(t.deck || t.name)} · ${esc(src)}</div>`
    : `<div class="src muted">📍 מקור: עוד לא תויג. הנושא הזה ייכתב מחדש עם מספרי שקפים.</div>`;

  /* ── one shape for every question, new format (qs) and the older arrays alike ── */
  function questions(topics = topicsOn()) {
    const out = [];
    topics.forEach(t => {
      (t.qs || []).forEach(x => {
        const base = { t, key: `${t.id}:${x.id}`, type: x.type, d: x.d || 2, src: x.src, p: x.p, why: x.why };
        if (x.type === 'tf') out.push({ ...base, q: x.s, v: x.v });
        else if (x.type === 'open') out.push({ ...base, q: x.q, ans: x.ans, kws: x.kws || [] });
        else out.push({ ...base, q: x.q, opts: x.a.map(([txt, why], k) => ({ txt, why, ok: k === 0 })) });
      });
      (t.mcq || []).forEach((x, i) => out.push({ t, key: `${t.id}:mcq:${i}`, type: 'mcq', d: x[0], q: x[1], why: x[6], p: t.id,
        opts: x.slice(2, 6).map((txt, k) => ({ txt, ok: k === 0 })) }));
      (t.tf || []).forEach((x, i) => out.push({ t, key: `${t.id}:tf:${i}`, type: 'tf', d: 1, q: x[1], v: x[0], why: x[2], p: t.id }));
      (t.open || []).forEach((x, i) => out.push({ t, key: `${t.id}:open:${i}`, type: 'open', d: x[0], q: x[1], ans: x[2], kws: x[3], p: t.id }));
    });
    return out;
  }
  const isChoice = q => q.type === 'mcq' || q.type === 'case' || q.type === 'distinct';
  const byDiff = items => { if (!S.diff) return items; const f = items.filter(q => q.d === S.diff); return f.length >= 4 ? f : items; };
  const isDue = q => S.srs[q.key] && S.srs[q.key].due <= Date.now();
  const isNew = q => !S.srs[q.key];
  /* questions that came back wrong, worst (and confident mistakes) first */
  const weakness = q => { const s = S.st[q.key]; if (!s) return 0; return (s.last === 0 ? 2 : 0) + s.w / (s.r + s.w) * 2 + (s.cw || 0) * 1.5; };

  /* mix topics so the same one rarely comes twice in a row */
  function interleave(list) {
    const groups = {};
    list.forEach(q => (groups[q.t.id] = groups[q.t.id] || []).push(q));
    const out = []; let last = null;
    while (out.length < list.length) {
      const ids = Object.keys(groups).filter(id => groups[id].length).sort((a, b) => groups[b].length - groups[a].length);
      const id = ids.find(x => x !== last) || ids[0];
      out.push(groups[id].shift()); last = id;
    }
    return out;
  }

  /* record an answer: spaced repetition, stats, and the tutor's mistake counter */
  function record(q, ok, conf) {
    const st = S.st[q.key] = S.st[q.key] || { r: 0, w: 0 };
    ok ? st.r++ : st.w++; st.last = ok ? 1 : 0;
    if (!ok && conf === 2) st.cw = (st.cw || 0) + 1;
    const r = S.srs[q.key] || { box: 0 };
    if (!ok) { r.box = 0; r.due = Date.now(); }
    else if (conf === 0) { r.box = Math.max(r.box, 1); r.due = Date.now() + DAY; }  // a lucky guess comes back tomorrow
    else { r.box = Math.min(r.box + 1, BOX_DAYS.length - 1); r.due = Date.now() + BOX_DAYS[r.box] * DAY; }
    S.srs[q.key] = r;
    let tutor = false;
    if (q.p) {
      if (ok) S.pw[q.p] = Math.max(0, (S.pw[q.p] || 0) - 1);
      else { S.pw[q.p] = (S.pw[q.p] || 0) + 1; if (S.pw[q.p] >= TUTOR_AFTER) { S.pw[q.p] = 0; tutor = true; } }
    }
    save();
    return tutor;
  }

  /* ── home ── */
  const MORE = [
    ['cards', '🃏', 'כרטיסיות', 'מושג והגדרה, עם חזרה מרווחת'],
    ['quiz', '📝', 'מבחן אמריקאי', 'רק שאלות אמריקאיות, לפי רמת הקושי'],
    ['open', '✍️', 'שאלות פתוחות', '"למה" ו"איך", ומשווים לתשובה'],
    ['chains', '⛓️', 'אזור ↔ תפקוד ↔ תסמונת', 'מחברים שלישיות מטבלת הסיכום'],
    ['million', '💰', 'מי רוצה להיות מיליונר', '12 שאלות שהולכות ומתקשות'],
    ['tf', '⚡', 'נכון או לא נכון', '60 שניות. כמה תספיק?'],
    ['match', '🔗', 'התאמה', 'מחברים מושג לבן הזוג שלו'],
    ['memory', '🧠', 'משחק זיכרון', 'הופכים קלפים ומוצאים זוגות'],
    ['order', '🔢', 'סדר נכון', 'שלבים ותהליכים, לפי הסדר'],
  ];
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; }

  function topicStats(t) {
    const qs = questions([t]);
    let r = 0, w = 0, cw = 0, mastered = 0;
    qs.forEach(q => { const s = S.st[q.key]; if (s) { r += s.r; w += s.w; cw += s.cw || 0; } if (S.srs[q.key] && S.srs[q.key].box >= 3) mastered++; });
    return { total: qs.length, r, w, n: r + w, pct: r + w ? Math.round(100 * r / (r + w)) : null, cw, mastered };
  }
  const level = s => s.n < 8 ? ['', 'עוד מעט נתונים'] : s.pct < 60 ? ['bad', 'חלש'] : s.pct < 80 ? ['mid', 'בינוני'] : ['good', 'חזק'];

  function home() {
    ONLY = null;
    const all = C.topics, sel = S.topics;
    const qsAll = questions(all);
    const dueN = qsAll.filter(isDue).length, newN = qsAll.filter(isNew).length;
    const stats = all.map(t => ({ t, s: topicStats(t) }));
    const judged = stats.filter(x => x.s.n >= 8).sort((a, b) => a.s.pct - b.s.pct);
    const weakest = judged[0];
    const cwTotal = stats.reduce((n, x) => n + x.s.cw, 0);
    const showInstall = !standalone() && !get('study-install-hide', false);
    const articles = all.filter(t => t.article);
    view(`
      <header class="hero">
        <div class="eyebrow">לומדים</div>
        <h1>${COURSES.length > 1 ? `<button data-course>${esc(C.name)} ▾</button>` : esc(C.name)}</h1>
        <p>${qsAll.length} שאלות · ${all.reduce((n, t) => n + (t.cards || []).length, 0)} כרטיסיות</p>
      </header>
      ${showInstall ? `<div class="install"><span class="ii">📲</span><div style="flex:1"><b>שומרים כאפליקציה במסך הבית</b>
        <p>${isIOS() ? 'בספארי: לוחצים על כפתור השיתוף <b>⬆︎</b> למטה, ואז על <b>"הוספה למסך הבית"</b>.' : 'בתפריט הדפדפן: <b>"הוספה למסך הבית"</b> או <b>"התקנת אפליקציה"</b>.'}</p></div>
        <button data-hide-install aria-label="סגירה">✕</button></div>` : ''}

      <button class="daily" data-mode="daily">
        <span class="d-ic">☀️</span>
        <span class="d-txt"><b>תרגול יומי</b><span>${dueN ? `${dueN} שאלות לחזרה היום, ` : ''}${Math.min(newN, DAILY)} חדשות · בערך 20 דקות, כל הנושאים מעורבבים</span></span>
        <span class="d-go">←</span>
      </button>
      <div class="modes">
        <button class="mode" data-mode="topic"><span>🎯</span><b>לפי נושא</b></button>
        <button class="mode" data-mode="weak"><span>🩹</span><b>נקודות חולשה</b>${cwTotal ? `<small>${cwTotal} טעויות בביטחון</small>` : ''}</button>
        <button class="mode" data-mode="exam"><span>⏱️</span><b>מבחן מדומה</b></button>
      </div>

      <section class="sec">
        <div class="sec-h"><h2>איפה אני עומד</h2>${Object.keys(S.st).length || Object.keys(S.cards).length ? '<button data-reset>איפוס</button>' : ''}</div>
        ${weakest && weakest.s.pct < 70 ? `<div class="straight">הנושא הכי חלש שלך כרגע: <b>${esc(weakest.t.name)}</b>, ${weakest.s.pct}% הצלחה. זה נמוך, ושווה לתרגל אותו ב"נקודות חולשה" או "לפי נושא".</div>` : ''}
        <div class="prog">${stats.map(({ t, s }) => { const [cls, word] = level(s); return `
          <div class="prog-row"><div class="pl">${t.icon} ${esc(t.name)}<span>${s.pct === null ? 'עוד לא תרגלת' : `${s.pct}% הצלחה`}${word && s.n ? ` · <em class="lv ${cls}">${word}</em>` : ''}</span></div>
          <div class="bar"><i class="${cls}" style="width:${s.pct || 0}%"></i></div>
          <div class="pm">שולט ב־${s.mastered} מתוך ${s.total} שאלות${s.cw ? ` · ${s.cw} טעויות שהיית בטוח בהן` : ''}</div></div>`; }).join('')}</div>
      </section>

      <section class="sec">
        <div class="sec-h"><h2>מאמרים</h2></div>
        <div class="list">
          ${articles.map(t => `<button class="row" data-brief="${t.id}"><span class="ri">${t.icon}</span><div><b>${esc(t.name)}</b><small>${esc(t.brief.oneLine)}</small></div><span class="tag ${t.brief.required ? 'req' : ''}">${t.brief.required ? 'חובה למבחן' : 'לא ברשימת החובה'}</span></button>`).join('')}
          ${(C.missing || []).map(m => `<div class="row dim"><span class="ri">📄</span><div><b>${esc(m)}</b><small>מאמר חובה שעוד לא נוסף. שלח אותו ואכין בריף ושאלות.</small></div></div>`).join('')}
        </div>
      </section>

      <section class="sec">
        <div class="sec-h"><h2>עוד משחקים</h2></div>
        <div class="chips">${all.map(t => `<button class="chip" data-topic="${t.id}" aria-pressed="${!sel || sel.includes(t.id)}">${t.icon} ${esc(t.name)}</button>`).join('')}</div>
        <div class="seg" style="margin-top:10px">${DIFF.map((d, i) => `<button data-diff="${i}" aria-pressed="${S.diff === i}">${d}</button>`).join('')}</div>
        <div class="games" style="margin-top:12px">${MORE.map(([id, ic, name, d]) => `<button class="game" data-game="${id}"><span class="gi">${ic}</span><b>${name}</b><span>${d}</span></button>`).join('')}</div>
        <p class="muted small">הנושאים ורמת הקושי כאן חלים על המשחקים שבאזור הזה בלבד.</p>
      </section>

      ${(C.gaps || []).length ? `<section class="sec"><details class="gaps"><summary>פערים בחומר (${C.gaps.length})</summary>
        ${C.gaps.map(([h, p]) => `<div class="gap"><b>${esc(h)}</b><p>${esc(p)}</p></div>`).join('')}
        ${(C.held || []).length ? `<div class="gap"><b>⏸️ שאלות בהמתנה (${C.held.length})</b>${C.held.map(([q, why]) => `<p>• ${esc(q)}<br><span class="small">הסיבה: ${esc(why)}</span></p>`).join('')}</div>` : ''}</details></section>` : ''}
      <p class="muted small" style="text-align:center;margin-top:26px">ההתקדמות נשמרת בדפדפן הזה בלבד.</p>
    `);
    on('[data-mode]', e => MODE[e.currentTarget.dataset.mode]());
    on('[data-topic]', e => {
      const id = e.currentTarget.dataset.topic;
      let s = S.topics ? S.topics.slice() : all.map(t => t.id);
      s = s.includes(id) ? s.filter(x => x !== id) : [...s, id];
      S.topics = !s.length || s.length === all.length ? null : s; save(); home();
    });
    on('[data-diff]', e => { S.diff = +e.currentTarget.dataset.diff; save(); home(); });
    on('[data-game]', e => GAME[e.currentTarget.dataset.game]());
    on('[data-brief]', e => brief(e.currentTarget.dataset.brief));
    on('[data-hide-install]', () => { put('study-install-hide', true); home(); });
    on('[data-course]', () => { const i = (COURSES.indexOf(C) + 1) % COURSES.length; C = COURSES[i]; put('study-course', C.id); loadState(); home(); });
    on('[data-reset]', e => {
      const b = e.currentTarget;
      if (b.dataset.sure) { S.st = {}; S.srs = {}; S.pw = {}; S.cards = {}; S.best = {}; save(); home(); } else { b.dataset.sure = 1; b.textContent = 'בטוח? לחיצה נוספת מוחקת הכול'; }
    });
  }

  function emptyState(msg) {
    view(`${top('בית')}<div class="panel empty"><div class="ei">🤷</div><p>${msg}</p><button class="btn" data-home>חזרה</button></div>`);
    homeBtn();
  }

  /* ── the modes ── */
  function daily() {
    const all = questions(C.topics);
    const due = all.filter(isDue).sort((a, b) => weakness(b) - weakness(a) || S.srs[a.key].due - S.srs[b.key].due).slice(0, 18);
    const fresh = shuffle(all.filter(isNew)).slice(0, DAILY - due.length);
    let list = [...due, ...fresh];
    if (!list.length) {
      const next = Math.min(...all.map(q => (S.srs[q.key] || {}).due || Infinity));
      const h = Math.max(1, Math.round((next - Date.now()) / 36e5));
      return view(`${top('בית')}<div class="panel empty"><div class="ei">🎉</div><h2>אין היום מה לחזור עליו</h2>
        <p class="muted">עברת על כל השאלות, והחזרה הבאה בעוד ${h < 24 ? h + ' שעות' : Math.round(h / 24) + ' ימים'}. אפשר לעשות מבחן מדומה או לתרגל נקודות חולשה.</p>
        <button class="btn" data-home>חזרה</button></div>`), homeBtn();
    }
    session(interleave(shuffle(list)), { title: 'תרגול יומי' });
  }
  function byTopic() {
    view(`${top('בית')}<div class="title">תרגול לפי נושא</div><p class="muted">קודם מה שמגיע לחזרה, אחר כך שאלות חדשות.</p>
      <div class="list">${C.topics.map(t => { const s = topicStats(t); return `<button class="row" data-t="${t.id}"><span class="ri">${t.icon}</span><div><b>${esc(t.name)}</b><small>${t.label} · ${s.total} שאלות${s.pct !== null ? ` · ${s.pct}% הצלחה` : ''}</small></div></button>`; }).join('')}</div>`);
    homeBtn();
    on('[data-t]', e => {
      const id = e.currentTarget.dataset.t, qs = questions(C.topics.filter(t => t.id === id));
      const list = [...shuffle(qs.filter(isDue)), ...shuffle(qs.filter(isNew)), ...shuffle(qs.filter(q => !isDue(q) && !isNew(q)))].slice(0, 20);
      session(list, { title: C.topics.find(t => t.id === id).name });
    });
  }
  function weak() {
    const list = questions(C.topics).filter(q => weakness(q) > 0.6).sort((a, b) => weakness(b) - weakness(a)).slice(0, 20);
    if (!list.length) return emptyState('אין עדיין נקודות חולשה. קודם תתרגל קצת בתרגול היומי, ואז יופיעו כאן השאלות שטעית בהן.');
    session(list, { title: 'נקודות חולשה' });
  }
  function examSetup() {
    const items = questions(C.topics).filter(isChoice);
    const counts = [20, 30].filter(n => n <= items.length);
    view(`${top('בית')}<div class="title">מבחן מדומה</div>
      <p class="muted">שאלות אמריקאיות מכל הנושאים, עם זמן מוגבל (דקה וחצי לשאלה). אין משוב באמצע. בסוף: ציון, פירוט לפי נושא, והסבר לכל טעות.</p>
      <div class="choice-h">כמה שאלות?</div>
      <div class="pickers">${counts.map(n => `<button class="chip" data-n="${n}">${n} · ${Math.round(n * 1.5)} דק׳</button>`).join('')}<button class="chip" data-n="${items.length}">כולן (${items.length}) · ${Math.round(items.length * 1.5)} דק׳</button></div>`);
    homeBtn();
    on('[data-n]', e => { const n = +e.currentTarget.dataset.n; session(interleave(shuffle(items).slice(0, n)), { title: 'מבחן מדומה', exam: true, seconds: Math.round(n * 90) }); });
  }
  const MODE = { daily, topic: byTopic, weak, exam: examSetup };

  /* ── a practice session: question first, confidence, then the full explanation ── */
  function session(list, opt) {
    const queue = list.slice(), log = [], retried = new Set();
    const total = () => log.length + queue.length;
    let timer = null, left = opt.seconds || 0, ended = false;
    const end = () => { if (ended) return; ended = true; clearInterval(timer); sessionEnd(log, queue, opt); };
    if (opt.exam) timer = setInterval(() => {
      left--; const el = document.getElementById('clock'); if (el) el.textContent = clock(left);
      if (left <= 0) end();
    }, 1000);
    const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    const next = () => {
      if (ended) return;
      if (!queue.length) return end();
      const q = queue[0];
      view(`<div class="bar-top"><button class="back" data-quit>→ יציאה</button><span class="counter">${opt.exam ? `⏱️ <span id="clock">${clock(left)}</span> · ` : ''}${log.length + 1} / ${total()}</span></div>
        <div class="sbar"><i style="width:${100 * log.length / total()}%"></i></div>
        <div class="panel">
          <div class="meta"><span class="tag">${q.t.icon} ${esc(q.t.name)}</span><span class="tag ty">${TYPE[q.type]}</span><span class="dots" title="קושי">${dots(q.d)}</span>${q.again ? '<span class="tag again">שוב, על אותו עיקרון</span>' : ''}</div>
          <div class="q">${esc(q.q)}</div>
          <div class="body"></div>
          <div class="conf" hidden><div class="choice-h">כמה אתה בטוח?</div><div class="confs">${CONF.map((c, i) => `<button data-c="${i}">${c}</button>`).join('')}</div></div>
          <div class="after"></div>
        </div>`);
      app.querySelector('[data-quit]').addEventListener('click', () => { clearInterval(timer); ended = true; log.length ? sessionEnd(log, [], opt) : home(); });
      const body = app.querySelector('.body'), conf = app.querySelector('.conf'), after = app.querySelector('.after');
      let answer = null;
      const askConf = () => { conf.hidden = false; conf.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };

      if (isChoice(q)) {
        const opts = q.shown = q.shown || shuffle(q.opts);
        body.innerHTML = `<div class="opts">${opts.map((o, k) => `<button class="opt" data-o="${k}">${esc(o.txt)}</button>`).join('')}</div>`;
        on('[data-o]', e => {
          app.querySelectorAll('.opt').forEach(b => b.classList.remove('sel'));
          e.currentTarget.classList.add('sel'); answer = +e.currentTarget.dataset.o;
          if (opt.exam) { const ok = opts[answer].ok; log.push({ q, ok, chose: opts[answer], conf: null }); queue.shift(); record(q, ok, 1); setTimeout(next, 220); return; }
          askConf();
        });
      } else if (q.type === 'tf') {
        body.innerHTML = `<div class="btns"><button class="btn ghost tfb" data-v="1">✓ נכון</button><button class="btn ghost tfb" data-v="0">✗ לא נכון</button></div>
          <textarea id="reason" placeholder="למה? כתוב נימוק קצר במילים שלך" hidden></textarea>`;
        on('[data-v]', e => { app.querySelectorAll('.tfb').forEach(b => b.classList.remove('pick')); e.currentTarget.classList.add('pick'); answer = e.currentTarget.dataset.v === '1'; app.querySelector('#reason').hidden = false; askConf(); });
      } else {
        body.innerHTML = `<textarea id="ans" placeholder="כתוב תשובה קצרה, כמו במבחן…"></textarea><button class="btn ghost" data-done>סיימתי לכתוב</button>`;
        on('[data-done]', e => { answer = app.querySelector('#ans').value; e.currentTarget.remove(); askConf(); });
      }

      on('[data-c]', e => {
        const c = +e.currentTarget.dataset.c;
        conf.innerHTML = `<div class="conf-said">סימנת: <b>${CONF[c]}</b></div>`;
        if (q.type === 'open') return revealOpen(q, answer, c);
        const ok = isChoice(q) ? q.shown[answer].ok : answer === q.v;
        reveal(q, ok, c);
      });

      function reveal(q, ok, c) {
        if (isChoice(q)) {
          app.querySelectorAll('.opt').forEach((b, j) => {
            const o = q.shown[j]; b.disabled = true;
            b.classList.add(o.ok ? 'ok' : j === answer ? 'no' : 'dim');
            if (o.why) b.insertAdjacentHTML('beforeend', `<small class="ow">${esc(o.why)}</small>`);
          });
        } else {
          app.querySelectorAll('.tfb').forEach(b => { b.disabled = true; if ((b.dataset.v === '1') === q.v) b.classList.add('right'); });
          const r = app.querySelector('#reason'); r.readOnly = true;
        }
        finish(q, ok, c, q.why || '',
          q.type === 'tf' && app.querySelector('#reason').value.trim() ? `<div class="mine"><b>הנימוק שלך:</b> ${esc(app.querySelector('#reason').value)}</div>` : '');
      }
      function revealOpen(q, text, c) {
        /* a keyword counts if every word of it shows up, allowing for Hebrew endings (הולכה / הולכת) */
        const norm = s => s.replace(/[\u05BE-]/g, ' ').replace(/[\u0591-\u05C7]/g, '').toLowerCase().replace(/[ךםןףץ]/g, c => 'כמנפצ'['ךםןףץ'.indexOf(c)]);
        const mine = norm(text || '');
        const has = kw => norm(kw).split(/\s+/).filter(Boolean).every(w => mine.includes(w.length >= 4 ? w.slice(0, -1) : w));
        app.querySelector('#ans').readOnly = true;
        after.innerHTML = `${mine.trim() ? `<div class="kw-h">מילות מפתח שמופיעות בתשובה הטובה (✓ = כתבת אותה, ✗ = חסרה אצלך):</div><div class="kw">${q.kws.map(k => `<span class="${has(k) ? 'hit' : 'miss'}">${has(k) ? '✓' : '✗'} ${esc(k)}</span>`).join('')}</div>` : ''}
          <div class="why"><b>תשובה טובה:</b>${esc(q.ans)}</div>${srcLine(q.t, q.src)}
          <div class="choice-h">בהשוואה לתשובה, איך היה?</div>
          <div class="btns three"><button class="btn bad" data-g="0">לא ידעתי</button><button class="btn mid" data-g="1">חלקית</button><button class="btn good" data-g="2">ידעתי</button></div>`;
        on('[data-g]', e => { const g = +e.currentTarget.dataset.g; after.innerHTML = ''; finish(q, g === 2, c, '', '', true); });
      }
      function finish(q, ok, c, why, extra, quiet) {
        const tutor = record(q, ok, c);
        log.push({ q, ok, conf: c, chose: isChoice(q) ? q.shown[answer] : null });
        queue.shift();
        /* a wrong answer comes back once, later in the same session */
        if (!ok && !retried.has(q.key) && queue.length >= 2) { retried.add(q.key); queue.splice(Math.min(4, queue.length), 0, q); }
        let html = '';
        if (!quiet) html += `<div class="verdict ${ok ? 'good' : 'bad'}">${ok ? '✓ נכון' : '✗ לא נכון'}</div>`;
        if (!ok && c === 2) html += `<div class="alarm">⚠️ <b>היית בטוח, וטעית.</b> זה המקום הכי מסוכן לפני מבחן: טעות שלא מרגישים בה. השאלה תחזור אליך בקרוב.</div>`;
        if (ok && c === 0) html += `<div class="note">צדקת, אבל ניחשת. השאלה תחזור מחר.</div>`;
        if (extra) html += extra;
        if (why) html += `<div class="why">${esc(why)}</div>`;
        if (!quiet) html += srcLine(q.t, q.src);
        if (tutor) {
          const pr = q.t.principles && q.t.principles[q.p];
          if (pr) {
            html += `<div class="tutor"><div class="tu-h">🧑‍🏫 עצירה קטנה: ${esc(pr.title)}</div><p>טעית כאן ${TUTOR_AFTER} פעמים. הנה העיקרון בפשטות:</p><p>${esc(pr.explain)}</p><p><b>דוגמה:</b> ${esc(pr.example)}</p><div class="src">📍 ${esc(q.t.deck || q.t.name)} · ${esc(pr.src)}</div></div>`;
            const more = questions([q.t]).filter(x => x.p === q.p && x.key !== q.key && !queue.slice(0, 1).includes(x));
            const pick = shuffle(more).sort((a, b) => (isNew(b) ? 1 : 0) - (isNew(a) ? 1 : 0))[0];
            if (pick) { queue.unshift({ ...pick, again: true, shown: null }); html += `<p class="muted small">השאלה הבאה בודקת את אותו עיקרון.</p>`; }
          }
        }
        html += `<button class="btn" data-next>${queue.length ? 'הבאה' : 'לסיכום'}</button>`;
        after.insertAdjacentHTML('beforeend', html);
        on('[data-next]', next);
      }
    };
    next();
  }

  function sessionEnd(log, rest, opt) {
    /* in an exam, what was left unanswered when the time ran out counts as wrong */
    const unanswered = opt.exam ? rest.length : 0;
    const counted = log.filter((l, i) => log.findIndex(x => x.q.key === l.q.key) === i); // first try only
    const right = counted.filter(l => l.ok).length, n = counted.length + unanswered;
    const pct = n ? Math.round(100 * right / n) : 0;
    const byT = {};
    counted.forEach(l => { const b = byT[l.q.t.id] = byT[l.q.t.id] || { t: l.q.t, r: 0, n: 0 }; b.n++; if (l.ok) b.r++; });
    const wrong = counted.filter(l => !l.ok);
    const sure = counted.filter(l => !l.ok && l.conf === 2).length;
    const weakT = Object.values(byT).filter(b => b.n >= 3 && b.r / b.n < 0.6);
    if (opt.exam) { S.best.exam = Math.max(S.best.exam || 0, pct); save(); }
    view(`${top('בית')}<div class="panel">
      <div class="eyebrow" style="text-align:center">${esc(opt.title)}</div>
      <div class="big-score">${pct}%</div>
      <p style="text-align:center;margin:0" class="muted">${right} מתוך ${n} נכונות בניסיון הראשון${unanswered ? ` · ${unanswered} לא נענו בזמן` : ''}</p>
      ${sure ? `<div class="alarm" style="margin-top:12px">⚠️ ${sure} טעויות שהיית בטוח בהן. כדאי לעבור עליהן למטה.</div>` : ''}
      ${weakT.length ? `<div class="straight" style="margin-top:12px">ישר ולעניין: ${weakT.map(b => `<b>${esc(b.t.name)}</b> (${b.r}/${b.n})`).join(', ')} ${weakT.length > 1 ? 'חלשים' : 'חלש'} כרגע.</div>` : ''}
      <div class="prog" style="box-shadow:none;padding:14px 0 0">${Object.values(byT).map(b => `<div class="prog-row"><div class="pl">${b.t.icon} ${esc(b.t.name)}<span>${b.r}/${b.n}</span></div><div class="bar"><i style="width:${100 * b.r / b.n}%"></i></div></div>`).join('')}</div>
      <button class="btn" data-home>סיום</button></div>
      ${wrong.length ? `<div class="choice-h">${opt.exam ? 'הטעויות שלך, עם הסברים' : 'מה לחזור עליו'}</div><div class="res-list">${wrong.map(l => `<div class="res">
        <div class="rq">${esc(l.q.q)}</div>
        ${l.chose ? `<div class="rx">${esc(l.chose.txt)}</div>${l.chose.why ? `<div class="muted small">${esc(l.chose.why)}</div>` : ''}` : ''}
        ${isChoice(l.q) ? `<div class="ra">✓ ${esc(l.q.opts.find(o => o.ok).txt)}</div><div class="muted small">${esc(l.q.opts.find(o => o.ok).why || l.q.why || '')}</div>`
          : l.q.type === 'tf' ? `<div class="ra">✓ ${l.q.v ? 'נכון' : 'לא נכון'}</div><div class="muted small">${esc(l.q.why || '')}</div>` : `<div class="ra">${esc(l.q.ans)}</div>`}
        ${srcLine(l.q.t, l.q.src)}</div>`).join('')}</div>` : ''}`);
    homeBtn();
  }

  /* ── more games (they follow the topic and difficulty choice in "עוד משחקים") ── */
  function cards(force) {
    const items = [];
    topicsOn().forEach(t => (t.cards || []).forEach((x, i) => items.push({ t, x, key: `${t.id}:cards:${i}` })));
    if (!items.length) return emptyState('אין כרטיסיות בנושאים שבחרת.');
    const now = Date.now();
    const due = items.filter(it => S.cards[it.key] && S.cards[it.key].due <= now).sort((a, b) => S.cards[a.key].due - S.cards[b.key].due);
    const fresh = shuffle(items.filter(it => !S.cards[it.key])).slice(0, 20);
    let queue = force ? shuffle(items) : [...due, ...fresh];
    if (!queue.length) {
      const next = Math.min(...items.map(it => S.cards[it.key].due));
      const h = Math.max(1, Math.round((next - now) / 36e5));
      view(`${top('בית')}<div class="panel empty"><div class="ei">🎉</div><h2>סיימת את כל מה שצריך לחזור עליו</h2>
        <p class="muted">הכרטיסייה הבאה תחזור בעוד ${h < 24 ? h + ' שעות' : Math.round(h / 24) + ' ימים'}.</p>
        <button class="btn" data-again>לתרגל את כולן בכל זאת</button></div>`);
      homeBtn(); on('[data-again]', () => cards(true)); return;
    }
    let done = 0, known = 0;
    const totalN = queue.length;
    const show = () => {
      if (!queue.length) {
        view(`${top('בית')}<div class="panel empty"><div class="ei">✅</div><h2>סבב הושלם</h2><p class="muted">ידעת ${known} מתוך ${done}. מה שלא ידעת יחזור בקרוב.</p><button class="btn" data-again>עוד סבב</button></div>`);
        homeBtn(); on('[data-again]', () => cards()); return;
      }
      const it = queue[0], rec = S.cards[it.key] || { box: 0 };
      view(`${top('בית', `${done + 1} / ${totalN}`)}
        <div class="meta"><span class="tag">${it.t.icon} ${esc(it.t.name)}</span></div>
        <div class="flip"><button class="fc" aria-label="להפוך"><div class="front"><b>${esc(it.x[0])}</b><small>נסה להיזכר, ואז לחץ להפוך</small></div><div class="back"><div>${esc(it.x[1])}</div>${it.x[2] ? `<small>📍 ${esc(it.t.deck || it.t.name)} · ${esc(it.x[2])}</small>` : ''}</div></button></div>
        <div class="boxes" aria-label="רמת שליטה">${BOX_DAYS.slice(1).map((_, i) => `<i class="${rec.box > i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="btns" hidden><button class="btn bad" data-k="0">עוד לא</button><button class="btn good" data-k="1">ידעתי</button></div>`);
      homeBtn();
      const fc = app.querySelector('.fc'), btns = app.querySelector('.btns');
      fc.addEventListener('click', () => { fc.classList.toggle('on'); btns.hidden = false; });
      on('[data-k]', e => {
        const ok = e.currentTarget.dataset.k === '1';
        queue.shift(); done++;
        if (ok) { known++; rec.box = Math.min(rec.box + 1, BOX_DAYS.length - 1); rec.due = Date.now() + BOX_DAYS[rec.box] * DAY; }
        else { rec.box = 0; rec.due = Date.now(); queue.splice(Math.min(3, queue.length), 0, it); }
        S.cards[it.key] = rec; save(); show();
      });
    };
    show();
  }

  function quizSetup() {
    const items = byDiff(questions().filter(isChoice));
    if (!items.length) return emptyState('אין שאלות בנושאים שבחרת.');
    view(`${top('בית')}<div class="title">מבחן אמריקאי</div>
      <p class="muted">אחרי כל תשובה: הסבר לכל אחת מהתשובות ומקור. רמה: <b>${DIFF[S.diff]}</b> · ${items.length} שאלות.</p>
      <div class="choice-h">כמה שאלות?</div>
      <div class="pickers">${[10, 20, 30].filter(n => n < items.length).map(n => `<button class="chip" data-n="${n}">${n}</button>`).join('')}<button class="chip" data-n="${items.length}">כולן (${items.length})</button></div>`);
    homeBtn();
    on('[data-n]', e => session(interleave(shuffle(items).slice(0, +e.currentTarget.dataset.n)), { title: 'מבחן אמריקאי' }));
  }
  function openQs() {
    const items = byDiff(questions().filter(q => q.type === 'open'));
    if (!items.length) return emptyState('אין שאלות פתוחות בנושאים שבחרת.');
    session(shuffle(items).slice(0, 10), { title: 'שאלות פתוחות' });
  }

  const PRIZES = ['100', '200', '500', '1,000', '2,000', '5,000', '10,000', '25,000', '50,000', '100,000', '250,000', '1,000,000'];
  const SAFE = [3, 7];
  function million() {
    const all = questions().filter(isChoice);
    if (all.length < 12) return emptyState('צריך לפחות 12 שאלות בנושאים שבחרת. בחר עוד נושאים.');
    const used = new Set(), take = d => {
      let c = all.filter(q => q.d === d && !used.has(q.key));
      if (!c.length) c = all.filter(q => !used.has(q.key));
      const q = shuffle(c)[0]; used.add(q.key); return q;
    };
    const ladder = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
    let step = 0, q = take(ladder[0]);
    const life = { half: true, swap: true, aud: true };
    const show = () => {
      const opts = shuffle(q.opts);
      view(`${top('יציאה', `₪${PRIZES[step]}`)}
        <div class="ladder">${PRIZES.map((p, k) => `<i class="${k < step ? 'done' : k === step ? 'now' : ''} ${SAFE.includes(k) ? 'safe' : ''}">${p}</i>`).join('')}</div>
        <div class="panel"><div class="meta"><span class="tag">שאלה ${step + 1} מתוך 12</span><span class="dots">${dots(q.d)}</span></div>
        <div class="q">${esc(q.q)}</div>
        <div class="opts">${opts.map((o, k) => `<button class="opt" data-o="${k}">${'אבגד'[k]}. ${esc(o.txt)}</button>`).join('')}</div>
        <div class="aud-wrap"></div>
        <div class="lifelines"><button data-l="half" ${life.half ? '' : 'disabled'}>50:50</button><button data-l="aud" ${life.aud ? '' : 'disabled'}>👥 הקהל</button><button data-l="swap" ${life.swap ? '' : 'disabled'}>🔄 החלפה</button></div>
        <div class="after"></div></div>`);
      homeBtn();
      on('[data-l]', e => {
        const l = e.currentTarget.dataset.l; if (!life[l]) return; life[l] = false;
        if (l === 'swap') { q = take(q.d); return show(); }
        e.currentTarget.disabled = true;
        const btns = [...app.querySelectorAll('.opt')];
        if (l === 'half') shuffle(btns.filter((b, k) => !opts[k].ok)).slice(0, 2).forEach(b => b.classList.add('gone'));
        if (l === 'aud') {
          const live = btns.map((b, k) => !b.classList.contains('gone') ? k : -1).filter(k => k >= 0);
          const sure = [0.7, 0.55, 0.42][q.d - 1];
          let v = opts.map((o, k) => !live.includes(k) ? 0 : o.ok ? sure + Math.random() * .15 : Math.random() * (1 - sure));
          const sum = v.reduce((a, b) => a + b, 0); v = v.map(x => Math.round(100 * x / sum));
          app.querySelector('.aud-wrap').innerHTML = `<div class="aud">${v.map((x, k) => `<div>${x}%<i style="height:${Math.max(x, 2) * .7}px"></i>${'אבגד'[k]}</div>`).join('')}</div>`;
        }
      });
      on('[data-o]', e => {
        const k = +e.currentTarget.dataset.o, ok = opts[k].ok;
        record(q, ok, 1);
        app.querySelectorAll('.opt').forEach((b, j) => { b.disabled = true; if (opts[j].ok) b.classList.add('ok'); else if (j === k) b.classList.add('no'); });
        app.querySelectorAll('[data-l]').forEach(b => b.disabled = true);
        const keep = ok ? null : SAFE.filter(s => s < step).pop();
        const right = opts.find(o => o.ok);
        app.querySelector('.after').innerHTML = `<div class="why"><b>${ok ? (step === 11 ? '🏆 מיליון! ניצחת!' : '✓ נכון!') : `✗ המשחק נגמר. יוצא עם ₪${keep === undefined ? 0 : PRIZES[keep]}`}</b>${esc((ok ? right.why : opts[k].why) || q.why || '')}</div>${srcLine(q.t, q.src)}
          <button class="btn" data-next>${ok && step < 11 ? `לשאלה על ₪${PRIZES[step + 1]}` : 'משחק חדש'}</button>`;
        S.best.million = Math.max(S.best.million || 0, ok ? step + 1 : step); save();
        on('[data-next]', () => { if (ok && step < 11) { step++; q = take(ladder[step]); show(); } else million(); });
      });
    };
    show();
  }

  function tf() {
    const items = shuffle(questions().filter(q => q.type === 'tf'));
    if (items.length < 5) return emptyState('אין מספיק משפטים בנושאים שבחרת.');
    let i = 0, pts = 0, left = 60, over = false;
    const miss = [];
    view(`${top('יציאה', '<span id="pts">0</span> נקודות')}
      <div class="timer"><i id="tm" style="width:100%"></i></div>
      <div class="panel tf-card" id="st"></div>
      <div class="btns"><button class="btn bad" data-a="0">✗ לא נכון</button><button class="btn good" data-a="1">✓ נכון</button></div>`);
    let tick;
    app.querySelector('[data-home]').addEventListener('click', () => { clearInterval(tick); over = true; home(); });
    const st = app.querySelector('#st');
    const nextS = () => { if (i >= items.length) { items.push(...shuffle(items.splice(0))); i = 0; } st.textContent = items[i].q; };
    nextS();
    tick = setInterval(() => { left--; const tm = app.querySelector('#tm'); if (tm) tm.style.width = (left / 60 * 100) + '%'; if (left <= 0) end(); }, 1000);
    const answer = v => {
      if (over) return;
      const q = items[i], ok = q.v === v;
      record(q, ok, 1);
      if (ok) pts++; else miss.push(q);
      app.querySelector('#pts').textContent = pts;
      st.classList.remove('flash-ok', 'flash-no'); void st.offsetWidth; st.classList.add(ok ? 'flash-ok' : 'flash-no');
      i++; nextS();
    };
    on('[data-a]', e => answer(e.currentTarget.dataset.a === '1'));
    function end() {
      over = true; clearInterval(tick);
      const best = S.best.tf || 0; if (pts > best) { S.best.tf = pts; save(); }
      view(`${top('בית')}<div class="panel"><div class="big-score">${pts}</div><p class="muted" style="text-align:center;margin:0">נקודות ב־60 שניות · השיא שלך: ${Math.max(best, pts)}${pts > best && best ? ' 🎉 שיא חדש!' : ''}</p><button class="btn" data-again>שוב!</button></div>
        ${miss.length ? `<div class="choice-h">טעית ב:</div><div class="res-list">${miss.map(m => `<div class="res"><div class="rq">${esc(m.q)}</div><div class="ra" style="text-decoration:none">${m.v ? 'נכון' : 'לא נכון'}</div><div class="muted small">${esc(m.why || '')}</div>${srcLine(m.t, m.src)}</div>`).join('')}</div>` : ''}`);
      homeBtn(); on('[data-again]', tf);
    }
  }

  function pairsPool() { const out = []; topicsOn().forEach(t => (t.pairs || []).forEach((x, i) => out.push({ t, x, key: `${t.id}:pairs:${i}` }))); return out; }
  function match() {
    const items = pairsPool();
    if (items.length < 4) return emptyState('אין מספיק זוגות בנושאים שבחרת.');
    const set = shuffle(items).slice(0, 6), L = shuffle(set), R = shuffle(set);
    let selL = null, selR = null, left = set.length, miss = 0;
    const t0 = Date.now();
    view(`${top('בית', '<span id="mm">0</span> טעויות')}<p class="muted" style="margin-top:0">לוחצים על מושג, ואז על מה שמתאים לו.</p>
      <div class="match"><div class="col">${L.map(it => `<button class="tile" data-l="${it.key}">${esc(it.x[0])}</button>`).join('')}</div>
      <div class="col">${R.map(it => `<button class="tile" data-r="${it.key}">${esc(it.x[1])}</button>`).join('')}</div></div><div class="after"></div>`);
    homeBtn();
    const tryIt = () => {
      if (!selL || !selR) return;
      const a = selL, b = selR; selL = selR = null;
      if (a.dataset.l === b.dataset.r) {
        [a, b].forEach(x => { x.classList.remove('sel'); x.classList.add('ok'); x.disabled = true; });
        if (--left === 0) {
          const sec = Math.round((Date.now() - t0) / 1000), best = S.best.match;
          if (!best || sec < best) { S.best.match = sec; save(); }
          app.querySelector('.after').innerHTML = `<div class="why" style="margin-top:16px"><b>✓ כל הכבוד! ${sec} שניות, ${miss} טעויות</b>השיא שלך: ${Math.min(sec, best || sec)} שניות</div><button class="btn" data-again>עוד סבב</button>`;
          on('[data-again]', match);
        }
      } else {
        miss++; app.querySelector('#mm').textContent = miss;
        [a, b].forEach(x => { x.classList.remove('sel'); x.classList.add('shake'); setTimeout(() => x.classList.remove('shake'), 400); });
      }
    };
    on('[data-l]', e => { if (selL) selL.classList.remove('sel'); selL = e.currentTarget; selL.classList.add('sel'); tryIt(); });
    on('[data-r]', e => { if (selR) selR.classList.remove('sel'); selR = e.currentTarget; selR.classList.add('sel'); tryIt(); });
  }

  /* region ↔ function ↔ syndrome: pick one from each column */
  function chains() {
    const sets = topicsOn().filter(t => t.chains).map(t => t);
    if (!sets.length) return emptyState('אין טבלת אזור־תפקוד־תסמונת בנושאים שבחרת. היא נמצאת בשיטות מחקר.');
    const t = sets[0], ch = t.chains, rows = shuffle(ch.rows).slice(0, 5);
    const cols = ch.cols.map((_, c) => shuffle(rows.map((r) => ({ txt: r[c], row: ch.rows.indexOf(r) }))));
    let pick = [null, null, null], left = rows.length, miss = 0;
    view(`${top('בית', '<span id="mm">0</span> טעויות')}<div class="title" style="font-size:1.2rem">${ch.cols.join(' ↔ ')}</div>
      <p class="muted" style="margin-top:0">בוחרים אחד מכל טור. כששלושתם שייכים יחד, הם נעלמים.</p>
      <div class="chain">${cols.map((col, c) => `<div class="col"><div class="ch-h">${esc(ch.cols[c])}</div>${col.map(it => `<button class="tile" data-c="${c}" data-row="${it.row}">${esc(it.txt)}</button>`).join('')}</div>`).join('')}</div>
      <div class="after"></div>`);
    homeBtn();
    on('[data-c]', e => {
      const b = e.currentTarget, c = +b.dataset.c;
      if (pick[c]) pick[c].classList.remove('sel');
      pick[c] = b; b.classList.add('sel');
      if (pick.some(x => !x)) return;
      const ok = pick.every(x => x.dataset.row === pick[0].dataset.row);
      const now = pick; pick = [null, null, null];
      if (ok) { now.forEach(x => { x.classList.remove('sel'); x.classList.add('ok'); x.disabled = true; });
        if (--left === 0) { app.querySelector('.after').innerHTML = `<div class="why" style="margin-top:16px"><b>✓ הכול מחובר! ${miss} טעויות</b></div>${srcLine(t, ch.src)}<button class="btn" data-again>עוד סבב</button>`; on('[data-again]', chains); } }
      else { miss++; app.querySelector('#mm').textContent = miss; now.forEach(x => { x.classList.remove('sel'); x.classList.add('shake'); setTimeout(() => x.classList.remove('shake'), 400); }); }
    });
  }

  function memory() {
    const items = pairsPool();
    if (items.length < 4) return emptyState('אין מספיק זוגות בנושאים שבחרת.');
    const set = shuffle(items).slice(0, 6);
    const tiles = shuffle(set.flatMap(it => [{ k: it.key, s: it.x[0] }, { k: it.key, s: it.x[1] }]));
    let open = [], moves = 0, found = 0, lock = false;
    view(`${top('בית', '<span id="mv">0</span> מהלכים')}<div class="mem">${tiles.map((t, i) => `<button class="tile down" data-i="${i}" aria-label="קלף"><span>${esc(t.s)}</span></button>`).join('')}</div><div class="after"></div>`);
    homeBtn();
    on('[data-i]', e => {
      const b = e.currentTarget;
      if (lock || !b.classList.contains('down')) return;
      b.classList.remove('down'); open.push(b);
      if (open.length < 2) return;
      moves++; app.querySelector('#mv').textContent = moves;
      const [a, c] = open; open = [];
      if (tiles[a.dataset.i].k === tiles[c.dataset.i].k) {
        a.classList.add('ok'); c.classList.add('ok');
        if (++found === set.length) {
          const best = S.best.memory; if (!best || moves < best) { S.best.memory = moves; save(); }
          app.querySelector('.after').innerHTML = `<div class="why" style="margin-top:16px"><b>🧠 מצאת הכול ב־${moves} מהלכים</b>השיא שלך: ${Math.min(moves, best || moves)}</div><button class="btn" data-again>עוד סבב</button>`;
          on('[data-again]', memory);
        }
      } else { lock = true; setTimeout(() => { a.classList.add('down'); c.classList.add('down'); lock = false; }, 1100); }
    });
  }

  function order() {
    const items = [];
    topicsOn().forEach(t => (t.seq || []).forEach(x => items.push({ t, x })));
    if (!items.length) return emptyState('אין תהליכים לסדר בנושאים שבחרת.');
    const it = shuffle(items)[0], seq = it.x.items;
    let at = 0, miss = 0;
    const mixed = shuffle(seq.map((s, k) => ({ s, k })));
    view(`${top('בית', '<span id="om">0</span> טעויות')}<div class="panel"><div class="meta"><span class="tag">${it.t.icon} ${esc(it.t.name)}</span></div>
      <div class="q">${esc(it.x.title)}</div><p class="muted" style="margin:4px 0 0">לוחצים לפי הסדר, מהראשון לאחרון.</p>
      <div class="order-done"></div><div class="order-left">${mixed.map(m => `<button class="tile" data-k="${m.k}">${esc(m.s)}</button>`).join('')}</div><div class="after"></div></div>`);
    homeBtn();
    on('[data-k]', e => {
      const b = e.currentTarget;
      if (+b.dataset.k === at) {
        b.remove(); app.querySelector('.order-done').insertAdjacentHTML('beforeend', `<div>${esc(seq[at])}</div>`); at++;
        if (at === seq.length) { app.querySelector('.after').innerHTML = `<div class="why"><b>${miss ? `✓ סודר, עם ${miss} טעויות` : '✓ מושלם, בלי טעויות!'}</b></div>${srcLine(it.t, it.x.src)}<button class="btn" data-again>תהליך אחר</button>`; on('[data-again]', order); }
      } else { miss++; app.querySelector('#om').textContent = miss; b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 400); }
    });
  }

  /* ── article briefs ── */
  function brief(id) {
    const t = C.topics.find(x => x.id === id), b = t.brief;
    view(`${top('בית')}<article class="panel brief">
      <span class="tag ${b.required ? 'req' : ''}">${b.required ? 'מאמר חובה למבחן' : 'לא ברשימת מאמרי החובה בסילבוס'}</span>
      <div class="title" style="margin-top:10px">${t.icon} ${esc(t.name)}</div>
      <p class="one">${esc(b.oneLine)}</p>
      ${b.sections.map(([h, p]) => `<h3>${esc(h)}</h3><p>${p}</p>`).join('')}
      <p class="cite">${esc(b.cite)}</p></article>
      <div class="btns"><button class="btn" data-q>שאלות על המאמר</button><button class="btn ghost" data-c>כרטיסיות</button></div>`);
    homeBtn();
    on('[data-q]', () => { ONLY = id; session(shuffle(questions()).slice(0, 15), { title: t.name }); });
    on('[data-c]', () => { ONLY = id; cards(true); });
  }

  const GAME = { cards: () => cards(), quiz: quizSetup, open: openQs, chains, million, tf, match, memory, order };
  home();
})();
