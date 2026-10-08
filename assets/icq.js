// The cover letter as an old-school ICQ-style chat. Messages arrive one by one (with "typing...")
// once the window scrolls into view. Usage: <div data-icq></div> plus icq.css.
(function () {
    const CHAT = [
        ['alon', 'שלום,'],
        ['alon', 'אם אתם מחפשים קורות חיים עם חמש שנות ניסיון במשרד פרסום, כנראה ששלי לא ירשימו אתכם במבט ראשון. אבל אם אתם מחפשים את האדם שמבין שפרסום הוא שילוב של פסיכולוגיה עמוקה ושורה תחתונה עסקית - אז יש לי חדשות טובות בשבילכם.'],
        ['alon', 'אני סטודנט שנה ב׳ לפסיכולוגיה ומנהל עסקים ברופין. השילוב הזה הוא לא מקרי. הפסיכולוגיה נותנת לי את המפתחות להבנת הצרכן, הטריגרים הרגשיים וקבלת ההחלטות, ומנהל העסקים מאפשר לי לראות את התמונה הגדולה - אסטרטגיה, שיווק ויעדים עסקיים. אלו הכלים הדרושים כדי לגשר בין צרכי הלקוח למעוף של מחלקת הקריאייטיב.'],
        ['alon', 'הוכחה סבירה: ״מילים של מבוגרים״ - עמוד אינסטגרם הומוריסטי שהקמתי ובו מעל 100 מונחים שאספתי בפינצטה (והיד עוד נטויה...). שם למדתי בדרך המהנה איך בונים שפה מותגית ואיך הופכים תובנה אנושית פשוטה לתוכן שגורם לאנשים לעצור, לצחוק ולשתף.'],
        ['alon', 'בתחילת המלחמה, בין הקפצה לרגיעה, חשבתי על חקלאי הצפון. רציתי לעשות משהו. הרעיון: קולקציית ביגוד ירקות וחרוזים, שרווחיה ייתרמו לחקלאים שנפגעו מהמלחמה. לקחתי עט ופנקס - והאיורים שאתם רואים פה הם התוצאה.'],
        ['alon', 'ולאחרונה בניתי גם שני אתרים, לשני האנשים שהכי חשובים לי. לבת הזוג שלי, כשעברה לגור בחו״ל: מכתבים מהחברים שלה שנפתחים לפי סיטואציה. ולאמא שלי, ליום ההולדת ה-60: אתר בהפתעה שאסף 32 ברכות בשבוע אחד. את הרעיון, המילים והחוויה עשיתי אני. את הקוד בעזרת בינה מלאכותית. ושתיהן ממש התרגשו.'],
        ['alon', 'אני רוצה להיות קופירייטר בעתיד, אבל אני מבין שכדי לכתוב מילים שמוכרות, אני חייב קודם ללמוד את המערכת מלמטה. האמת? אני עוד לא יודע באיזה תפקיד אני רוצה להתחיל אצלכם. קופי, קריאייטיב, אסטרטגיה, ניהול לקוח. כל אחד מהם מושך אותי מסיבה אחרת. ואני חושב שזה דווקא יתרון: אני מוכן להתחיל מכל מקום, וללמוד את כל המקומות.'],
        ['alon', 'אני מחפש להיכנס למשרד פרסום, ללמוד איך קמפיין נולד ולהיות מאסטר של הפרטים הקטנים. אני מגיע עם רעב גדול, אפס התנצלות על חוסר הניסיון הפורמלי, ומקסימום מוטיבציה להוכיח שהשילוב בין הבנה פסיכולוגית לחוש עסקי הוא מה שאתם צריכים במשרד.'],
        ['alon', 'אשמח מאוד להזדמנות להציג את עצמי בראיון :)'],
        ['alon', 'אלון צבי סבג · <a href="tel:0538322416">053-8322416</a>']
    ];
    const NICK = { alon: 'אלון', you: 'אתם' };
    const EMAIL = ['alonzvi99', 'gmail.com'].join('@');   // put together here so it isn't sitting in the page for scrapers

    const FLOWER = `<svg class="icq-flower" viewBox="0 0 20 20" aria-hidden="true">${
        [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<ellipse cx="10" cy="4.6" rx="2.6" ry="4" fill="#3fae2a" stroke="#1d6b12" stroke-width=".6" transform="rotate(${a} 10 10)"/>`).join('')
    }<circle cx="10" cy="10" r="2.6" fill="#ffd21f" stroke="#a88a00" stroke-width=".6"/></svg>`;

    const time = () => new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const escape = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function build(host) {
        host.classList.add('icq');
        host.innerHTML = `
            <div class="icq-title">
                ${FLOWER}<span class="icq-title-text">שיחה עם אלון</span>
                <span class="icq-ctl" aria-hidden="true"><i>_</i><i>□</i><i>×</i></span>
            </div>
            <div class="icq-who">
                <span class="icq-dot"></span><b>אלון צבי סבג</b><span class="icq-status">מחובר</span>
            </div>
            <div class="icq-log" role="log" aria-live="polite"></div>
            <button type="button" class="icq-btn icq-all">להציג את כל השיחה ⏩</button>
            <form class="icq-send">
                <textarea rows="2" placeholder="כתבו לאלון..." aria-label="הודעה לאלון"></textarea>
                <button type="submit" class="icq-btn">שליחה</button>
            </form>`;

        const log = host.querySelector('.icq-log');
        const allBtn = host.querySelector('.icq-all');
        let next = 0, timer = null, started = false, typing = null;

        function add(from, html) {
            const msg = document.createElement('div');
            msg.className = 'icq-msg from-' + from;
            msg.innerHTML = `<div class="icq-head">${NICK[from]} (${time()}):</div><div class="icq-text">${html}</div>`;
            log.insertBefore(msg, typing);
            log.scrollTop = log.scrollHeight;
            if (from === 'alon') host.querySelector('.icq-flower').animate(
                [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }], { duration: 700 });
        }

        function setTyping(on) {
            if (on && !typing) {
                typing = document.createElement('div');
                typing.className = 'icq-typing';
                typing.textContent = 'אלון מקליד הודעה...';
                log.appendChild(typing);
                log.scrollTop = log.scrollHeight;
            } else if (!on && typing) {
                typing.remove();
                typing = null;
            }
        }

        function step() {
            if (next >= CHAT.length) { allBtn.hidden = true; return; }
            const [from, html] = CHAT[next];
            if (from === 'alon') {
                setTyping(true);
                const len = html.replace(/<[^>]+>/g, '').length;
                const typing = Math.min(2800, Math.max(900, 600 + len * 8));
                const reading = Math.min(3600, Math.max(700, len * 16));   // time to read it before the next one starts
                timer = setTimeout(() => { setTyping(false); add(from, html); next++; timer = setTimeout(step, reading); }, typing);
            } else {
                timer = setTimeout(() => { add(from, html); next++; timer = setTimeout(step, 500); }, 700);
            }
        }

        function showAll() {
            clearTimeout(timer);
            setTyping(false);
            while (next < CHAT.length) { add(CHAT[next][0], CHAT[next][1]); next++; }
            allBtn.hidden = true;
        }

        function start() {
            if (started) return;
            started = true;
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) showAll();
            else step();
        }

        allBtn.addEventListener('click', () => { started = true; showAll(); });

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((en) => {
                if (en.some(e => e.isIntersecting)) { io.disconnect(); start(); }
            }, { threshold: 0.35 });
            io.observe(host);
        } else {
            showAll();
        }

        // sending opens a ready email to Alon
        const form = host.querySelector('.icq-send');
        const box = form.querySelector('textarea');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = box.value.trim();
            if (!text) { box.focus(); return; }
            if (!started || next < CHAT.length) { started = true; showAll(); }
            add('you', escape(text).replace(/\n/g, '<br>'));
            box.value = '';
            setTyping(true);
            setTimeout(() => {
                setTyping(false);
                add('alon', 'איזה כיף! פתחתי לכם מייל מוכן אליי, רק ללחוץ שליחה ✉️');
                location.href = `mailto:${EMAIL}?subject=${encodeURIComponent('היי אלון, ראיתי את האתר')}&body=${encodeURIComponent(text)}`;
            }, 900);
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit();
        });
    }

    document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-icq]').forEach(build));
})();
