/* לומדים: משחקי לימוד. כל קורס מגיע מקובץ ב־courses/, וכל המשחקים מושכים מאותו מאגר. */
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

  /* ── storage (per browser; works without it too) ── */
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let C = COURSES.find(c => c.id === get('study-course', '')) || COURSES[0];
  let S;
  function loadState() { S = Object.assign({ topics: null, diff: 0, cards: {}, q: {}, best: {} }, get('study-' + C.id, {})); }
  const save = () => put('study-' + C.id, S);
  loadState();

  /* ── helpers ── */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let ONLY = null; // a brief's "questions on this article" practises one topic without changing the saved choice
  const topicsOn = () => C.topics.filter(t => ONLY ? t.id === ONLY : !S.topics || S.topics.includes(t.id));
  const dots = d => '●'.repeat(d) + '○'.repeat(3 - d);
  const view = html => { app.innerHTML = html; window.scrollTo(0, 0); };
  const top = (label, right = '') => `<div class="bar-top"><button class="back" data-home>→ ${esc(label)}</button><span class="counter">${right}</span></div>`;
  const on = (sel, fn) => app.querySelectorAll(sel).forEach(el => el.addEventListener('click', fn));
  const homeBtn = () => on('[data-home]', home);

  /* every item of one kind from the chosen topics, with a stable key for progress */
  function pool(kind, topics = topicsOn()) {
    const out = [];
    topics.forEach(t => (t[kind] || []).forEach((x, i) => out.push({ t, i, x, key: `${t.id}:${kind}:${i}` })));
    return out;
  }
  /* weak questions come back more often */
  function pick(items, n) {
    const w = it => { const r = S.q[it.key]; return r ? 1 + 2.5 * r.w / (1 + r.r) : 1.6; };
    const bag = items.map(it => ({ it, k: Math.pow(Math.random(), 1 / w(it)) }));
    return bag.sort((a, b) => b.k - a.k).slice(0, n).map(b => b.it);
  }
  function byDiff(items) {
    if (!S.diff) return items;
    const f = items.filter(it => it.x[0] === S.diff);
    return f.length >= 4 ? f : items;
  }
  function score(key, ok) { const r = S.q[key] || { r: 0, w: 0 }; ok ? r.r++ : r.w++; S.q[key] = r; save(); }

  /* ── home ── */
  const GAMES = [
    ['cards', '🃏', 'כרטיסיות', 'מושג והסבר. מה שלא ידעת חוזר מהר'],
    ['quiz', '📝', 'מבחן אמריקאי', '10, 20 או 30 שאלות, עם הסבר לכל תשובה'],
    ['exam', '⏱️', 'סימולציית מבחן', 'בלי משוב באמצע, ציון ותיקונים בסוף'],
    ['million', '💰', 'מי רוצה להיות מיליונר', '12 שאלות שהולכות ומתקשות'],
    ['open', '✍️', 'שאלות פתוחות', 'כותבים תשובה קצרה ומשווים לתשובה'],
    ['tf', '⚡', 'נכון או לא נכון', '60 שניות. כמה תספיק?'],
    ['match', '🔗', 'התאמה', 'מחברים כל מושג לבן הזוג שלו'],
    ['memory', '🧠', 'משחק זיכרון', 'הופכים קלפים ומוצאים זוגות'],
    ['order', '🔢', 'סדר נכון', 'שלבים ותהליכים, לפי הסדר'],
  ];
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function standalone() { return window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; }

  function home() {
    ONLY = null;
    const all = C.topics;
    const sel = S.topics;
    const count = k => all.reduce((n, t) => n + (t[k] || []).length, 0);
    const showInstall = !standalone() && !get('study-install-hide', false);
    const lectures = all.filter(t => !t.article), articles = all.filter(t => t.article);
    view(`
      <header class="hero">
        <div class="eyebrow">משחקי לימוד</div>
        <h1>${COURSES.length > 1 ? `<button data-course>${esc(C.name)} ▾</button>` : esc(C.name)}</h1>
        <p>${count('cards')} כרטיסיות · ${count('mcq')} שאלות אמריקאיות · ${count('open')} שאלות פתוחות · ${count('tf')} משפטים</p>
      </header>
      ${showInstall ? `<div class="install"><span class="ii">📲</span><div style="flex:1"><b>שומרים כאפליקציה במסך הבית</b>
        <p>${isIOS() ? 'בספארי: לוחצים על כפתור השיתוף <b>⬆︎</b> למטה, ואז על <b>"הוספה למסך הבית"</b>.' : 'בתפריט הדפדפן: <b>"הוספה למסך הבית"</b> או <b>"התקנת אפליקציה"</b>.'}</p></div>
        <button data-hide-install aria-label="סגירה">✕</button></div>` : ''}
      <section class="sec">
        <div class="sec-h"><h2>על מה מתרגלים?</h2><button data-all>${sel ? 'הכול' : ''}</button></div>
        <div class="chips">${all.map(t => `<button class="chip" data-topic="${t.id}" aria-pressed="${!sel || sel.includes(t.id)}">${t.icon} ${esc(t.name)}</button>`).join('')}</div>
      </section>
      <section class="sec">
        <div class="sec-h"><h2>רמת קושי</h2></div>
        <div class="seg">${DIFF.map((d, i) => `<button data-diff="${i}" aria-pressed="${S.diff === i}">${d}</button>`).join('')}</div>
      </section>
      <section class="sec">
        <div class="sec-h"><h2>משחקים</h2></div>
        <div class="games">${GAMES.map(([id, ic, name, d]) => `<button class="game" data-game="${id}"><span class="gi">${ic}</span><b>${name}</b><span>${d}</span></button>`).join('')}</div>
      </section>
      <section class="sec">
        <div class="sec-h"><h2>מאמרים</h2></div>
        <div class="list">
          ${articles.map(t => `<button class="row" data-brief="${t.id}"><span class="ri">${t.icon}</span><div><b>${esc(t.name)}</b><small>${esc(t.brief.oneLine)}</small></div><span class="tag ${t.brief.required ? 'req' : ''}">${t.brief.required ? 'חובה למבחן' : 'לא ברשימת החובה'}</span></button>`).join('')}
          ${(C.missing || []).map(m => `<div class="row dim"><span class="ri">📄</span><div><b>${esc(m)}</b><small>מאמר חובה שעוד לא נוסף. שלח אותו ואכין בריף ושאלות.</small></div></div>`).join('')}
        </div>
      </section>
      <section class="sec">
        <div class="sec-h"><h2>איפה אני עומד</h2>${Object.keys(S.q).length || Object.keys(S.cards).length ? '<button data-reset>איפוס</button>' : ''}</div>
        <div class="prog">${[...lectures, ...articles].map(t => {
          const cards = (t.cards || []).map((_, i) => S.cards[`${t.id}:cards:${i}`]).filter(c => c && c.box >= 3).length;
          const qs = Object.entries(S.q).filter(([k]) => k.startsWith(t.id + ':'));
          const r = qs.reduce((n, [, v]) => n + v.r, 0), w = qs.reduce((n, [, v]) => n + v.w, 0);
          const pct = r + w ? Math.round(100 * r / (r + w)) : null;
          return `<div class="prog-row"><div class="pl">${t.icon} ${esc(t.name)}<span>${pct === null ? 'עוד לא תרגלת' : pct + '% נכונות'} · ${cards}/${t.cards.length} כרטיסיות</span></div><div class="bar"><i style="width:${pct || 0}%"></i></div></div>`;
        }).join('')}</div>
      </section>
      <p class="muted" style="text-align:center;font-size:.8rem;margin-top:26px">ההתקדמות נשמרת בטלפון הזה בלבד.</p>
    `);
    on('[data-topic]', e => {
      const id = e.currentTarget.dataset.topic;
      let s = S.topics ? S.topics.slice() : all.map(t => t.id);
      s = s.includes(id) ? s.filter(x => x !== id) : [...s, id];
      S.topics = !s.length || s.length === all.length ? null : s; save(); home();
    });
    on('[data-all]', () => { S.topics = null; save(); home(); });
    on('[data-diff]', e => { S.diff = +e.currentTarget.dataset.diff; save(); home(); });
    on('[data-game]', e => GAME[e.currentTarget.dataset.game]());
    on('[data-brief]', e => brief(e.currentTarget.dataset.brief));
    on('[data-hide-install]', () => { put('study-install-hide', true); home(); });
    on('[data-course]', () => { const i = (COURSES.indexOf(C) + 1) % COURSES.length; C = COURSES[i]; put('study-course', C.id); loadState(); home(); });
    on('[data-reset]', e => {
      const b = e.currentTarget;
      if (b.dataset.sure) { S.q = {}; S.cards = {}; S.best = {}; save(); home(); } else { b.dataset.sure = 1; b.textContent = 'בטוח? לחיצה נוספת מוחקת'; }
    });
  }

  function emptyState(msg) {
    view(`${top('בית')}<div class="panel empty"><div class="ei">🤷</div><p>${msg}</p><button class="btn" data-home>חזרה לבחירת נושאים</button></div>`);
    homeBtn();
  }

  /* ── 1. flashcards with spaced repetition ── */
  function cards(force) {
    const items = pool('cards');
    if (!items.length) return emptyState('אין כרטיסיות בנושאים שבחרת.');
    const now = Date.now();
    let due = items.filter(it => S.cards[it.key] && S.cards[it.key].due <= now).sort((a, b) => S.cards[a.key].due - S.cards[b.key].due);
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
    const total = queue.length;
    const show = () => {
      if (!queue.length) {
        view(`${top('בית')}<div class="panel empty"><div class="ei">✅</div><h2>סבב הושלם</h2><p class="muted">ידעת ${known} מתוך ${done}. מה שלא ידעת יחזור בקרוב.</p><button class="btn" data-again>עוד סבב</button></div>`);
        homeBtn(); on('[data-again]', () => cards()); return;
      }
      const it = queue[0], rec = S.cards[it.key] || { box: 0 };
      view(`${top('בית', `${done + 1} / ${total}`)}
        <div class="meta"><span class="tag">${it.t.icon} ${esc(it.t.name)}</span></div>
        <div class="flip"><button class="fc" aria-label="להפוך"><div class="front"><b>${esc(it.x[0])}</b><small>לחיצה להפוך</small></div><div class="back"><div>${esc(it.x[1])}</div></div></button></div>
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

  /* ── 2+3. multiple choice: practice (feedback each time) or exam (feedback at the end) ── */
  function quizSetup(exam) {
    const items = byDiff(pool('mcq'));
    if (!items.length) return emptyState('אין שאלות בנושאים שבחרת.');
    const counts = [10, 20, 30].filter(n => n <= items.length);
    if (!counts.length) counts.push(items.length);
    view(`${top('בית')}<div class="title">${exam ? 'סימולציית מבחן' : 'מבחן אמריקאי'}</div>
      <p class="muted">${exam ? 'עונים על הכול, ורק בסוף רואים ציון, טעויות והסברים.' : 'אחרי כל תשובה רואים אם צדקת ולמה.'} רמה: <b>${DIFF[S.diff]}</b> · ${items.length} שאלות במאגר.</p>
      <div class="choice-h">כמה שאלות?</div>
      <div class="pickers">${counts.map(n => `<button class="chip" data-n="${n}">${n}</button>`).join('')}${items.length > 30 ? `<button class="chip" data-n="${items.length}">כולן (${items.length})</button>` : ''}</div>`);
    homeBtn();
    on('[data-n]', e => quiz(pick(items, +e.currentTarget.dataset.n), exam));
  }
  function quiz(list, exam) {
    let i = 0;
    const log = [];
    const qs = list.map(it => ({ it, opts: shuffle(it.x.slice(2, 6)) }));
    const show = () => {
      if (i >= qs.length) return quizEnd(log, exam);
      const { it, opts } = qs[i], [d, q, right, , , , why] = it.x;
      view(`${top('בית', `${i + 1} / ${qs.length}`)}
        <div class="panel"><div class="meta"><span class="tag">${it.t.icon} ${esc(it.t.name)}</span><span class="dots" title="קושי">${dots(d)}</span></div>
        <div class="q">${esc(q)}</div>
        <div class="opts">${opts.map((o, k) => `<button class="opt" data-o="${k}">${esc(o)}</button>`).join('')}</div>
        <div class="after"></div></div>`);
      homeBtn();
      on('[data-o]', e => {
        const k = +e.currentTarget.dataset.o, ok = opts[k] === right;
        log.push({ it, chose: opts[k], ok }); score(it.key, ok);
        if (exam) { e.currentTarget.classList.add('sel'); app.querySelectorAll('.opt').forEach(b => b.disabled = true); setTimeout(() => { i++; show(); }, 260); return; }
        app.querySelectorAll('.opt').forEach((b, j) => { b.disabled = true; if (opts[j] === right) b.classList.add('ok'); else if (j === k) b.classList.add('no'); });
        app.querySelector('.after').innerHTML = `<div class="why"><b>${ok ? '✓ נכון!' : '✗ לא בדיוק'}</b>${esc(why)}</div><button class="btn" data-next>${i + 1 < qs.length ? 'לשאלה הבאה' : 'לסיכום'}</button>`;
        on('[data-next]', () => { i++; show(); });
      });
    };
    show();
  }
  function quizEnd(log, exam) {
    const right = log.filter(l => l.ok).length, pct = Math.round(100 * right / log.length);
    const best = S.best[exam ? 'exam' : 'quiz'] || 0;
    if (pct > best) { S.best[exam ? 'exam' : 'quiz'] = pct; save(); }
    const byTopic = {};
    log.forEach(l => { const b = byTopic[l.it.t.id] = byTopic[l.it.t.id] || { t: l.it.t, r: 0, n: 0 }; b.n++; if (l.ok) b.r++; });
    const wrong = log.filter(l => !l.ok);
    view(`${top('בית')}<div class="panel"><div class="big-score">${pct}</div>
      <p style="text-align:center;margin:0" class="muted">${right} מתוך ${log.length} נכונות${pct > best && best ? ' · שיא חדש!' : ''}</p>
      <div class="prog" style="box-shadow:none;padding:14px 0 0">${Object.values(byTopic).map(b => `<div class="prog-row"><div class="pl">${b.t.icon} ${esc(b.t.name)}<span>${b.r}/${b.n}</span></div><div class="bar"><i style="width:${100 * b.r / b.n}%"></i></div></div>`).join('')}</div>
      <button class="btn" data-again>עוד סבב</button></div>
      ${wrong.length ? `<div class="choice-h">${exam ? 'הטעויות שלך, עם הסברים' : 'לחזור על אלה'}</div><div class="res-list">${wrong.map(l => `<div class="res"><div class="rq">${esc(l.it.x[1])}</div><div class="rx">${esc(l.chose)}</div><div class="ra">✓ ${esc(l.it.x[2])}</div><div class="muted">${esc(l.it.x[6])}</div></div>`).join('')}</div>` : ''}`);
    homeBtn(); on('[data-again]', () => quizSetup(exam));
  }

  /* ── 4. millionaire ── */
  const PRIZES = ['100', '200', '500', '1,000', '2,000', '5,000', '10,000', '25,000', '50,000', '100,000', '250,000', '1,000,000'];
  const SAFE = [3, 7];
  function million() {
    const all = pool('mcq');
    if (all.length < 12) return emptyState('צריך לפחות 12 שאלות בנושאים שבחרת. בחר עוד נושאים.');
    const used = new Set(), take = d => {
      let c = all.filter(it => it.x[0] === d && !used.has(it.key));
      if (!c.length) c = all.filter(it => !used.has(it.key));
      const it = pick(c, 1)[0]; used.add(it.key); return it;
    };
    const ladder = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
    let step = 0, it = take(ladder[0]);
    const life = { half: true, swap: true, aud: true };
    const show = () => {
      const [d, q, right, , , , why] = it.x, opts = shuffle(it.x.slice(2, 6));
      view(`${top('יציאה', `₪${PRIZES[step]}`)}
        <div class="ladder">${PRIZES.map((p, k) => `<i class="${k < step ? 'done' : k === step ? 'now' : ''} ${SAFE.includes(k) ? 'safe' : ''}">${p}</i>`).join('')}</div>
        <div class="panel"><div class="meta"><span class="tag">שאלה ${step + 1} מתוך 12</span><span class="dots">${dots(d)}</span></div>
        <div class="q">${esc(q)}</div>
        <div class="opts">${opts.map((o, k) => `<button class="opt" data-o="${k}">${'אבגד'[k]}. ${esc(o)}</button>`).join('')}</div>
        <div class="aud-wrap"></div>
        <div class="lifelines"><button data-l="half" ${life.half ? '' : 'disabled'}>50:50</button><button data-l="aud" ${life.aud ? '' : 'disabled'}>👥 הקהל</button><button data-l="swap" ${life.swap ? '' : 'disabled'}>🔄 החלפה</button></div>
        <div class="after"></div></div>`);
      homeBtn();
      on('[data-l]', e => {
        const l = e.currentTarget.dataset.l; if (!life[l]) return; life[l] = false;
        if (l === 'swap') { it = take(it.x[0]); return show(); }
        e.currentTarget.disabled = true;
        const btns = [...app.querySelectorAll('.opt')];
        if (l === 'half') shuffle(btns.filter((b, k) => opts[k] !== right)).slice(0, 2).forEach(b => b.classList.add('gone'));
        if (l === 'aud') {
          const live = btns.map((b, k) => !b.classList.contains('gone') ? k : -1).filter(k => k >= 0);
          const sure = [0.7, 0.55, 0.42][d - 1];
          let v = opts.map((o, k) => !live.includes(k) ? 0 : o === right ? sure + Math.random() * .15 : Math.random() * (1 - sure));
          const sum = v.reduce((a, b) => a + b, 0); v = v.map(x => Math.round(100 * x / sum));
          app.querySelector('.aud-wrap').innerHTML = `<div class="aud">${v.map((x, k) => `<div>${x}%<i style="height:${Math.max(x, 2) * .7}px"></i>${'אבגד'[k]}</div>`).join('')}</div>`;
        }
      });
      on('[data-o]', e => {
        const k = +e.currentTarget.dataset.o, ok = opts[k] === right;
        score(it.key, ok);
        app.querySelectorAll('.opt').forEach((b, j) => { b.disabled = true; if (opts[j] === right) b.classList.add('ok'); else if (j === k) b.classList.add('no'); });
        app.querySelectorAll('[data-l]').forEach(b => b.disabled = true);
        if (ok && step === 11) { S.best.million = 12; save(); }
        const keep = ok ? null : SAFE.filter(s => s < step).pop();
        app.querySelector('.after').innerHTML = `<div class="why"><b>${ok ? (step === 11 ? '🏆 מיליון! ניצחת!' : '✓ נכון!') : `✗ המשחק נגמר. יוצא עם ₪${keep === undefined ? 0 : PRIZES[keep]}`}</b>${esc(why)}</div>
          <button class="btn" data-next>${ok && step < 11 ? `לשאלה על ₪${PRIZES[step + 1]}` : 'משחק חדש'}</button>`;
        if (!ok) { S.best.million = Math.max(S.best.million || 0, step); save(); }
        on('[data-next]', () => { if (ok && step < 11) { step++; it = take(ladder[step]); show(); } else million(); });
      });
    };
    show();
  }

  /* ── 5. short open questions ── */
  function open() {
    const items = byDiff(pool('open'));
    if (!items.length) return emptyState('אין שאלות פתוחות בנושאים שבחרת.');
    const list = pick(items, Math.min(10, items.length));
    let i = 0, got = 0;
    const norm = s => s.replace(/[֑-ׇ]/g, '').toLowerCase();
    const show = () => {
      if (i >= list.length) {
        view(`${top('בית')}<div class="panel empty"><div class="ei">✍️</div><h2>${got} מתוך ${list.length}</h2><p class="muted">ידעת לגמרי ${got} תשובות.</p><button class="btn" data-again>עוד סבב</button></div>`);
        homeBtn(); on('[data-again]', open); return;
      }
      const it = list[i], [d, q, ans, kws] = it.x;
      view(`${top('בית', `${i + 1} / ${list.length}`)}
        <div class="panel"><div class="meta"><span class="tag">${it.t.icon} ${esc(it.t.name)}</span><span class="dots">${dots(d)}</span></div>
        <div class="q">${esc(q)}</div>
        <textarea id="ans" placeholder="כתוב תשובה קצרה, כמו במבחן…"></textarea>
        <div class="after"><button class="btn" data-check>לבדוק</button></div></div>`);
      homeBtn();
      on('[data-check]', () => {
        const mine = norm(app.querySelector('#ans').value);
        const hits = kws.map(k => mine.includes(norm(k)));
        app.querySelector('#ans').readOnly = true;
        app.querySelector('.after').innerHTML = `
          ${mine.trim() ? `<div class="kw">${kws.map((k, j) => `<span class="${hits[j] ? 'hit' : ''}">${hits[j] ? '✓' : '·'} ${esc(k)}…</span>`).join('')}</div>` : ''}
          <div class="why"><b>תשובה טובה:</b>${esc(ans)}</div>
          <div class="choice-h">איך היה?</div>
          <div class="btns" style="grid-template-columns:1fr 1fr 1fr"><button class="btn bad" data-g="0">לא ידעתי</button><button class="btn mid" data-g="1">חלקית</button><button class="btn good" data-g="2">ידעתי</button></div>`;
        on('[data-g]', e => { const g = +e.currentTarget.dataset.g; if (g === 2) got++; score(it.key, g === 2); i++; show(); });
      });
    };
    show();
  }

  /* ── 6. true / false, 60 seconds ── */
  function tf() {
    const items = shuffle(pool('tf'));
    if (items.length < 5) return emptyState('אין מספיק משפטים בנושאים שבחרת.');
    let i = 0, pts = 0, left = 60, over = false;
    const miss = [];
    view(`${top('יציאה', '<span id="pts">0</span> נקודות')}
      <div class="timer"><i id="tm" style="width:100%"></i></div>
      <div class="panel tf-card" id="st"></div>
      <div class="btns"><button class="btn bad" data-a="0">✗ לא נכון</button><button class="btn good" data-a="1">✓ נכון</button></div>`);
    let tick;
    app.querySelector('[data-home]').addEventListener('click', () => { clearInterval(tick); home(); });
    const st = app.querySelector('#st');
    const next = () => { if (i >= items.length) { items.push(...shuffle(items.splice(0))); i = 0; } st.textContent = items[i].x[1]; };
    next();
    tick = setInterval(() => { left--; app.querySelector('#tm').style.width = (left / 60 * 100) + '%'; if (left <= 0) end(); }, 1000);
    const answer = v => {
      if (over) return;
      const it = items[i], ok = it.x[0] === v;
      score(it.key, ok);
      if (ok) pts++; else miss.push(it);
      app.querySelector('#pts').textContent = pts;
      st.classList.remove('flash-ok', 'flash-no'); void st.offsetWidth; st.classList.add(ok ? 'flash-ok' : 'flash-no');
      i++; next();
    };
    on('[data-a]', e => answer(e.currentTarget.dataset.a === '1'));
    const key = e => { if (e.key === 'ArrowRight') answer(false); if (e.key === 'ArrowLeft') answer(true); };
    document.addEventListener('keydown', key);
    function end() {
      over = true; clearInterval(tick); document.removeEventListener('keydown', key);
      const best = S.best.tf || 0; if (pts > best) { S.best.tf = pts; save(); }
      view(`${top('בית')}<div class="panel"><div class="big-score">${pts}</div><p class="muted" style="text-align:center;margin:0">נקודות ב־60 שניות · השיא שלך: ${Math.max(best, pts)}${pts > best && best ? ' 🎉 שיא חדש!' : ''}</p><button class="btn" data-again>שוב!</button></div>
        ${miss.length ? `<div class="choice-h">טעית ב:</div><div class="res-list">${miss.map(m => `<div class="res"><div class="rq">${esc(m.x[1])}</div><div class="${m.x[0] ? 'ra' : 'rx'}" style="text-decoration:none">${m.x[0] ? 'נכון' : 'לא נכון'}</div><div class="muted">${esc(m.x[2])}</div></div>`).join('')}</div>` : ''}`);
      homeBtn(); on('[data-again]', tf);
    }
  }

  /* ── 7. matching ── */
  function match() {
    const items = pool('pairs');
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

  /* ── 8. memory ── */
  function memory() {
    const items = pool('pairs');
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

  /* ── 9. put in order ── */
  function order() {
    const items = pool('seq');
    if (!items.length) return emptyState('אין תהליכים לסדר בנושאים שבחרת.');
    const it = shuffle(items)[0], seq = it.x.items;
    let at = 0, miss = 0;
    const mixed = shuffle(seq.map((s, k) => ({ s, k })));
    view(`${top('בית', `<span id="om">0</span> טעויות`)}<div class="panel"><div class="meta"><span class="tag">${it.t.icon} ${esc(it.t.name)}</span></div>
      <div class="q">${esc(it.x.title)}</div><p class="muted" style="margin:4px 0 0">לוחצים לפי הסדר, מהראשון לאחרון.</p>
      <div class="order-done"></div><div class="order-left">${mixed.map(m => `<button class="tile" data-k="${m.k}">${esc(m.s)}</button>`).join('')}</div><div class="after"></div></div>`);
    homeBtn();
    on('[data-k]', e => {
      const b = e.currentTarget;
      if (+b.dataset.k === at) {
        b.remove(); app.querySelector('.order-done').insertAdjacentHTML('beforeend', `<div>${esc(seq[at])}</div>`); at++;
        if (at === seq.length) { score(it.key, miss === 0); app.querySelector('.after').innerHTML = `<div class="why"><b>${miss ? `✓ סודר, עם ${miss} טעויות` : '✓ מושלם, בלי טעויות!'}</b></div><button class="btn" data-again>תהליך אחר</button>`; on('[data-again]', order); }
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
    const only = fn => () => { ONLY = id; fn(); };
    on('[data-q]', only(() => quizSetup(false)));
    on('[data-c]', only(() => cards(true)));
  }

  const GAME = { cards: () => cards(), quiz: () => quizSetup(false), exam: () => quizSetup(true), million, open, tf, match, memory, order };
  if (!C) { app.innerHTML = '<p>אין עדיין קורסים.</p>'; return; }
  home();
})();
