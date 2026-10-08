// The greetings as a slideshow, for a big screen at the party or for Galit on her phone:
// one greeting at a time, photos drift slowly, recordings and videos play by themselves
// and the show moves on when they end. Uses GROUPS and the *_EXT lists from index.html.
const Show = (() => {
  const $ = (id) => document.getElementById(id);
  const MAX_STEP_MS = 6 * 60 * 1000;
  const END_MS = 15000;

  const video = document.createElement('video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  const audio = document.createElement('audio');
  audio.preload = 'auto';

  let cards = [];
  let steps = [];
  let cur = 0;
  let isOpen = false;
  let started = false;
  let paused = false;
  let waitingForTap = false;
  let elapsed = 0;
  let lastTick = 0;
  let minMs = 0;
  let mediaEl = null;
  let mediaDone = true;
  let doneAt = 0;
  let textBox = null;
  let scrolling = false;
  let wakeLock = null;
  let idleTimer = null;
  let touchX = null;

  function kind(file){
    if(file.startsWith('data:image/')) return 'image';
    const ext = file.split('.').pop().toLowerCase();
    if(IMG_EXT.includes(ext)) return 'image';
    if(VIDEO_EXT.includes(ext)) return 'video';
    if(AUDIO_EXT.includes(ext)) return 'audio';
    return null;
  }

  function src(file){
    return mediaUrl(file);
  }

  // A greeting becomes one or more steps: first the words (with a photo beside them and
  // the first recording playing), then each video, extra recording and extra photo on its own.
  function buildSteps(list){
    const out = [];
    list.forEach((c, n) => {
      const imgs = c.media.filter(m => kind(m) === 'image');
      const vids = c.media.filter(m => kind(m) === 'video');
      const auds = c.media.filter(m => kind(m) === 'audio');
      const text = c.texts.join('\n\n');
      if(text || auds.length || (imgs.length && !vids.length)){
        out.push({ n, card: c, text, image: imgs.shift() || null, audio: auds.shift() || null });
      }
      auds.forEach(a => out.push({ n, card: c, audio: a }));
      vids.forEach(v => out.push({ n, card: c, video: v }));
      imgs.forEach(i => out.push({ n, card: c, image: i }));
    });
    out.push({ end: true });
    return out;
  }

  function el(tag, cls, text){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(text != null) e.textContent = text;
    return e;
  }

  function bars(count, cls){
    const b = el('span', 'bars' + (cls ? ' ' + cls : ''));
    for(let i = 0; i < count; i++) b.appendChild(el('i'));
    return b;
  }

  function stopMedia(){
    [video, audio].forEach(m => {
      m.onended = m.onerror = null;
      m.pause();
      m.removeAttribute('src');
      m.load();
    });
    mediaEl = null;
  }

  function textMs(text){
    return Math.min(45000, Math.max(7000, 5000 + text.length * 55));
  }

  function render(step){
    const stage = $('show-stage');
    stopMedia();
    stage.textContent = '';
    textBox = null;
    scrolling = false;
    waitingForTap = false;
    const card = el('article', 'show-card enter');

    if(step.end){
      card.classList.add('end');
      const inner = el('div', 'end-inner');
      const sprig = document.querySelector('.sprig');
      if(sprig) inner.appendChild(sprig.cloneNode(true));
      inner.append(el('h2', 'serif', 'מזל טוב, דפנה!'), el('p', null, `${cards.length} ברכות מכל האנשים שאוהבים אותך`), el('small', null, 'המצגת מתחילה שוב בעוד רגע'));
      card.appendChild(inner);
      minMs = END_MS;
    } else {
      const head = el('div', 'sc-head');
      head.appendChild(el('span', 'sc-name', step.card.from));
      const group = GROUPS.find(g => g.key === step.card.group);
      if(group) head.appendChild(el('span', 'g-tag ' + step.card.group, group.label));
      if(step.audio && step.image) head.appendChild(bars(4, 'small'));
      card.appendChild(head);

      const body = el('div', 'sc-body');
      let visual = null;
      minMs = step.text ? textMs(step.text) : 0;
      if(step.video){
        visual = el('div', 'sc-media');
        video.src = src(step.video);
        visual.appendChild(video);
        mediaEl = video;
        minMs = Math.max(minMs, 2500);
      } else if(step.image){
        visual = el('div', 'sc-media');
        const img = el('img');
        img.alt = '';
        img.src = src(step.image);
        img.onerror = () => { visual.remove(); card.classList.add('text-only'); fitText(); };
        visual.appendChild(img);
        minMs = Math.max(minMs, step.text ? 8000 : 7000);
        img.style.animationDuration = (minMs / 1000 + 3) + 's';
      } else if(step.audio){
        visual = el('div', 'sc-media sc-voice');
        visual.append(bars(7), el('span', null, 'הקלטה קולית'));
        minMs = Math.max(minMs, 2500);
      }
      if(visual) body.appendChild(visual);
      if(step.text){
        textBox = el('div', 'sc-text');
        textBox.appendChild(el('div', 'sc-text-inner', step.text));
        body.appendChild(textBox);
      }
      if(step.audio){
        audio.src = src(step.audio);
        mediaEl = audio;
      }
      card.classList.toggle('text-only', !visual);
      card.classList.toggle('long', !!step.text && step.text.length > 220);
      card.classList.toggle('media-only', !step.text);
      card.appendChild(body);
    }

    stage.appendChild(card);
    fitText();
    elapsed = 0;
    doneAt = 0;
    mediaDone = !mediaEl;
    if(mediaEl){
      const m = mediaEl;
      m.onended = () => { mediaDone = true; };
      m.onerror = () => {
        mediaDone = true;
        minMs = Math.max(minMs, 3000);
        if(m === video) card.querySelector('.sc-media').appendChild(el('div', 'sc-broken', 'את הסרטון הזה אי אפשר להציג במכשיר הזה'));
      };
      if(!paused) playMedia();
    }
    $('show-count').textContent = step.end ? '' : `${step.n + 1} / ${cards.length}`;
    $('show-progress').style.width = '0';
    const next = steps[cur + 1];
    if(next && next.image) new Image().src = src(next.image);
  }

  function playMedia(){
    const m = mediaEl;
    const p = m.play();
    if(p) p.catch((e) => {
      // Some browsers only play sound after a tap; wait for one instead of skipping the greeting.
      if(e.name !== 'NotAllowedError' || m !== mediaEl) return;
      waitingForTap = true;
      const btn = el('button', 'sc-tap');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'להפעיל');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        btn.remove();
        waitingForTap = false;
        m.play().catch(() => {});
      });
      $('show-stage').querySelector('.show-card').appendChild(btn);
    });
  }

  // Largest font that fits; a letter too long even at the smallest size scrolls slowly instead.
  function fitText(){
    if(!textBox || !textBox.isConnected) return;
    const inner = textBox.firstChild;
    const vmin = Math.min(innerWidth, innerHeight) / 100;
    const textOnly = !!textBox.closest('.text-only');
    let hi = Math.max(20, (textOnly ? 7 : 4.6) * vmin);
    let lo = Math.max(15, 2.2 * vmin);
    const fits = () => textBox.scrollHeight <= textBox.clientHeight + 1;
    inner.style.fontSize = hi + 'px';
    if(!fits()){
      let best = lo;
      for(let i = 0; i < 9; i++){
        const mid = (lo + hi) / 2;
        inner.style.fontSize = mid + 'px';
        if(fits()){ best = mid; lo = mid; } else hi = mid;
      }
      inner.style.fontSize = best + 'px';
    }
    scrolling = !fits();
    textBox.scrollTop = 0;
  }

  function tick(now){
    if(!isOpen) return;
    requestAnimationFrame(tick);
    const dt = lastTick ? Math.min(now - lastTick, 250) : 0;
    lastTick = now;
    if(!started || paused || waitingForTap) return;
    elapsed += dt;
    const mediaMs = mediaEl && isFinite(mediaEl.duration) ? mediaEl.duration * 1000 : 0;
    const total = Math.max(minMs, mediaMs);
    const at = Math.max(elapsed, mediaEl ? mediaEl.currentTime * 1000 : 0);
    $('show-progress').style.width = (total ? Math.min(1, at / total) * 100 : 100) + '%';
    if(scrolling && textBox){
      const t = Math.min(1, Math.max(0, (elapsed / minMs - 0.12) / 0.76));
      textBox.scrollTop = t * (textBox.scrollHeight - textBox.clientHeight);
    }
    if((elapsed >= minMs && mediaDone) || elapsed > MAX_STEP_MS){
      if(!doneAt) doneAt = elapsed;
      if(elapsed - doneAt > 900) go(cur + 1);
    }
  }

  function go(i){
    cur = i >= steps.length ? 0 : Math.max(0, i);
    render(steps[cur]);
    wake();
  }

  function setPaused(p){
    paused = p;
    $('show').classList.toggle('paused', p);
    $('show-pause').innerHTML = p
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>';
    $('show-pause').setAttribute('aria-label', p ? 'המשך' : 'עצירה');
    if(mediaEl && !waitingForTap){
      if(p) mediaEl.pause();
      else if(!mediaDone) playMedia();
    }
    wake();
  }

  // Controls fade away while the show runs, and come back on any touch, move or key.
  function wake(){
    $('show').classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if(!paused && started) $('show').classList.add('idle'); }, 2800);
  }

  async function keepAwake(){
    try{ wakeLock = await navigator.wakeLock.request('screen'); } catch(e){ wakeLock = null; }
  }

  function start(){
    started = true;
    // Unlock sound for the whole show while we are inside a tap.
    [video, audio].forEach(m => { const p = m.play(); if(p) p.catch(() => {}); m.pause(); });
    if(document.documentElement.requestFullscreen && matchMedia('(hover: hover)').matches){
      document.documentElement.requestFullscreen().catch(() => {});
    }
    keepAwake();
    $('show-start').hidden = true;
    $('show-stage').hidden = false;
    setPaused(false);
    go(0);
  }

  function open(list){
    if(isOpen || !list.length) return;
    cards = list;
    steps = buildSteps(list);
    isOpen = true;
    started = false;
    $('show-summary').textContent = `${list.length} ברכות מכל האנשים שאוהבים אותך`;
    $('show-start').hidden = false;
    $('show-stage').hidden = true;
    $('show-stage').textContent = '';
    $('show-progress').style.width = '0';
    $('show-count').textContent = '';
    $('show').hidden = false;
    document.documentElement.style.overflow = 'hidden';
    history.pushState({ show: true }, '');
    lastTick = 0;
    requestAnimationFrame(tick);
    wake();
  }

  function close(){
    if(!isOpen) return;
    isOpen = false;
    started = false;
    stopMedia();
    clearTimeout(idleTimer);
    $('show').hidden = true;
    $('show').classList.remove('idle', 'paused');
    $('show-stage').textContent = '';
    document.documentElement.style.overflow = '';
    if(document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if(wakeLock){ wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  function requestClose(){
    if(history.state && history.state.show) history.back();
    else close();
  }

  addEventListener('popstate', close);
  document.addEventListener('visibilitychange', () => {
    if(isOpen && started && document.visibilityState === 'visible') keepAwake();
  });
  addEventListener('resize', () => { if(isOpen) fitText(); });
  addEventListener('keydown', (e) => {
    if(!isOpen) return;
    wake();
    if(!started){
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); start(); }
      else if(e.key === 'Escape') requestClose();
      return;
    }
    if(e.key === 'ArrowLeft') go(cur + 1);
    else if(e.key === 'ArrowRight') go(cur - 1);
    else if(e.key === ' '){ e.preventDefault(); setPaused(!paused); }
    else if(e.key === 'Escape') requestClose();
    else if(e.key === 'f' && document.documentElement.requestFullscreen){
      if(document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  $('show').addEventListener('pointermove', wake);
  $('show-go').addEventListener('click', start);
  $('show-close').addEventListener('click', requestClose);
  $('show-next').addEventListener('click', () => go(cur + 1));
  $('show-prev').addEventListener('click', () => go(cur - 1));
  $('show-pause').addEventListener('click', () => setPaused(!paused));
  // In Hebrew the next greeting is to the left: tap the left half (or swipe right) for the next one.
  $('show-stage').addEventListener('click', (e) => {
    wake();
    if(e.target.closest('button')) return;
    go(e.clientX < innerWidth / 2 ? cur + 1 : cur - 1);
  });
  $('show-stage').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $('show-stage').addEventListener('touchend', (e) => {
    if(touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if(Math.abs(dx) > 60){
      e.preventDefault();
      go(dx > 0 ? cur + 1 : cur - 1);
    }
  });

  return { open };
})();
