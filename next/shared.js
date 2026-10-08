// Shared by the design previews: the opening CV that folds into a paper plane and flies to the
// CV button (once per browser), the CV magnifier, and the vegetable burst on the name.
// Load it right after <body> so a first-time visitor sees the CV before anything else.
(function () {
    let seen = false;
    try { seen = !!localStorage.getItem('intro-seen'); } catch (e) {}

    document.body.insertAdjacentHTML('afterbegin', `
        <div id="cv-overlay"${seen ? ' style="display:none"' : ''}>
            <div id="cv-paper">
                <div id="cv-lens"></div>
                <img src="cv.jpg.jpg" alt="קורות חיים - אלון צבי סבג" id="cv-img">
            </div>
            <button id="cv-skip" type="button">דלג/י ←</button>
        </div>
        <div id="paper-plane" aria-hidden="true">
            <svg viewBox="0 0 64 40">
                <path d="M62 20 L2 6 L20 22 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>
                <path d="M62 20 L20 22 L26 34 Z" fill="#d6d6d6" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
        </div>`);

    const overlay = document.getElementById('cv-overlay');
    const paper   = document.getElementById('cv-paper');
    const plane   = document.getElementById('paper-plane');
    const skipBtn = document.getElementById('cv-skip');
    let cvBtn = null;

    let sent = seen;      // the plane has landed once (or on an earlier visit)
    let flying = false;
    const waiting = [];

    // Pages call Intro.whenDone(fn): fn(true) right away for a returning visitor, fn(false) after the landing.
    window.Intro = {
        seen,
        whenDone(fn) { if (sent) fn(true); else waiting.push(fn); }
    };

    function launch() {
        if (flying) return;
        flying = true;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            overlay.style.display = 'none';
            land();
            return;
        }
        // the page folds up and tips over while the dark backdrop fades
        skipBtn.style.visibility = 'hidden';
        overlay.style.transition = 'background-color 0.6s';
        overlay.style.backgroundColor = 'rgba(0,0,0,0)';
        paper.animate([
            { transform: 'scale(1) rotateX(0deg) rotate(0deg)', opacity: 1 },
            { transform: 'scale(0.5) rotateX(55deg) rotate(-8deg)', opacity: 1, offset: 0.55 },
            { transform: 'scale(0.06) rotateX(80deg) rotate(-25deg)', opacity: 0 }
        ], { duration: 650, easing: 'ease-in', fill: 'forwards' }).onfinish = fly;
    }

    // a paper plane takes off from where the page was and swoops up to the CV button
    function fly() {
        const pr = paper.getBoundingClientRect();
        const br = cvBtn.getBoundingClientRect();
        const sx = pr.left + pr.width / 2, sy = pr.top + pr.height / 2;
        const ex = br.left + br.width / 2, ey = br.top + br.height / 2;
        overlay.style.display = 'none';

        const c1x = sx - innerWidth * 0.3,  c1y = sy + innerHeight * 0.25;
        const c2x = ex - innerWidth * 0.15, c2y = ey + innerHeight * 0.5;
        const at    = (t, a, b, c, d) => { const u = 1 - t; return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d; };
        const slope = (t, a, b, c, d) => { const u = 1 - t; return 3*u*u*(b - a) + 6*u*t*(c - b) + 3*t*t*(d - c); };

        const duration = 1300;
        const big = innerWidth > 700 ? 1.5 : 1.1;
        const start = performance.now();
        plane.style.opacity = '0';
        plane.style.display = 'block';

        function frame(now) {
            const t = Math.min((now - start) / duration, 1);
            const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const x = at(e, sx, c1x, c2x, ex);
            const y = at(e, sy, c1y, c2y, ey);
            const angle = Math.atan2(slope(e, sy, c1y, c2y, ey), slope(e, sx, c1x, c2x, ex));
            plane.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad) scale(${big - (big - 0.3) * e})`;
            plane.style.opacity   = t > 0.88 ? (1 - t) / 0.12 : Math.min(1, t / 0.08);
            if (t < 1) {
                requestAnimationFrame(frame);
            } else {
                plane.style.display = 'none';
                land();
            }
        }
        requestAnimationFrame(frame);
    }

    // the CV button catches the plane
    function land() {
        flying = false;
        skipBtn.style.visibility = '';
        cvBtn.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(1.45) rotate(-6deg)' },
            { transform: 'scale(1)' }
        ], { duration: 450, easing: 'ease-out' });
        if (!sent) {
            sent = true;
            try { localStorage.setItem('intro-seen', '1'); } catch (e) {}
            waiting.splice(0).forEach(fn => setTimeout(() => fn(false), 300));
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        cvBtn = document.querySelector('[data-cv]');

        const autoTimer = seen ? null : setTimeout(launch, 2000);
        skipBtn.addEventListener('click', () => { clearTimeout(autoTimer); launch(); });

        // tapping outside a reopened CV folds it up and flies it back
        overlay.addEventListener('click', (e) => {
            if (sent && !paper.contains(e.target) && e.target !== skipBtn) launch();
        });

        document.querySelectorAll('[data-cv]').forEach(btn => btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (flying) return;
            paper.getAnimations().forEach(a => a.cancel());
            overlay.style.transition = 'none';
            overlay.style.backgroundColor = '';
            overlay.style.display = 'flex';
        }));

        // magnifier over the CV (mouse only)
        const lens = document.getElementById('cv-lens');
        const img  = document.getElementById('cv-img');
        paper.addEventListener('mousemove', (e) => {
            const r = img.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top, zoom = 1.7, R = 170;
            lens.style.left = (x - R) + 'px';
            lens.style.top  = (y - R) + 'px';
            lens.style.backgroundImage    = `url('cv.jpg.jpg')`;
            lens.style.backgroundSize     = `${r.width * zoom}px ${r.height * zoom}px`;
            lens.style.backgroundPosition = `${-(x * zoom - R)}px ${-(y * zoom - R)}px`;
            lens.style.display = 'block';
        });
        paper.addEventListener('mouseleave', () => { lens.style.display = 'none'; });

        // vegetables burst out of the name
        const veggies = ['🍐','🥬','🌶️','🍇','🥦','🍑','🫘','🥑','🥕','🌽','🍅','🧅','🫑','🥒','🍆','🧄','🌿','🥝'];
        document.querySelectorAll('[data-veggies]').forEach(el => el.addEventListener('click', (e) => {
            e.preventDefault();
            for (let i = 0; i < 40; i++) {
                const v = document.createElement('div');
                v.textContent = veggies[Math.floor(Math.random() * veggies.length)];
                v.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;font-size:${20 + Math.random() * 30}px;pointer-events:none;z-index:9999;user-select:none;`;
                document.body.appendChild(v);
                const a = Math.random() * 2 * Math.PI, d = 120 + Math.random() * 500;
                v.animate([
                    { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
                    { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) rotate(${(Math.random() - 0.5) * 1080}deg)`, opacity: 0 }
                ], { duration: 600 + Math.random() * 800, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'forwards' }).onfinish = () => v.remove();
            }
        }));

        // reveal-on-scroll for anything marked [data-reveal]
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const io = 'IntersectionObserver' in window && !still ? new IntersectionObserver((entries) => {
            entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
        }, { rootMargin: '0px 0px -8% 0px' }) : null;
        document.querySelectorAll('[data-reveal]').forEach(el => io ? io.observe(el) : el.classList.add('in'));
    });
})();
