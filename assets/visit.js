// Tells Alon on Telegram when someone opens the site, and when they leave, what they did there:
// which pages, for how long and how far down, what they clicked and what they searched.
// Never for Alon himself: open any page with ?me once on each of your own browsers (?notme undoes it).
// Other scripts add to the summary with window.visitNote(text, key) and window.visitSearch(term).
(function () {
    const ENDPOINT = 'https://roni-contribute.alonzvisabag.workers.dev';
    const params = new URLSearchParams(location.search);
    let st = null;
    try {
        if (params.has('me')) localStorage.setItem('visit-me', '1');
        if (params.has('notme')) localStorage.removeItem('visit-me');
        if (localStorage.getItem('visit-me')) return;
        st = JSON.parse(sessionStorage.getItem('visit-state') || 'null');
    } catch (e) {
        return;
    }
    const save = () => { try { sessionStorage.setItem('visit-state', JSON.stringify(st)); } catch (e) {} };

    // A plain request goes out right away; a beacon can be held back by the browser (iPhones often
    // wait until the page is closed), so it's only the fallback, and the only way out while leaving.
    function send(path, data, leaving) {
        const body = JSON.stringify(data);
        const beacon = () => { try { navigator.sendBeacon && navigator.sendBeacon(ENDPOINT + path, new Blob([body], { type: 'text/plain' })); } catch (e) {} };
        if (leaving || !window.fetch) return beacon();
        fetch(ENDPOINT + path, { method: 'POST', body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } }).catch(beacon);
    }

    // a new visit gets a short code, so its arrival alert and its summary can be matched in Telegram;
    // a page opened in a new tab from the site carries the code along (?v=) and continues the same visit
    if (!st) {
        const carried = /^[A-Z2-9]{4}$/.test(params.get('v') || '') ? params.get('v') : '';
        const code = carried || Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
        // the link in Alon's CV ends with #about, so those visits are tagged as coming from the CV
        const tag = params.get('from') || (location.hash === '#about' ? 'הקורות-חיים' : '');
        st = { id: code, ref: document.referrer || '', from: tag, start: Date.now(), pages: [], notes: [], q: [], sig: carried ? 'carried' : '', nav: 0 };
        save();
        if (!carried) {
            // how many times this browser has come before, and when it last did
            let before = null;
            try {
                before = JSON.parse(localStorage.getItem('visit-history') || 'null');
                localStorage.setItem('visit-history', JSON.stringify({ n: (before ? before.n : 0) + 1, last: Date.now() }));
            } catch (e) {}
            send('/visit', { page: location.pathname, ref: st.ref, from: tag, id: code, n: before ? before.n + 1 : 1, last: before ? before.last : 0 });
        }
    }

    const page = { p: location.pathname, ms: 0, d: 0 };
    st.pages.push(page);
    if (st.pages.length > 30) st.pages.splice(0, st.pages.length - 30);
    st.nav = 0;
    save();

    // time actually looking at the page, and how far down it was scrolled
    let shownAt = document.visibilityState === 'visible' ? Date.now() : 0;
    const tick = () => { if (shownAt) { page.ms += Date.now() - shownAt; shownAt = Date.now(); } };
    const depth = () => {
        const room = document.documentElement.scrollHeight - innerHeight;
        const d = room <= 0 ? 100 : Math.min(100, Math.round(scrollY / room * 100));
        if (d > page.d) page.d = d;
    };
    let depthTimer = 0;
    addEventListener('scroll', () => { if (!depthTimer) depthTimer = setTimeout(() => { depthTimer = 0; depth(); }, 250); }, { passive: true });
    addEventListener('load', depth);

    // key: a note that updates in place (like "stories: 3 of 6"); the same note again counts up
    window.visitNote = function (text, key) {
        text = String(text).slice(0, 300);
        key = key || text;
        const n = st.notes.find(x => x.k === key);
        if (n) { if (n.t === text) n.n++; else n.t = text; }
        else if (st.notes.length < 40) st.notes.push({ k: key, t: text, n: 1 });
        save();
    };
    // a search is kept once the visitor stops typing; "סבת" then "סבתא" keeps only "סבתא"
    let searchTimer = 0, typed = '';
    const keepSearch = () => {
        clearTimeout(searchTimer);
        if (typed.length < 2) return;
        const term = typed;
        typed = '';
        st.q = st.q.filter(x => !term.startsWith(x) && !x.startsWith(term)).concat(term).slice(-15);
        save();
    };
    window.visitSearch = function (term) {
        clearTimeout(searchTimer);
        typed = String(term).trim().slice(0, 60);
        searchTimer = setTimeout(keepSearch, 1200);
    };

    const CLICKS = [
        ['[data-cv]', 'פתחו את הקורות חיים'],
        ['[data-stories]', 'פתחו את הסטוריז של מילים של מבוגרים'],
        ['a[href^="mailto:"]', 'לחצו על המייל ✉️'],
        ['[data-email] button', 'העתיקו את כתובת המייל 📋'],
        ['a[href^="tel:"]', 'לחצו על מספר הטלפון 📞'],
        ['a[href*="instagram.com"]', 'עברו לאינסטגרם'],
        ['.icq-all', 'לחצו להציג את כל השיחה בבת אחת'],
        ['.t-word', 'ערבבו את המילה האקראית'],
        ['#rand', 'לחצו על "מילה אקראית" במילון'],
        ['[data-suggest], #suggest-any', 'לחצו להציע מילה ✉️'],
        ['[data-veggies]', 'לחצו על השם (וקיבלו פירות וירקות)'],
        ['a[href*="demo/"]', 'פתחו הדגמה של אתר'],
    ];
    const wordsTapped = [];
    document.addEventListener('click', (e) => {
        const el = e.target.closest && e.target.closest('a, button, .sticker');
        if (!el) return;
        const rule = CLICKS.find(([sel]) => el.matches(sel));
        if (rule) window.visitNote(rule[1]);
        // the words they opened, on the band, the stickers or in the dictionary
        if (el.matches('#wb-track button, .sticker, .tag')) {
            const w = el.textContent.trim();
            if (w && !wordsTapped.includes(w) && wordsTapped.length < 12) wordsTapped.push(w);
            window.visitNote('פתחו מילים: ' + wordsTapped.join(', '), 'words');
        }
        // moving to another page of the site isn't leaving; a new tab takes the visit code along
        if (el.tagName === 'A' && el.href) {
            const url = new URL(el.href, location.href);
            if (url.origin === location.origin && url.pathname !== location.pathname) {
                if (el.target === '_blank') { url.searchParams.set('v', st.id); el.href = url.href; }
                else { st.nav = Date.now(); save(); }
            }
        }
    }, true);
    document.addEventListener('pointerdown', (e) => {
        if (e.target.closest && e.target.closest('.sticker')) window.visitNote('שיחקו עם הסטיקרים');
    }, true);

    // the summary goes out when the visitor leaves or switches away, and again later only if they did more
    function summary() {
        keepSearch();
        tick();
        depth();
        save();
        if (Date.now() - st.nav < 4000) return;
        const total = st.pages.reduce((s, p) => s + p.ms, 0);
        const sig = JSON.stringify([st.pages.length, Math.floor(total / 60000), st.pages.map(p => Math.floor(p.d / 25)), st.notes.map(n => [n.k, n.t, n.n]), st.q]);
        if (sig === st.sig) return;
        const update = !!st.sig;
        st.sig = sig;
        save();
        send('/visit-summary', {
            id: st.id, update, ref: st.ref, from: st.from, total: Math.round(total / 1000),
            pages: st.pages.map(p => ({ p: p.p, s: Math.round(p.ms / 1000), d: p.d })),
            notes: st.notes.map(n => n.n > 1 ? `${n.t} (×${n.n})` : n.t),
            q: st.q,
        }, true);
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { summary(); shownAt = 0; }
        else shownAt = Date.now();
    });
    addEventListener('pagehide', () => { summary(); shownAt = 0; });
})();
