// The opening after the arrow: photos drop one by one like polaroids tossed on a table, then a
// card leads on to the greetings. The site is already rendered underneath and is revealed at the end.
const Montage = (() => {
  const $ = (id) => document.getElementById(id);
  const STEP_MS = 550;
  const loaded = new Map();
  let running = false;
  let timers = [];

  const thumb = (name) => 'photos/thumb/' + encodeURIComponent(name);

  // Start loading early (while the opening screen is up) so the photos are ready to drop.
  function preload(list){
    list.forEach(name => {
      if(loaded.has(name)) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = thumb(name);
      loaded.set(name, img.decode().then(() => img, () => null));
    });
  }

  function ready(name){
    preload([name]);
    return Promise.race([loaded.get(name), new Promise(r => setTimeout(() => r(null), 2500))]);
  }

  // Spread the photos over a loose grid, shuffled, with a little jitter and tilt.
  function spots(n){
    const W = innerWidth, H = innerHeight;
    const cols = W > H ? 4 : 3;
    const rows = Math.ceil(n / cols);
    const cells = [];
    for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++) cells.push([c, r]);
    for(let i = cells.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return cells.slice(0, n).map(([c, r]) => ({
      x: (c + 0.5 + (Math.random() - 0.5) * 0.5) / cols * W,
      y: (r + 0.5 + (Math.random() - 0.5) * 0.4) / rows * H,
      r: (Math.random() - 0.5) * 26
    }));
  }

  function later(fn, ms){
    timers.push(setTimeout(fn, ms));
  }

  function finish(){
    if(!running) return;
    running = false;
    timers.forEach(clearTimeout);
    timers = [];
    const m = $('montage');
    m.classList.add('out');
    setTimeout(() => {
      m.hidden = true;
      m.classList.remove('out');
      $('m-table').textContent = '';
      $('m-end').classList.remove('in');
      document.documentElement.style.overflow = '';
    }, 600);
  }

  async function play(list, count){
    if(running || !list.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    running = true;
    const m = $('montage');
    const table = $('m-table');
    table.textContent = '';
    $('m-end').classList.remove('in');
    $('m-count').textContent = `${count} ברכות מחכות לך`;
    m.hidden = false;
    document.documentElement.style.overflow = 'hidden';

    const places = spots(list.length);
    const width = Math.round(Math.min(innerWidth * 0.42, innerHeight * 0.3, 260));
    let shown = 0;
    for(let i = 0; i < list.length && running; i++){
      const img = await ready(list[i]);
      if(!running) return;
      if(!img) continue;
      const p = places[shown++];
      const card = document.createElement('div');
      card.className = 'm-photo';
      card.style.cssText = `left:${p.x}px; top:${p.y}px; width:${width}px; z-index:${shown}; --r:${p.r}deg; --r0:${p.r * 2.2}deg;`;
      const pic = document.createElement('img');
      pic.alt = '';
      pic.src = img.src;
      card.appendChild(pic);
      table.appendChild(card);
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
      await new Promise(r => later(r, STEP_MS));
    }
    if(!running) return;
    later(() => $('m-end').classList.add('in'), 700);
  }

  $('m-go').addEventListener('click', finish);
  $('m-skip').addEventListener('click', finish);
  addEventListener('keydown', (e) => { if(running && (e.key === 'Escape' || e.key === 'Enter')) finish(); });

  return { preload, play };
})();
