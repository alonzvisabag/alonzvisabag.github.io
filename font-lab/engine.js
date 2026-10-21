// בית היציקה: the letter engine. Every Hebrew letter is a skeleton of named strokes (roof, stem, base, spur...)
// that is turned into an outline from the font settings. Used by the tool on this page and by its tile on the main page.
(function () {
    // ═════════ the letters ═════════
    // Every letter is a skeleton of strokes in its own box: u runs 0 (left) to 1 (right), v runs 0 (baseline) to 1 (letter height).
    // Points sit on the middle of the stroke; each segment is named after the part of the letter it is (roof, stem, base...),
    // which is how the sliders and the "מה זה מה" list find it. w is the letter's width as a share of the letter height.
    function S() { const a = [...arguments]; return { pts: a.filter(x => Array.isArray(x)), roles: a.filter(x => typeof x === 'string') }; }
    function C() { const s = S.apply(null, arguments); s.closed = true; return s; }
    const LETTERS = {
        'א': { w: 0.92, draw: ({ P }) => [S(P(0, 1), 'diag', P(1, 0)), S(P(1, 1), 'stem', P(1, 0.58), 'diag', P(0.6, 0.4)), S(P(0.3, 0.7), 'leg', P(0.06, 0))] },
        'ב': { w: 0.84, spur: 1, draw: ({ P, ov }) => [S(P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0)), S(P(0, 0), 'base', P(1, 0), 'spur', P(1, 0, ov))] },
        'ג': { w: 0.6, draw: ({ P }) => [S(P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0)), S(P(1, 0.46), 'leg', P(0, 0))] },
        'ד': { w: 0.8, spur: 1, draw: ({ P, ov }) => [S(P(0, 1), 'roof', P(1, 1), 'spur', P(1, 1, ov)), S(P(1, 1), 'stem', P(1, 0))] },
        'ה': { w: 0.84, draw: ({ P, x, legTop }) => [S(P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0)), S([x(0), legTop], 'leg', P(0, 0))] },
        'ו': { w: 0.3, draw: ({ P }) => [S(P(0, 1), 'head', P(1, 1), 'stem', P(1, 0))] },
        'ז': { w: 0.5, draw: ({ P }) => [S(P(0, 1), 'head', P(1, 1)), S(P(0.55, 1), 'stem', P(0.55, 0))] },
        'ח': { w: 0.84, draw: ({ P }) => [S(P(0, 0), 'stem', P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0))] },
        'ט': { w: 0.84, rk: 1.5, draw: ({ P }) => [S(P(0, 1), 'stem', P(0, 0), 'base', P(1, 0), 'stem', P(1, 1), 'hook', P(0.52, 1), 'hook', P(0.52, 0.6))] },
        'י': { w: 0.3, draw: ({ P }) => [S(P(0, 1), 'head', P(1, 1), 'stem', P(1, 0.5))] },
        'ך': { w: 0.78, rk: 1.4, draw: ({ P, x, yD }) => [S(P(0, 1), 'roof', P(1, 1), 'desc', [x(1), yD])] },
        'כ': { w: 0.74, rk: 1.6, draw: ({ P }) => [S(P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0), 'base', P(0, 0))] },
        'ל': { w: 0.74, asc: 1, draw: ({ P, x, yA }) => [S([x(0), yA], 'asc', P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0.42), 'leg', P(0.4, 0))] },
        'ם': { w: 0.84, draw: ({ P }) => [C(P(0, 0), 'stem', P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0), 'base')] },
        'מ': { w: 0.88, draw: ({ P }) => [S(P(0.3, 1), 'diag', P(0, 0.6), 'stem', P(0, 0), 'base', P(1, 0), 'stem', P(1, 1), 'roof', P(0.5, 1))] },
        'ן': { w: 0.3, draw: ({ P, x, yD }) => [S(P(0, 1), 'head', P(1, 1), 'desc', [x(1), yD])] },
        'נ': { w: 0.54, rk: 1.2, draw: ({ P }) => [S(P(0, 1), 'head', P(1, 1), 'stem', P(1, 0), 'base', P(0, 0))] },
        'ס': { w: 0.84, rk: 2.4, draw: ({ P }) => [C(P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0), 'base', P(0, 0), 'stem')] },
        'ע': { w: 0.84, draw: ({ P }) => [S(P(1, 1), 'stem', P(1, 0), 'base', P(0, 0)), S(P(0.04, 1), 'diag', P(0.66, 0))] },
        'פ': { w: 0.84, rk: 1.4, draw: ({ P }) => [S(P(0, 0.56), 'hook', P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0), 'base', P(0, 0))] },
        'ף': { w: 0.8, rk: 1.2, draw: ({ P, x, yD }) => [S(P(0, 0.56), 'hook', P(0, 1), 'roof', P(1, 1), 'desc', [x(1), yD])] },
        'צ': { w: 0.82, draw: ({ P }) => [S(P(0, 1), 'diag', P(0.32, 0), 'base', P(1, 0)), S(P(1, 1), 'stem', P(1, 0.64), 'diag', P(0.22, 0.32))] },
        'ץ': { w: 0.8, draw: ({ P, x, yD }) => [S(P(1, 1), 'stem', P(1, 0.62), 'diag', P(0.6, 0.38), 'desc', [x(0.6), yD]), S(P(0, 1), 'diag', P(0.6, 0.38))] },
        'ק': { w: 0.84, draw: ({ P, x, yD, legTop }) => [S(P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0)), S([x(0), legTop], 'desc', [x(0), yD])] },
        'ר': { w: 0.78, rk: 1.7, draw: ({ P }) => [S(P(0, 1), 'roof', P(1, 1), 'stem', P(1, 0))] },
        'ש': { w: 0.96, draw: ({ P }) => [S(P(0, 1), 'stem', P(0, 0), 'base', P(1, 0), 'stem', P(1, 1)), S(P(0.5, 1), 'stem', P(0.5, 0))] },
        'ת': { w: 0.9, draw: ({ P }) => [S(P(0.14, 1), 'roof', P(1, 1), 'stem', P(1, 0)), S(P(0.14, 1), 'leg', P(0.14, 0), 'base', P(0, 0))] },
    };
    const ABC = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ';

    // ═════════ from skeleton to outline ═════════
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
    const len = (a) => Math.hypot(a[0], a[1]);
    const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    const area = (ring) => ring.reduce((s, p, i) => s + cross(p, ring[(i + 1) % ring.length]), 0) / 2;
    function meet(p, d, q, e) {
        const den = cross(d, e);
        if (Math.abs(den) < 1e-9) return null;
        const t = cross(sub(q, p), e) / den;
        return [p[0] + d[0] * t, p[1] + d[1] * t];
    }

    // one stroke → filled rings (an outer one, plus an inner one for a closed loop) and the pieces each part covers
    function outline(s, th, tv) {
        const pts = s.pts, n = pts.length, closed = !!s.closed;
        const segs = [];
        for (let i = 0; i < (closed ? n : n - 1); i++) {
            const a = pts[i], b = pts[(i + 1) % n], d = unit(sub(b, a));
            // horizontal strokes take the horizontal weight, vertical ones the vertical weight, slanted ones a mix
            segs.push({ a, b, d, w: th * d[0] * d[0] + tv * d[1] * d[1], role: s.roles[i] || s.roles[s.roles.length - 1], horiz: Math.abs(d[0]) > Math.abs(d[1]) });
        }
        const left = (d) => [-d[1], d[0]];
        const off = (p, d, w, side) => { const nn = left(d); return [p[0] + nn[0] * w / 2 * side, p[1] + nn[1] * w / 2 * side]; };
        function joint(prev, next, at, side) {
            const pa = off(at, prev.d, prev.w, side), pb = off(at, next.d, next.w, side);
            const m = meet(pa, prev.d, pb, next.d);
            if (!m || len(sub(m, at)) > 2.2 * Math.max(prev.w, next.w)) return pb;
            return m;
        }
        // a free end reaches the outer edge of the strokes it lines up with
        const reach = (sg) => (th / 2) * Math.abs(sg.d[1]) + (tv / 2) * Math.abs(sg.d[0]);
        const L = [], R = [], W = [];
        if (closed) {
            for (let k = 0; k < n; k++) {
                const prev = segs[(k - 1 + n) % n], next = segs[k];
                L.push(joint(prev, next, pts[k], 1)); R.push(joint(prev, next, pts[k], -1)); W.push(Math.max(prev.w, next.w));
            }
        } else {
            const s0 = segs[0], sl = segs[segs.length - 1];
            const p0 = [pts[0][0] - s0.d[0] * reach(s0), pts[0][1] - s0.d[1] * reach(s0)];
            const pn = [pts[n - 1][0] + sl.d[0] * reach(sl), pts[n - 1][1] + sl.d[1] * reach(sl)];
            L.push(off(p0, s0.d, s0.w, 1)); R.push(off(p0, s0.d, s0.w, -1)); W.push(s0.w);
            for (let k = 1; k < n - 1; k++) {
                L.push(joint(segs[k - 1], segs[k], pts[k], 1)); R.push(joint(segs[k - 1], segs[k], pts[k], -1)); W.push(Math.max(segs[k - 1].w, segs[k].w));
            }
            L.push(off(pn, sl.d, sl.w, 1)); R.push(off(pn, sl.d, sl.w, -1)); W.push(sl.w);
        }
        const pieces = segs.map((sg, k) => ({
            role: sg.role, horiz: sg.horiz, end: !closed && (k === 0 || k === segs.length - 1),
            quad: [L[k], L[(k + 1) % L.length], R[(k + 1) % R.length], R[k]],
        }));
        let rings;
        if (closed) {
            let outer = L, inner = R;
            if (Math.abs(area(R)) > Math.abs(area(L))) { outer = R; inner = L; }
            const o = { pts: outer.slice(), kind: outer.map(() => 'joint'), w: W.slice() };
            const h = { pts: inner.slice(), kind: inner.map(() => 'joint'), w: W.slice() };
            if (area(o.pts) < 0) { o.pts.reverse(); o.w.reverse(); }
            if (area(h.pts) > 0) { h.pts.reverse(); h.w.reverse(); }
            rings = [o, h];
        } else {
            const ring = { pts: L.concat(R.slice().reverse()), kind: [], w: W.concat(W.slice().reverse()) };
            ring.kind = ring.pts.map((_, i) => (i === 0 || i === n - 1 || i === n || i === 2 * n - 1) ? 'cap' : 'joint');
            if (area(ring.pts) < 0) { ring.pts.reverse(); ring.kind.reverse(); ring.w.reverse(); }
            rings = [ring];
        }
        return { rings, pieces };
    }

    // round each corner of a ring: outer corners by the corner radius, inner ones by what is left of it after the stroke,
    // the ends of strokes by the terminal setting
    const f1 = (v) => Math.round(v * 10) / 10;
    function ringPath(ring, ro, terminal) {
        const p = ring.pts, n = p.length, parts = [];
        for (let i = 0; i < n; i++) {
            const a = p[(i - 1 + n) % n], v = p[i], b = p[(i + 1) % n];
            const l1 = len(sub(v, a)), l2 = len(sub(b, v));
            const d1 = unit(sub(v, a)), d2 = unit(sub(b, v));
            const turn = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
            let r = ring.kind[i] === 'cap' ? terminal * ring.w[i] : (cross(d1, d2) > 0 ? ro : Math.max(0, ro - ring.w[i]));
            if (r > 0.5 && turn > 0.03 && turn < 3.1 && l1 > 0.5 && l2 > 0.5) {
                const t = Math.min(r * Math.tan(turn / 2), l1 * 0.5, l2 * 0.5);
                parts.push({ A: [v[0] - d1[0] * t, v[1] - d1[1] * t], C: v, B: [v[0] + d2[0] * t, v[1] + d2[1] * t] });
            } else parts.push({ A: v, C: null, B: v });
        }
        const P = (q) => f1(q[0]) + ' ' + f1(q[1]);
        let d = 'M' + P(parts[0].B);
        for (let i = 1; i <= n; i++) {
            const c = parts[i % n];
            d += 'L' + P(c.A);
            if (c.C) d += 'Q' + P(c.C) + ' ' + P(c.B);
        }
        return d + 'Z';
    }

    // ═════════ a glyph from the font settings (F) and this letter's own settings (L) ═════════
    function glyph(ch, F, L) {
        const def = LETTERS[ch];
        if (!def) return null;
        L = L || {};
        const drop = F.height * (L.hd || 0);            // how far this letter reaches below the baseline
        const H = F.height * ((L.h || 1) + (L.hd || 0));
        const wt = F.weight * (L.wt || 1);
        const th = Math.max(4, wt * (1 + F.contrast)), tv = Math.max(4, wt * (1 - F.contrast));
        const W = Math.max(tv * 1.8, def.w * F.height * F.width * (L.w || 1));
        const ov = def.spur ? F.spur * F.height : 0;
        const x = (u) => tv / 2 + u * (W - tv);
        const y = (v) => -drop + th / 2 + v * (H - th);
        const P = (u, v, dx) => [x(u) + (dx || 0), y(v)];
        const yD = -drop - F.desc + th / 2, yA = H - drop + F.asc - th / 2;
        // the free leg of ה and ק always keeps a clear gap under the roof, however heavy the strokes get (or it reads as ח)
        const legTop = Math.min(y(0.64), y(1) - th - Math.max(0.16 * H, 0.6 * th));
        // a part that is switched off (a spur at zero) leaves no zero-length piece behind
        const strokes = def.draw({ P, x, y, yD, yA, ov, legTop }).map(s => {
            const pts = [s.pts[0]], roles = [];
            for (let i = 1; i < s.pts.length; i++) {
                if (len(sub(s.pts[i], pts[pts.length - 1])) < 0.5) continue;
                pts.push(s.pts[i]); roles.push(s.roles[i - 1]);
            }
            if (s.closed) roles.push(s.roles[s.roles.length - 1]);
            return { pts, roles, closed: s.closed };
        }).filter(s => s.pts.length > 1);
        // the serif: a short tick down from the left end of a roof
        if (F.serif > 0.01) strokes.slice().forEach(s => {
            const [a, b] = s.pts;
            if (!s.closed && (s.roles[0] === 'roof' || s.roles[0] === 'head') && b[0] > a[0] && Math.abs(b[1] - a[1]) < 0.5)
                strokes.push({ pts: [a, [a[0], a[1] - F.serif * 0.3 * Math.min(H, 700)]], roles: ['serif'] });
        });
        const slant = Math.tan(F.slant * Math.PI / 180);
        const lean = (q) => [q[0] + q[1] * slant, q[1]];
        const ro = F.round * 0.42 * Math.min(H, W) * (def.rk || 1);
        const paths = [], pieces = [];
        strokes.forEach(s => {
            const o = outline(s, th, tv);
            o.rings.forEach(r => { r.pts = r.pts.map(lean); paths.push(ringPath(r, ro, F.terminal)); });
            o.pieces.forEach(pc => pieces.push({ role: pc.role, horiz: pc.horiz, end: pc.end, d: 'M' + pc.quad.map(lean).map(q => f1(q[0]) + ' ' + f1(q[1])).join('L') + 'Z' }));
        });
        const sb = 0.06 * F.height;
        return { ch, W, H, top: H - drop, bot: -drop, ov, sb, adv: W + ov + 2 * sb, d: paths.join(''), pieces, asc: !!def.asc, desc: /[קךןףץ]/.test(ch) };
    }

    // a line of letters, right to left
    function setLine(text, F, overrides) {
        const items = [...text].map((ch, i) => {
            const L = (overrides && overrides[i]) || {};
            const g = glyph(ch, F, L);
            return { ch, i, L, g, adv: g ? g.adv : F.height * 0.34 };
        });
        let cursor = 0;
        items.forEach((it, k) => {
            it.x0 = cursor - it.adv;
            cursor = it.x0 - (k < items.length - 1 ? F.track + (it.L.sp || 0) : 0);
        });
        const total = -cursor;
        items.forEach(it => { it.x0 += total; });
        return { items, total };
    }

    // the starting settings of the font
    const DEF = { height: 620, width: 1, desc: 230, asc: 210, weight: 84, contrast: 0.22, round: 0.3, terminal: 0, spur: 0.1, serif: 0, slant: 0, track: 30 };

    window.Foundry = { LETTERS, ABC, glyph, setLine, f1, DEF };
})();
