// A greeting with a recording and a few photos is saved as several entries a moment apart.
// Put the entries of the same person back together, so each greeting is one card and counts once.
const MERGE_WINDOW_MS = 15 * 60 * 1000;

function mergeGreetings(list){
  const cards = [];
  for(const g of list){
    const from = (g.from || '').trim();
    const at = Date.parse(g.sentAt || '') || 0;
    let card = null;
    for(let i = cards.length - 1; i >= 0; i--){
      const c = cards[i];
      if(at - c.lastAt > MERGE_WINDOW_MS) break;
      if(from && at && c.from === from && c.group === g.group){ card = c; break; }
    }
    if(!card){
      card = { from, group: g.group, texts: [], media: [], firstAt: g.sentAt || '', lastAt: at };
      cards.push(card);
    }
    if(g.text) card.texts.push(g.text);
    if(g.media) card.media.push(g.media);
    card.lastAt = Math.max(card.lastAt, at);
  }
  return cards;
}
