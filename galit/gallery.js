// Photos of Galit above the greetings: a row of polaroids to swipe through, and a tap opens one
// full screen. The list comes from "photos" in content.json; thumbnails live in photos/thumb/.
const Gallery = (() => {
  const $ = (id) => document.getElementById(id);
  let photos = [];
  let cur = 0;
  let touchX = null;

  const full = (name) => 'photos/' + encodeURIComponent(name);
  const thumb = (name) => 'photos/thumb/' + encodeURIComponent(name);

  function render(list){
    photos = list || [];
    $('gallery').hidden = !photos.length;
    const strip = $('strip');
    strip.textContent = '';
    photos.forEach((name, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'polaroid';
      b.setAttribute('aria-label', `תמונה ${i + 1} מתוך ${photos.length}`);
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = thumb(name);
      b.appendChild(img);
      b.addEventListener('click', () => open(i));
      strip.appendChild(b);
    });
  }

  function show(i){
    cur = (i + photos.length) % photos.length;
    $('lb-img').src = full(photos[cur]);
    $('lb-count').textContent = `${cur + 1} / ${photos.length}`;
    [cur + 1, cur - 1].forEach(j => { new Image().src = full(photos[(j + photos.length) % photos.length]); });
  }

  function open(i){
    show(i);
    $('lightbox').hidden = false;
    document.documentElement.style.overflow = 'hidden';
    history.pushState({ photo: true }, '');
  }

  function close(){
    if($('lightbox').hidden) return;
    $('lightbox').hidden = true;
    document.documentElement.style.overflow = '';
    $('lb-img').removeAttribute('src');
  }

  function requestClose(){
    if(history.state && history.state.photo) history.back();
    else close();
  }

  addEventListener('popstate', close);
  addEventListener('keydown', (e) => {
    if($('lightbox').hidden) return;
    if(e.key === 'ArrowLeft') show(cur + 1);
    else if(e.key === 'ArrowRight') show(cur - 1);
    else if(e.key === 'Escape') requestClose();
  });
  $('lb-close').addEventListener('click', requestClose);
  $('lb-next').addEventListener('click', () => show(cur + 1));
  $('lb-prev').addEventListener('click', () => show(cur - 1));
  // A tap outside the photo closes it.
  $('lightbox').addEventListener('click', (e) => { if(e.target === e.currentTarget) requestClose(); });
  // In Hebrew the next photo is to the left: swipe right for the next one.
  $('lightbox').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $('lightbox').addEventListener('touchend', (e) => {
    if(touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if(Math.abs(dx) > 50){
      e.preventDefault();
      show(dx > 0 ? cur + 1 : cur - 1);
    }
  });
  // On a computer the row scrolls with the arrow buttons at its sides.
  $('strip-prev').addEventListener('click', () => $('strip').scrollBy({ left: 260, behavior: 'smooth' }));
  $('strip-next').addEventListener('click', () => $('strip').scrollBy({ left: -260, behavior: 'smooth' }));

  return { render };
})();
