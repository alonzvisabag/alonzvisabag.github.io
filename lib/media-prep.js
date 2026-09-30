// Shared by the friends' pages: prepares recordings and photos before they are uploaded.

function pickMimeType(){
  const candidates = [
    { mime: 'audio/mp4', ext: 'm4a' },
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' }
  ];
  for(const c of candidates){
    if(window.MediaRecorder && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: '', ext: 'webm' };
}

// iPhone recordings are fragmented MP4, which iPhone players can fail on; rebuild as a regular M4A (null = leave as is).
function remuxFragmentedMp4(bytes){
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o) => dv.getUint32(o);
  const str4 = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  const kids = (start, end) => {
    const out = [];
    let o = start;
    while(o + 8 <= end){
      let size = u32(o);
      let hdr = 8;
      if(size === 1){ size = u32(o + 8) * 4294967296 + u32(o + 12); hdr = 16; }
      else if(size === 0){ size = end - o; }
      if(size < hdr || o + size > end) return [];
      out.push({ type: str4(o + 4), start: o, end: o + size, body: o + hdr });
      o += size;
    }
    return out;
  };
  const find = (list, t) => list.find(b => b.type === t);
  const all = (list, t) => list.filter(b => b.type === t);

  const top = kids(0, bytes.length);
  const moov = find(top, 'moov');
  const moofs = all(top, 'moof');
  if(!moov || !moofs.length) return null;
  const moovKids = kids(moov.body, moov.end);
  const mvhd = find(moovKids, 'mvhd');
  const traks = all(moovKids, 'trak');
  if(!mvhd || traks.length !== 1) return null;
  const mdia = find(kids(traks[0].body, traks[0].end), 'mdia');
  if(!mdia) return null;
  const mdiaKids = kids(mdia.body, mdia.end);
  const mdhd = find(mdiaKids, 'mdhd');
  const hdlr = find(mdiaKids, 'hdlr');
  const minf = find(mdiaKids, 'minf');
  if(!mdhd || !hdlr || !minf || str4(hdlr.body + 8) !== 'soun') return null;
  const minfKids = kids(minf.body, minf.end);
  const smhd = find(minfKids, 'smhd');
  const stbl = find(minfKids, 'stbl');
  const stsd = stbl && find(kids(stbl.body, stbl.end), 'stsd');
  if(!smhd || !stsd) return null;

  const mdhdV1 = bytes[mdhd.body] === 1;
  const timescale = u32(mdhd.body + (mdhdV1 ? 20 : 12));
  const language = dv.getUint16(mdhd.body + (mdhdV1 ? 32 : 20));
  const movieTimescale = u32(mvhd.body + (bytes[mvhd.body] === 1 ? 20 : 12));
  if(!timescale || !movieTimescale) return null;

  let trexDur = 0, trexSize = 0;
  const mvex = find(moovKids, 'mvex');
  const trex = mvex && find(kids(mvex.body, mvex.end), 'trex');
  if(trex){ trexDur = u32(trex.body + 12); trexSize = u32(trex.body + 16); }

  const durations = [], sizes = [], offsets = [];
  for(const moof of moofs){
    for(const traf of all(kids(moof.body, moof.end), 'traf')){
      const trafKids = kids(traf.body, traf.end);
      const tfhd = find(trafKids, 'tfhd');
      if(!tfhd) return null;
      const tf = u32(tfhd.body) & 0xffffff;
      let p = tfhd.body + 8;
      let base = moof.start;
      if(tf & 0x1){ base = u32(p) * 4294967296 + u32(p + 4); p += 8; }
      if(tf & 0x2) p += 4;
      let defDur = trexDur, defSize = trexSize;
      if(tf & 0x8){ defDur = u32(p); p += 4; }
      if(tf & 0x10){ defSize = u32(p); p += 4; }
      let ptr = base;
      for(const trun of all(trafKids, 'trun')){
        const rf = u32(trun.body) & 0xffffff;
        const count = u32(trun.body + 4);
        let q = trun.body + 8;
        if(rf & 0x1){ ptr = base + dv.getInt32(q); q += 4; }
        if(rf & 0x4) q += 4;
        for(let i = 0; i < count; i++){
          let dur = defDur, size = defSize;
          if(rf & 0x100){ dur = u32(q); q += 4; }
          if(rf & 0x200){ size = u32(q); q += 4; }
          if(rf & 0x400) q += 4;
          if(rf & 0x800){ if(u32(q) !== 0) return null; q += 4; }
          if(ptr + size > bytes.length) return null;
          durations.push(dur);
          sizes.push(size);
          offsets.push(ptr);
          ptr += size;
        }
      }
    }
  }
  if(!sizes.length) return null;

  const u32b = (...vals) => {
    const a = new Uint8Array(vals.length * 4);
    const d = new DataView(a.buffer);
    vals.forEach((v, i) => d.setUint32(i * 4, v));
    return a;
  };
  const u32list = (vals) => {
    const a = new Uint8Array(vals.length * 4);
    const d = new DataView(a.buffer);
    for(let i = 0; i < vals.length; i++) d.setUint32(i * 4, vals[i]);
    return a;
  };
  const u16b = (...vals) => {
    const a = new Uint8Array(vals.length * 2);
    const d = new DataView(a.buffer);
    vals.forEach((v, i) => d.setUint16(i * 2, v));
    return a;
  };
  const cat = (parts) => {
    const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    let o = 0;
    for(const x of parts){ out.set(x, o); o += x.length; }
    return out;
  };
  const box = (type, ...parts) => {
    const body = cat(parts);
    const head = u32b(body.length + 8);
    const t = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
    return cat([head, t, body]);
  };
  const copy = (b) => bytes.slice(b.start, b.end);
  const matrix = u32b(0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000);

  const mediaDuration = durations.reduce((n, d) => n + d, 0);
  const movieDuration = Math.round(mediaDuration * movieTimescale / timescale);

  const stts = [];
  for(const d of durations){
    const last = stts[stts.length - 1];
    if(last && last[1] === d) last[0]++;
    else stts.push([1, d]);
  }

  const buildMoov = (dataOffset) => box('moov',
    box('mvhd', u32b(0, 0, 0, movieTimescale, movieDuration, 0x00010000), u16b(0x0100, 0), u32b(0, 0), matrix, new Uint8Array(24), u32b(2)),
    box('trak',
      box('tkhd', u32b(0x00000003, 0, 0, 1, 0, movieDuration, 0, 0), u16b(0, 0, 0x0100, 0), matrix, u32b(0, 0)),
      box('mdia',
        box('mdhd', u32b(0, 0, 0, timescale, mediaDuration), u16b(language, 0)),
        copy(hdlr),
        box('minf',
          copy(smhd),
          box('dinf', box('dref', u32b(0, 1), box('url ', u32b(1)))),
          box('stbl',
            copy(stsd),
            box('stts', u32b(0, stts.length), u32list([].concat(...stts))),
            box('stsc', u32b(0, 1, 1, sizes.length, 1)),
            box('stsz', u32b(0, 0, sizes.length), u32list(sizes)),
            box('stco', u32b(0, 1, dataOffset))
          )
        )
      )
    )
  );

  const ftyp = box('ftyp', new Uint8Array([77, 52, 65, 32]), u32b(0x200), new Uint8Array([77, 52, 65, 32, 105, 115, 111, 109, 105, 115, 111, 50]));
  const moovLen = buildMoov(0).length;
  const newMoov = buildMoov(ftyp.length + moovLen + 8);
  const mdatPayload = new Uint8Array(sizes.reduce((n, s) => n + s, 0));
  let w = 0;
  for(let i = 0; i < sizes.length; i++){
    mdatPayload.set(bytes.subarray(offsets[i], offsets[i] + sizes[i]), w);
    w += sizes[i];
  }
  return cat([ftyp, newMoov, u32b(mdatPayload.length + 8), new Uint8Array([109, 100, 97, 116]), mdatPayload]);
}

async function standardizeAudio(blob){
  try{
    const fixed = remuxFragmentedMp4(new Uint8Array(await blob.arrayBuffer()));
    return fixed ? new Blob([fixed], { type: 'audio/mp4' }) : blob;
  } catch(e){
    return blob;
  }
}

// Phones embed where a photo was taken; blank the GPS block in place so the image itself is untouched.
function stripJpegGps(bytes){
  if(bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  const out = bytes.slice();
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  let changed = false;
  let o = 2;
  while(o + 4 <= out.length && out[o] === 0xFF){
    const marker = out[o + 1];
    if(marker === 0xDA || marker === 0xD9) break;
    const len = dv.getUint16(o + 2);
    const seg = o + 4;
    const segEnd = o + 2 + len;
    if(marker === 0xE1 && segEnd <= out.length && String.fromCharCode(...out.subarray(seg, seg + 4)) === 'Exif'){
      const t = seg + 6;
      const le = out[t] === 0x49;
      const u16 = (p) => dv.getUint16(p, le);
      const u32 = (p) => dv.getUint32(p, le);
      const inSeg = (p, n) => p >= t && p + n <= segEnd;
      const ifd0 = t + u32(t + 4);
      if(inSeg(ifd0, 2)){
        const n0 = u16(ifd0);
        for(let i = 0; i < n0; i++){
          const e = ifd0 + 2 + i * 12;
          if(!inSeg(e, 12) || u16(e) !== 0x8825) continue;
          const gps = t + u32(e + 8);
          if(!inSeg(gps, 2)) continue;
          const n = u16(gps);
          for(let j = 0; j < n; j++){
            const g = gps + 2 + j * 12;
            if(!inSeg(g, 12)) break;
            const size = (TYPE_SIZE[u16(g + 2)] || 1) * u32(g + 4);
            if(size > 4){
              const v = t + u32(g + 8);
              if(inSeg(v, size)) out.fill(0, v, v + size);
            }
            out.fill(0, g, g + 12);
          }
          dv.setUint16(gps, 0, le);
          changed = true;
        }
      }
    }
    o = segEnd;
  }
  return changed ? out : null;
}

async function removeLocation(blob){
  try{
    const clean = stripJpegGps(new Uint8Array(await blob.arrayBuffer()));
    return clean ? new Blob([clean], { type: 'image/jpeg' }) : blob;
  } catch(e){
    return blob;
  }
}

function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function extFromFilename(name){
  return (name.split('.').pop() || '').toLowerCase();
}

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm'
};

// Some phone pickers hand over files without an extension; fall back to the file's type.
function extFromFile(file){
  const byName = /\.([a-z0-9]{2,5})$/i.exec(file.name || '');
  if(byName) return byName[1].toLowerCase();
  return MIME_EXT[(file.type || '').split(';')[0]] || '';
}

// Phone photos are several MB each; a smaller JPEG uploads faster on mobile data and loads faster for the viewer.
// Redrawing also drops everything embedded in the file, including the location.
// Returns null when the photo is already small (unless force) or the browser can't read it.
async function shrinkImage(file, force = false, maxSide = 2200, quality = 0.85){
  const url = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  try{
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if(!w || !h) return null;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    if(!force && scale === 1 && file.size <= 1_500_000) return null;
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob && (force || blob.size < file.size) ? blob : null;
  } catch(e){
    return null;
  } finally{
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
