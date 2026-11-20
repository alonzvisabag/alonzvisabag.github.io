// ── Her birthday, 21.11: the greetings friends left on bday.html (roni/birthday.json) stay out of sight until the
// day. On the day, a birthday screen opens by itself once she's in. It looks like the rest of her site (the same
// cards as her messages, with hearts for favorites) and has confetti falling down both sides. From then on the
// greetings are also one more situation in her list, and a button on the home page opens the screen again.
// Adding ?bday to the address opens it on any day (for Alon, to see it before her birthday).
(function () {
  const BIRTHDAY = '2026-11-21';                    // her birthday, Austria time
  const AGE = 26;
  const CAPSULE_ID = 'bday26';                      // the same id in her list, so a heart counts in both places
  const SEEN_KEY = 'roni-bday-opened';
  const COLORS = ['#ff5d8f', '#ffc23d', '#8a5cd6', '#4cc9f0', '#06d6a0', '#ff8a4c'];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const preview = /[?&]bday\b/.test(location.search);
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
  // one greeting as the items of a message: the first carries the name and the words, the rest are its files
  const itemsOf = (c) => [{ from: c.from, text: c.texts.join('\n\n') || null, media: c.media[0] || null },
    ...c.media.slice(1).map((m) => ({ from: null, text: null, media: m }))];

  let cards = [];
  async function load() {
    try { cards = merge((await (await fetch('birthday.json', { cache: 'no-store' })).json()).greetings || []); } catch (e) {}
  }

  // ── the screen
  const view = document.createElement('div');
  view.id = 'bd-show';
  view.setAttribute('aria-label', 'יום הולדת שמח');
  document.body.appendChild(view);

  // confetti drifting down both sides, behind the cards
  function sides() {
    let html = '';
    for (const side of ['right', 'left']) {
      html += `<div class="bd-side ${side}" aria-hidden="true">`;
      for (let i = 0; i < 16; i++) {
        html += `<i style="left:${(Math.random() * 80).toFixed(0)}%;background:${COLORS[i % COLORS.length]};--t:${(5 + Math.random() * 5).toFixed(1)}s;--d:${(-Math.random() * 10).toFixed(1)}s;--x:${(Math.random() * 30 - 15).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg${i % 3 ? '' : ';border-radius:50%'}"></i>`;
      }
      html += '</div>';
    }
    return reduce ? '' : html;
  }

  function render() {
    const list = cards.map((c) => `<div class="fav-card"><div class="capsule-body">${itemsOf(c).map((it) => itemHTML(it, itemKey({ id: CAPSULE_ID }, it))).join('')}</div></div>`).join('');
    view.innerHTML = sides() + `
      <div class="view-header">
        <button class="back-btn" type="button" data-exit aria-label="חזרה"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
        <h2>יום הולדת שמח</h2>
      </div>
      <div class="bd-hero">
        <div class="bd-cake" aria-hidden="true">🎂</div>
        <h3>מזל טוב רוני!</h3>
        <p>היום את בת ${AGE}${cards.length ? `, ומחכות לך כאן ${cards.length === 1 ? 'ברכה אחת' : `${cards.length} ברכות`} מכל מי שאוהב אותך 💛` : '. הברכות בדרך אלייך 💛'}</p>
      </div>
      <div class="bd-list">${list}</div>`;
    loadDeferredImages(view);
  }

  view.addEventListener('click', (e) => {
    const heart = e.target.closest('.fav-btn');
    if (heart) return toggleFavorite(heart);
    if (e.target.closest('[data-exit]')) closeView(view);
  });

  async function open(pt) {
    await load();
    render();
    view.scrollTop = 0;
    openView(view, pt || { x: innerWidth / 2, y: innerHeight / 3 });
    if (!reduce) for (let i = 0; i < 3; i++) setTimeout(() => burstConfetti(innerWidth / 2 + (Math.random() - .5) * 160, innerHeight / 3), 500 + i * 180);
  }

  // ── from her birthday on, the greetings also become part of her site: one more situation at the top of the list,
  // with hearts for favorites like every other message, and counted in the heart at the top
  window.bdayAddToSite = async function (list) {
    if (!isOpen()) return;
    await load();
    if (!cards.length || document.querySelector(`.capsule[data-id="${CAPSULE_ID}"]`)) return;
    const capsule = { id: CAPSULE_ID, trigger: `ליום ההולדת ה-${AGE} שלך 🎂`, type: 'letter', items: cards.flatMap(itemsOf) };
    if (typeof siteData !== 'undefined' && siteData && siteData.capsules) siteData.capsules.unshift(capsule);   // the page's own list, for favorites
    const el = renderCapsule(capsule);
    el.style.setProperty('--shadow-c', 'color-mix(in srgb, #ff5d8f 26%, var(--card))');
    list.prepend(el);
    renderFavorites();
    loveTotal += cards.length;
    const heart = document.getElementById('love-count');
    if (heart && document.getElementById('site').style.display === 'block') heart.textContent = loveTotal;
  };

  // the button on the home page, from her birthday on
  function addHomeButton() {
    if (!isOpen() || document.getElementById('bd-home')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'bd-home';
    b.innerHTML = '<span class="ic" aria-hidden="true">🎂</span><div><b>הברכות ליום ההולדת שלך</b><span>כל מי שאוהב אותך כתב לך</span></div>';
    b.addEventListener('click', (e) => open(tapPoint(e)));
    const anchor = document.getElementById('next-countdown');
    if (anchor) anchor.parentNode.insertBefore(b, anchor);
  }
  addHomeButton();

  // called by the page once she's in (showSite): on the day itself, the screen opens once by itself
  window.bdayLaunch = function () {
    if (!isOpen()) return;
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === today(); } catch (e) {}
    if (preview || (today() === BIRTHDAY && !seen)) {
      try { if (!preview) localStorage.setItem(SEEN_KEY, today()); } catch (e) {}
      open();
    }
  };
})();
