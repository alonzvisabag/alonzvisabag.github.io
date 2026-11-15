// ── Her birthday, 21.11: the greetings friends left on bday.html (roni/birthday.json) stay out of sight until the
// day. On the day, the party opens by itself once she's in: a cake whose candles she taps out, then a balloon with
// a name for every greeting; popping one opens it. From then on a button on the home page brings the party back.
// Adding ?bday to the address opens it on any day (for Alon, to see it before her birthday).
(function () {
  const BIRTHDAY = '2026-11-21';                    // her birthday, Austria time
  const AGE = 26;
  const SEEN_KEY = 'roni-bday-opened';
  const COLORS = ['#ff5d8f', '#ffc23d', '#8a5cd6', '#4cc9f0', '#06d6a0', '#ff8a4c'];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const preview = /[?&]bday\b/.test(location.search);
  const esc = (s) => escapeHTML(s == null ? '' : s);
  const today = () => { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Vienna' }); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  const isOpen = () => preview || today() >= BIRTHDAY;

  // the parts of one greeting (a recording and a few photos) share a batch id; put them back together
  function merge(list) {
    const cards = [], byBatch = new Map();
    for (const g of list) {
      const from = (g.from || '').trim();
      const key = g.batch ? `${g.batch}|${from}` : null;
      let card = key ? byBatch.get(key) : null;
      if (!card) { card = { from, texts: [], media: [] }; cards.push(card); if (key) byBatch.set(key, card); }
      if (g.text) card.texts.push(g.text);
      if (g.media) card.media.push(g.media);
    }
    return cards;
  }

  function mediaHTML(m) {
    const src = 'media/' + encodeURIComponent(m);
    const ext = m.split('.').pop().toLowerCase();
    if (['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return `<audio controls preload="none" src="${src}"></audio>`;
    if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return `<video controls playsinline preload="metadata" src="${src}#t=0.1"></video>`;
    return `<img src="${src}" alt="" loading="lazy">`;
  }
  const cardHTML = (c, closeBtn) => `<div class="bd-card">
    ${closeBtn ? '<button type="button" class="bd-card-x" data-close aria-label="סגירה">✕</button>' : ''}
    <div class="from">ברכה מ</div><h3>${esc(c.from)}</h3>
    ${c.texts.map((t) => `<p class="txt">${esc(t)}</p>`).join('')}
    ${c.media.map(mediaHTML).join('')}
    ${closeBtn ? '<button type="button" class="bd-btn bd-card-close" data-close>לבלון הבא 🎈</button>' : ''}
  </div>`;

  function confetti(n) {
    if (reduce) return;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('span');
      c.className = 'bd-confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = COLORS[i % COLORS.length];
      c.style.setProperty('--x', (Math.random() * 120 - 60) + 'px');
      c.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      c.style.setProperty('--t', (1.8 + Math.random() * 1.8) + 's');
      c.style.animationDelay = (Math.random() * .5) + 's';
      if (Math.random() > .5) c.style.borderRadius = '50%';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4500);
    }
  }
  function burst(x, y, color) {
    if (reduce) return;
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('span');
      p.className = 'bd-burst';
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 60;
      p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.background = i % 2 ? color : '#fff';
      p.style.setProperty('--x', Math.cos(a) * d + 'px'); p.style.setProperty('--y', Math.sin(a) * d + 'px');
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 800);
    }
  }

  let cards = [];
  let read = new Set();
  const box = document.createElement('div');
  box.id = 'bd-show';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'יום הולדת שמח');
  document.body.appendChild(box);

  function stars() {
    let s = '';
    for (let i = 0; i < 30; i++) s += `<span class="s" style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 90).toFixed(1)}%;--d:${(Math.random() * 2.6).toFixed(2)}s"></span>`;
    return `<div class="bd-sky" aria-hidden="true">${s}</div>`;
  }

  // 1. the cake
  function showCake() {
    box.innerHTML = stars() + `<button type="button" class="bd-close" data-exit aria-label="סגירה">✕</button>
      <div class="bd-stage">
        <div class="bd-over">21.11 · גראץ</div>
        <h2 class="bd-title">רוני! היום את בת <span class="g">${AGE}</span></h2>
        <p class="bd-sub">כולם כאן איתך. אבל קודם, הנרות 🎂</p>
        <div class="bd-cake">
          <div class="bd-candles">
            ${String(AGE).split('').map((d) => `<button type="button" class="bd-candle" aria-label="לכבות את הנר ${d}"><span class="bd-flame"></span>${d}</button>`).join('')}
          </div>
          <div class="bd-tiers"><div class="bd-tier t1"></div><div class="bd-tier t2"></div><div class="bd-plate"></div></div>
        </div>
        <p class="bd-hint">תכבי את הנרות: לחצי על הלהבות 🌬️</p>
      </div>`;
  }

  // 2. the balloons
  function showBalloons() {
    const left = cards.length - read.size;
    box.innerHTML = stars() + `<button type="button" class="bd-close" data-exit aria-label="סגירה">✕</button>
      <div class="bd-stage">
        <h2 class="bd-title">מזל טוב <span class="g">רוני!</span> 🎉</h2>
        <p class="bd-sub">${!cards.length ? 'הברכות בדרך אלייך 💖'
          : left ? `${cards.length === 1 ? 'ברכה אחת מחכה' : `${cards.length} ברכות מחכות`} לך. לחצי על בלון כדי לפוצץ אותו ולקרוא 🎈`
          : 'קראת את כל הברכות 💖 אפשר לפתוח כל בלון שוב'}</p>
        <div class="bd-balloons">
          ${cards.map((c, i) => `<button type="button" class="bd-balloon${read.has(i) ? ' read' : ''}" data-i="${i}" style="--c:${COLORS[i % COLORS.length]};--t:${(2.4 + (i % 5) * .35).toFixed(2)}s;--d:${(-(i % 7) * .4).toFixed(1)}s;--r:${i % 2 ? 3 : -3}deg"><span class="bb">${esc(c.from)}</span><span class="knot"></span></button>`).join('')}
        </div>
        <div class="bd-actions">
          ${cards.length ? '<button type="button" class="bd-btn soft" data-all>לכל הברכות ברשימה אחת</button>' : ''}
          <button type="button" class="bd-btn soft" data-exit>לאתר</button>
        </div>
      </div>
      <div class="bd-card-wrap" hidden></div>`;
  }

  function showAll() {
    box.innerHTML = stars() + `<button type="button" class="bd-close" data-exit aria-label="סגירה">✕</button>
      <div class="bd-stage">
        <h2 class="bd-title" style="font-size:2.2rem">כל הברכות 🎂</h2>
        <div class="bd-list">${cards.map((c) => cardHTML(c, false)).join('')}</div>
        <div class="bd-actions"><button type="button" class="bd-btn" data-balloons>חזרה לבלונים 🎈</button></div>
      </div>`;
    box.scrollTop = 0;
  }

  function openCard(i, from) {
    const r = from.getBoundingClientRect();
    from.classList.add('pop');
    burst(r.left + r.width / 2, r.top + 50, getComputedStyle(from).getPropertyValue('--c'));
    read.add(i);
    setTimeout(() => {
      const wrap = box.querySelector('.bd-card-wrap');
      wrap.innerHTML = cardHTML(cards[i], true);
      wrap.hidden = false;
    }, 300);
  }

  box.addEventListener('click', (e) => {
    const candle = e.target.closest('.bd-candle');
    if (candle && !candle.classList.contains('out')) {
      candle.classList.add('out');
      if (!box.querySelector('.bd-candle:not(.out)')) {
        setTimeout(() => { confetti(120); showBalloons(); }, 900);
      }
      return;
    }
    const balloon = e.target.closest('.bd-balloon');
    if (balloon) return openCard(Number(balloon.dataset.i), balloon);
    if (e.target.closest('[data-close]') || e.target.classList.contains('bd-card-wrap')) {
      showBalloons();
      if (cards.length && read.size === cards.length) confetti(60);
      return;
    }
    if (e.target.closest('[data-all]')) return showAll();
    if (e.target.closest('[data-balloons]')) { showBalloons(); box.scrollTop = 0; return; }
    if (e.target.closest('[data-exit]')) close();
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) close(); });

  async function load() {
    try { cards = merge((await (await fetch('birthday.json', { cache: 'no-store' })).json()).greetings || []); } catch (e) { cards = cards || []; }
  }
  async function open(withCake) {
    await load();
    read = new Set();
    if (withCake) showCake(); else showBalloons();
    box.hidden = false;
    box.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';
    if (!withCake) confetti(60);
  }
  function close() {
    box.hidden = true;
    document.documentElement.style.overflow = '';
  }

  // the button on the home page, from her birthday on
  function addHomeButton() {
    if (!isOpen() || document.getElementById('bd-home')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'bd-home';
    b.innerHTML = '<span class="ic" aria-hidden="true">🎂</span><div><b>הברכות ליום ההולדת שלך</b><span>כל הבלונים מחכים לך כאן</span></div>';
    b.addEventListener('click', () => open(false));
    const anchor = document.getElementById('next-countdown');
    if (anchor) anchor.parentNode.insertBefore(b, anchor);
  }
  addHomeButton();

  // called by the page once she's in (showSite): on the day itself, the party opens once by itself
  window.bdayLaunch = function () {
    if (!isOpen()) return;
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === today(); } catch (e) {}
    if (preview || (today() === BIRTHDAY && !seen)) {
      try { if (!preview) localStorage.setItem(SEEN_KEY, today()); } catch (e) {}
      open(true);
    }
  };
})();
