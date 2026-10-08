// A greeting with a recording and a few photos is saved as a few entries that share a batch id.
// Put them back together so each greeting is one card and counts once; every separate send is
// its own greeting. Must match greetingCount in roni/worker/src/index.js.
function mergeGreetings(list){
  const cards = [];
  const byBatch = new Map();
  for(const g of list){
    const from = (g.from || '').trim();
    const key = g.batch ? `${g.batch}|${from}|${g.group}` : null;
    let card = key ? byBatch.get(key) : null;
    if(!card){
      card = { from, group: g.group, texts: [], media: [], firstAt: g.sentAt || '' };
      cards.push(card);
      if(key) byBatch.set(key, card);
    }
    if(g.text) card.texts.push(g.text);
    if(g.media) card.media.push(g.media);
  }
  return cards;
}
