const REPO = 'alonzvisabag/alonzvisabag.github.io';
const BRANCH = 'main';
const SITES = {
  roni: { content: 'roni/content.json', media: 'roni/media' },
  galit: { content: 'galit/content.json', media: 'galit/media' },
};
const GALIT_GROUPS = ['family', 'friends', 'work'];
const ALLOWED_ORIGIN = 'https://alonzvisabag.github.io';

const MEDIA_EXT_WHITELIST = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'wav', 'm4a', 'ogg', 'aac', 'mp4', 'mov', 'webm', 'm4v'];
const VALID_TYPES = ['letter', 'audio', 'video', 'photo'];
const MAX_TEXT = 20000;
const FLOOD_WINDOW_MS = 10 * 60 * 1000;
const FLOOD_MAX = 30;

// Sends a Telegram message to Alon; returns its id (so it can be edited later), or null.
async function notify(env, text) {
  const token = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) {
    console.log('notify: telegram not configured, skipping');
    return null;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      console.error('notify: telegram send failed', res.status, await res.text());
      return null;
    }
    console.log('notify: telegram send ok');
    const data = await res.json().catch(() => ({}));
    return data && data.result ? data.result.message_id : null;
  } catch (e) {
    console.error('notify: telegram send threw', e.message);
    return null;
  }
}

// Replaces the text of a message sent earlier (no new notification). True if it worked.
async function editMessage(env, messageId, text) {
  const token = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId || !messageId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
    });
    if (res.ok) return true;
    const err = await res.text();
    return /not modified/i.test(err);
  } catch (e) {
    return false;
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function base64ToUtf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function ghFetch(env, path, options = {}) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'roni-contribute-worker',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  return res;
}

async function getFile(env, path) {
  const res = await ghFetch(env, `contents/${path}?ref=${BRANCH}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  const data = await res.json();
  if (data.encoding === 'base64' && data.content) return { sha: data.sha, contentBase64: data.content };
  // The contents API omits the body for files over 1MB; the blob API returns up to 100MB.
  const blob = await ghFetch(env, `git/blobs/${data.sha}`);
  if (!blob.ok) throw new Error(`GET blob for ${path} failed: ${blob.status}`);
  return { sha: data.sha, contentBase64: (await blob.json()).content };
}

async function readContent(env, path) {
  const file = await getFile(env, path);
  if (!file) throw new Error(`${path} not found`);
  return { sha: file.sha, data: JSON.parse(base64ToUtf8(file.contentBase64)) };
}

// How many greetings Galit's page shows: the parts of one send (a recording and some photos) share
// a batch id and count once; every separate send is its own greeting. Must match mergeGreetings in galit/greetings.js.
function greetingCount(list) {
  const seen = new Set();
  let count = 0;
  for (const g of list) {
    const key = g.batch ? `${g.batch}|${(g.from || '').trim()}|${g.group}` : null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    count++;
  }
  return count;
}

function recentCount(data) {
  const since = Date.now() - FLOOD_WINDOW_MS;
  const items = [...(data.capsules || []).flatMap((c) => c.items || []), ...(data.greetings || [])];
  return items.filter((it) => Date.parse(it.sentAt || '') > since).length;
}

// Read, change and write back a content file, retrying when another save landed in between.
async function saveContent(env, path, mutate, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await readContent(env, path);
    mutate(file.data);
    const newBase64 = utf8ToBase64(JSON.stringify(file.data, null, 2) + '\n');
    const res = await putFile(env, path, newBase64, message, file.sha);
    if (res.ok) return;
    if (res.status === 409 && attempt < 2) continue;
    throw new Error(`failed to update ${path}: ${res.status} ${await res.text()}`);
  }
  throw new Error(`failed to update ${path} after retries`);
}

async function putFile(env, path, contentBase64, message, sha) {
  const body = { message, content: contentBase64, branch: BRANCH };
  if (sha) body.sha = sha;
  return ghFetch(env, `contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function findCapsule(json, capsuleId) {
  return (json.capsules || []).find((c) => c.id === capsuleId) || null;
}

function addToCapsule(data, { capsuleId, newCapsule }, item) {
  let capsule = capsuleId ? findCapsule(data, capsuleId) : null;
  if (!capsule && newCapsule) {
    if (!data.capsules) data.capsules = [];
    capsule = {
      id: `friend-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      trigger: newCapsule.trigger,
      type: newCapsule.type,
      desc: null,
      items: [],
      openToFriends: true,
    };
    data.capsules.unshift(capsule);
  }
  if (!capsule) throw new Error(`capsule not found: ${capsuleId}`);
  if (!capsule.items) capsule.items = [];
  capsule.items.push(item);
}

async function handleContribute(request, env) {
  if (request.headers.get('Origin') !== ALLOWED_ORIGIN) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, error: 'invalid json' }, 400);
  }

  const { capsuleId, newCapsule, from, text, mediaBase64, mediaExt, website, group, batch } = body;
  const siteKey = body.site === undefined ? 'roni' : body.site;
  const site = SITES[siteKey];
  const isGalit = siteKey === 'galit';

  if (typeof website === 'string' && website.trim()) {
    return json({ ok: true });
  }

  if (!site) {
    return json({ ok: false, error: 'unknown site' }, 400);
  }

  if (typeof from === 'string' && from.length > 60) {
    return json({ ok: false, error: 'name too long' }, 400);
  }

  if (typeof text === 'string' && text.length > MAX_TEXT) {
    return json({ ok: false, error: 'text too long' }, 400);
  }

  if (isGalit) {
    if (!GALIT_GROUPS.includes(group)) {
      return json({ ok: false, error: 'group required' }, 400);
    }
    if (typeof from !== 'string' || !from.trim()) {
      return json({ ok: false, error: 'name required' }, 400);
    }
  }

  const hasExisting = !isGalit && typeof capsuleId === 'string' && capsuleId.length > 0;
  let cleanNewCapsule = null;
  if (!isGalit && !hasExisting) {
    if (
      !newCapsule ||
      !VALID_TYPES.includes(newCapsule.type) ||
      typeof newCapsule.trigger !== 'string' ||
      !newCapsule.trigger.trim() ||
      newCapsule.trigger.trim().length > 300
    ) {
      return json({ ok: false, error: 'missing capsuleId or invalid newCapsule' }, 400);
    }
    cleanNewCapsule = {
      type: newCapsule.type,
      trigger: newCapsule.trigger.trim(),
    };
  }

  const hasText = typeof text === 'string' && text.trim().length > 0;
  const hasMedia = typeof mediaBase64 === 'string' && mediaBase64.length > 0;
  if (!hasText && !hasMedia) {
    return json({ ok: false, error: 'nothing to save' }, 400);
  }

  let ext = null;
  if (hasMedia) {
    ext = (mediaExt || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!MEDIA_EXT_WHITELIST.includes(ext)) {
      return json({ ok: false, error: 'unsupported file type' }, 400);
    }
    if (mediaBase64.length > 15_000_000) {
      return json({ ok: false, error: 'file too large' }, 400);
    }
  }

  // Validate against the live content before writing anything, so rejected requests leave no files behind.
  let current;
  try {
    current = await readContent(env, site.content);
  } catch (e) {
    console.error('read content failed', e.message);
    return json({ ok: false, error: 'server error' }, 500);
  }
  if (hasExisting) {
    const target = findCapsule(current.data, capsuleId);
    if (!target || target.openToFriends !== true) {
      return json({ ok: false, error: 'situation not available' }, 400);
    }
  }
  if (recentCount(current.data) >= FLOOD_MAX) {
    return json({ ok: false, error: 'too many requests' }, 429);
  }

  const cleanBatch = isGalit && typeof batch === 'string' && /^[A-Za-z0-9-]{6,40}$/.test(batch) ? batch : null;

  // Telegram: "ר" for Roni's site, "5 מתוך 60" for Galit's (only when a new greeting starts,
  // not for the extra photos of one already counted).
  const failNote = isGalit ? 'ברכה לגלית לא נשמרה' : 'ר - לא נשמר';
  let note = isGalit ? null : 'ר';

  let mediaFilename = null;
  if (hasMedia) {
    const prefix = (isGalit ? group : hasExisting ? capsuleId : 'custom').replace(/[^a-zA-Z0-9-]/g, '');
    mediaFilename = `${prefix}-${Date.now()}.${ext}`;
    const res = await putFile(
      env,
      `${site.media}/${mediaFilename}`,
      mediaBase64,
      `contribute: add media for ${isGalit ? 'greeting' : hasExisting ? capsuleId : 'new capsule'}`
    );
    if (!res.ok) {
      console.error('media upload failed', res.status, await res.text());
      await notify(env, failNote);
      return json({ ok: false, error: 'server error' }, 500);
    }
  }

  const item = {
    from: typeof from === 'string' && from.trim() ? from.trim() : null,
    text: hasText ? text.trim() : null,
    media: mediaFilename,
    sentAt: new Date().toISOString(),
  };

  try {
    if (isGalit) {
      await saveContent(env, site.content, (data) => {
        if (!data.greetings) data.greetings = [];
        const before = greetingCount(data.greetings);
        data.greetings.push(cleanBatch ? { ...item, group, batch: cleanBatch } : { ...item, group });
        const after = greetingCount(data.greetings);
        const goal = (data.site && data.site.goal) || 60;
        note = after > before ? `${after} מתוך ${goal}` : null;
      }, 'contribute: add greeting');
    } else {
      await saveContent(
        env,
        site.content,
        (data) => addToCapsule(data, { capsuleId: hasExisting ? capsuleId : null, newCapsule: cleanNewCapsule }, item),
        hasExisting ? `contribute: add item to ${capsuleId}` : 'contribute: add new situation'
      );
    }
  } catch (e) {
    console.error('save failed', e.message);
    await notify(env, failNote);
    return json({ ok: false, error: 'server error' }, 500);
  }

  if (note) await notify(env, note);

  return json({ ok: true });
}

// ── Visit alerts: a Telegram message when someone opens the portfolio, and a summary of what they did
// when they leave (both sent by assets/visit.js) ──

const PAGE_NAMES = {
  '/': 'העמוד הראשי',
  '/index.html': 'העמוד הראשי',
  '/milon.html': 'המילון',
  '/portfolio/far.html': 'לפתוח כשצריך',
  '/portfolio/sixty.html': '60 ברכות ל-60 שנה',
  '/demo/far/': 'ההדגמה של לפתוח כשצריך',
  '/demo/far/index.html': 'ההדגמה של לפתוח כשצריך',
  '/demo/birthday/': 'ההדגמה של 60 ברכות',
  '/demo/birthday/index.html': 'ההדגמה של 60 ברכות',
  '/demo/birthday/contribute.html': 'ההדגמה של דף המברכים',
  '/rescue-banner.html': 'הבאנר של רסקיו',
  '/font-lab/': 'בית היציקה',
  '/font-lab/index.html': 'בית היציקה',
};
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|lighthouse|facebookexternalhit|whatsapp\/|telegrambot/i;
const VISIT_GAP_MS = 30 * 60 * 1000;   // the same visitor is reported at most once per half hour
const VISIT_MAX_PER_HOUR = 40;         // and never more than this, so the alerts can't be flooded
const lastSeen = new Map();
let hourStart = 0;
let hourCount = 0;

function sourceOf(ref, ua) {
  if (/LinkedInApp/i.test(ua)) return 'לינקדאין (האפליקציה)';
  if (/Instagram/i.test(ua)) return 'אינסטגרם (האפליקציה)';
  if (/FBAN|FBAV/i.test(ua)) return 'פייסבוק (האפליקציה)';
  let host = '';
  try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch (e) {}
  if (!host) return 'ישיר (קישור מוואטסאפ, מייל או הקלדה)';
  if (/(^|\.)linkedin\.com$|^lnkd\.in$/.test(host)) return 'לינקדאין';
  if (/^mail\.google\.com$/.test(host)) return "ג'ימייל";
  if (/(^|\.)google\./.test(host)) return 'גוגל';
  if (/(^|\.)instagram\.com$/.test(host)) return 'אינסטגרם';
  if (/(^|\.)facebook\.com$|^fb\.me$/.test(host)) return 'פייסבוק';
  if (/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/.test(host)) return 'X (טוויטר)';
  if (/(^|\.)bing\.com$/.test(host)) return 'בינג';
  if (host === 'alonzvisabag.github.io') return 'מתוך האתר';
  return host;
}

// The internet provider, or the company when it has its own network (big offices often do)
function networkOf(cf) {
  return typeof cf.asOrganization === 'string' && cf.asOrganization ? cf.asOrganization.slice(0, 80) : '';
}

function ago(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 60) return min <= 1 ? 'לפני דקה' : `לפני ${min} דקות`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? 'אתמול' : d === 2 ? 'לפני יומיים' : `לפני ${d} ימים`;
}

function visitCode(v) {
  return typeof v === 'string' && /^[A-Z2-9]{4}$/.test(v) ? v : '';
}

function deviceOf(ua) {
  if (/iPhone/i.test(ua)) return 'טלפון (אייפון)';
  if (/iPad/i.test(ua)) return 'טאבלט (אייפד)';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'טלפון (אנדרואיד)' : 'טאבלט (אנדרואיד)';
  if (/Windows/i.test(ua)) return 'מחשב (Windows)';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'מחשב (מק)';
  if (/Linux/i.test(ua)) return 'מחשב (Linux)';
  return 'לא ידוע';
}

async function handleVisit(request, env) {
  const done = () => new Response(null, { status: 204, headers: corsHeaders() });
  if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return done();
  const ua = request.headers.get('User-Agent') || '';
  if (!ua || BOT_UA.test(ua)) return done();

  let body = {};
  try {
    const raw = await request.text();
    if (raw.length > 2000) return done();
    body = JSON.parse(raw);
  } catch (e) {
    return done();
  }
  const page = typeof body.page === 'string' ? body.page.slice(0, 200) : '/';
  const ref = typeof body.ref === 'string' ? body.ref.slice(0, 500) : '';
  const tag = typeof body.from === 'string' ? body.from.replace(/[^\w֐-׿-]/g, '').slice(0, 40) : '';

  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (now - (lastSeen.get(ip) || 0) < VISIT_GAP_MS) return done();
  if (now - hourStart > 60 * 60 * 1000) { hourStart = now; hourCount = 0; }
  if (hourCount >= VISIT_MAX_PER_HOUR) return done();
  lastSeen.set(ip, now);
  hourCount++;
  if (lastSeen.size > 500) lastSeen.clear();

  const cf = request.cf || {};
  const place = [cf.city, cf.country].filter(Boolean).join(', ') || 'לא ידוע';
  const code = visitCode(body.id);
  const lines = [
    code ? `👀 מישהו נכנס לאתר · ביקור ${code}` : '👀 מישהו נכנס לאתר',
    `עמוד: ${PAGE_NAMES[page] || page}`,
    `הגיע מ: ${sourceOf(ref, ua)}`,
    `מכשיר: ${deviceOf(ua)}`,
    `מיקום משוער: ${place}`,
  ];
  if (networkOf(cf)) lines.push(`רשת: ${networkOf(cf)}`);
  const times = Math.floor(Number(body.n) || 0);
  const last = Number(body.last) || 0;
  if (times === 1) lines.push('ביקור ראשון מהמכשיר הזה');
  else if (times > 1 && times < 10000) lines.push(`ביקור מספר ${times} מהמכשיר הזה` + (last > 0 && last < Date.now() ? ` (הקודם ${ago(last)})` : ''));
  if (tag) lines.push(`תגית בקישור: ${tag}`);
  // No Telegram message here any more: each visit gets one message, its summary (handleVisitSummary).
  await logVisit(env, {
    type: 'arrive', code, page: PAGE_NAMES[page] || page, source: sourceOf(ref, ua), referrer: ref, device: deviceOf(ua),
    place, network: networkOf(cf), tag, visitNo: times || null, lastVisit: last > 0 ? new Date(last).toISOString() : null,
  });
  return done();
}

// ── Visit log: every arrival and summary is also kept as a line of JSON in a private repository
// (one file a day), so Alon and Claude can look back later. Off until the VISITS_TOKEN secret is set:
// a GitHub token for that repository only, with Contents read and write. No IP addresses are kept.
const VISITS_REPO = 'alonzvisabag/site-visits';

function israelDay() {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}

async function logVisit(env, entry) {
  const token = (env.VISITS_TOKEN || '').trim();
  if (!token) return;
  const url = `https://api.github.com/repos/${VISITS_REPO}/contents/visits/${israelDay()}.jsonl`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'roni-contribute-worker',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n';
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await fetch(url, { headers });
      let sha = null;
      let text = '';
      if (cur.ok) {
        const data = await cur.json();
        sha = data.sha;
        text = base64ToUtf8(data.content || '');
      } else if (cur.status !== 404) {
        throw new Error(`read failed: ${cur.status}`);
      }
      const res = await fetch(url, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `${entry.type} ${entry.code || ''}`.trim(), content: utf8ToBase64(text + line), ...(sha ? { sha } : {}) }),
      });
      if (res.ok) return;
      if (res.status !== 409 && res.status !== 422) throw new Error(`write failed: ${res.status}`);
    }
  } catch (e) {
    console.error('visit log:', e.message);
  }
}

const SUMMARY_MAX_PER_HOUR = 60;
const SUMMARY_MAX_PER_VISIT = 12;
const summariesSent = new Map();
const summaryMessages = new Map();   // visit code → the Telegram message that later updates edit
let summaryHourStart = 0;
let summaryHourCount = 0;

const clip = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');

function duration(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  if (sec < 60) return `${sec} שניות`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)} שעות ו-${m % 60} דקות`;
  return `${m}:${String(s).padStart(2, '0')} דקות`;
}

async function handleVisitSummary(request, env) {
  const done = () => new Response(null, { status: 204, headers: corsHeaders() });
  if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return done();
  const ua = request.headers.get('User-Agent') || '';
  if (!ua || BOT_UA.test(ua)) return done();
  let body = {};
  try {
    const raw = await request.text();
    if (raw.length > 12000) return done();
    body = JSON.parse(raw);
  } catch (e) {
    return done();
  }
  const code = visitCode(body.id);
  if (!code) return done();

  const now = Date.now();
  if (now - summaryHourStart > 60 * 60 * 1000) { summaryHourStart = now; summaryHourCount = 0; }
  if (summaryHourCount >= SUMMARY_MAX_PER_HOUR) return done();
  const sentForVisit = summariesSent.get(code) || 0;
  if (sentForVisit >= SUMMARY_MAX_PER_VISIT) return done();
  summaryHourCount++;
  summariesSent.set(code, sentForVisit + 1);
  if (summariesSent.size > 500) summariesSent.clear();

  const cf = request.cf || {};
  const place = [cf.city, cf.country].filter(Boolean).join(', ') || 'לא ידוע';
  const pages = (Array.isArray(body.pages) ? body.pages : []).slice(-30).map((p) => {
    const path = clip(p && p.p, 200) || '/';
    const depth = Math.max(0, Math.min(100, Math.round(Number(p && p.d) || 0)));
    return `• ${PAGE_NAMES[path] || path} · ${duration(p && p.s)} · גללו ${depth >= 95 ? 'עד הסוף' : depth + '%'}`;
  });
  const notes = (Array.isArray(body.notes) ? body.notes : []).slice(0, 40).map((n) => clip(n, 320)).filter(Boolean);
  const searches = (Array.isArray(body.q) ? body.q : []).slice(0, 15).map((q) => clip(q, 60)).filter(Boolean);
  const tag = clip(body.from, 40).replace(/[^\w\u0590-\u05ff-]/g, '');

  const lines = [
    `👀 ביקור באתר · ${code}`,
    `הגיע מ: ${sourceOf(clip(body.ref, 500), ua)} · ${deviceOf(ua)} · ${place}`,
  ];
  if (networkOf(cf)) lines.push(`רשת: ${networkOf(cf)}`);
  const times = Math.floor(Number(body.n) || 0);
  const last = Number(body.last) || 0;
  if (times === 1) lines.push('ביקור ראשון מהמכשיר הזה');
  else if (times > 1 && times < 10000) lines.push(`ביקור מספר ${times} מהמכשיר הזה` + (last > 0 && last < Date.now() ? ` (הקודם ${ago(last)})` : ''));
  if (tag) lines.push(`תגית בקישור: ${tag}`);
  lines.push(`זמן באתר: ${duration(body.total)}`);
  if (pages.length) lines.push('', 'עמודים:', ...pages);
  lines.push('', 'מה עשו:', ...(notes.length ? notes.map((n) => `• ${n}`) : ['• רק הסתכלו, בלי ללחוץ על כלום']));
  if (searches.length) lines.push('', `חיפשו במילון: ${searches.join(', ')}`);
  let text = lines.join('\n');
  if (text.length > 3800) text = text.slice(0, 3800) + '…';
  // one message per visit: if they came back and did more, the same message is updated
  const earlier = summaryMessages.get(code);
  if (earlier) {
    const at = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
    if (!(await editMessage(env, earlier.id, `${text}\n\n🔄 עודכן ב-${at}`))) {
      const id = await notify(env, text);
      if (id) summaryMessages.set(code, { id, at: now });
    }
  } else {
    const id = await notify(env, text);
    if (id) summaryMessages.set(code, { id, at: now });
  }
  for (const [k, v] of summaryMessages) if (now - v.at > 6 * 60 * 60 * 1000) summaryMessages.delete(k);
  await logVisit(env, {
    type: body.update ? 'more' : 'summary', code, source: sourceOf(clip(body.ref, 500), ua), device: deviceOf(ua), place,
    network: networkOf(cf), tag, seconds: Math.round(Number(body.total) || 0),
    pages: (Array.isArray(body.pages) ? body.pages : []).slice(-30).map((p) => ({
      page: PAGE_NAMES[clip(p && p.p, 200)] || clip(p && p.p, 200), seconds: Math.round(Number(p && p.s) || 0), scrolled: Math.round(Number(p && p.d) || 0),
    })),
    did: notes, searched: searches,
  });
  return done();
}

// ── Roni's SOS menu: a Telegram message every time she taps a number in it ──

const SOS_TARGETS = {
  alon: 'אלון (בוואטסאפ)',
  mom: 'אמא (בוואטסאפ)',
  dad: 'אבא (בוואטסאפ)',
  'alon-tel': 'אלון (שיחה רגילה)',
  'mom-tel': 'אמא (שיחה רגילה)',
  'dad-tel': 'אבא (שיחה רגילה)',
  '112': 'מוקד החירום האירופי (112)',
  police: 'משטרה (133)',
  ambulance: 'אמבולנס (144)',
  fire: 'מכבי אש (122)',
};
const SOS_MAX_PER_HOUR = 30;
let sosHourStart = 0;
let sosHourCount = 0;

function viennaTime() {
  try {
    return new Date().toLocaleTimeString('he-IL', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return new Date().toISOString().slice(11, 16) + ' UTC';
  }
}

async function handleSos(request, env) {
  const done = () => new Response(null, { status: 204, headers: corsHeaders() });
  if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return done();
  let body = {};
  try {
    const raw = await request.text();
    if (raw.length > 500) return done();
    body = JSON.parse(raw);
  } catch (e) {
    return done();
  }
  const target = SOS_TARGETS[body.to];
  if (!target) return done();

  const now = Date.now();
  if (now - sosHourStart > 60 * 60 * 1000) { sosHourStart = now; sosHourCount = 0; }
  if (sosHourCount >= SOS_MAX_PER_HOUR) return done();
  sosHourCount++;

  const cf = request.cf || {};
  const place = [cf.city, cf.country].filter(Boolean).join(', ') || 'לא ידוע';
  await notify(env, [
    '🆘 רוני לחצה על SOS',
    `מתקשרת ל: ${target}`,
    `השעה באוסטריה: ${viennaTime()}`,
    `מיקום משוער (לפי האינטרנט): ${place}`,
  ].join('\n'));
  return done();
}

// ── Lists Roni keeps on her site, backed up here so every phone and every way of opening the site
// (Safari, the home-screen icon, a link inside WhatsApp) shows the same: her German words and her
// countdowns. The page sends a batch of changes: { ops: [{ op: 'add', <field>: {...} }, { op: 'del', id }] }.
// Adds carry their own id, so sending the same change twice is harmless.

const LIST_SAVES_PER_HOUR = 120;
let listHourStart = 0;
let listHourCount = 0;
const cleanId = (v) => (typeof v === 'string' && /^[a-z0-9]{4,30}$/.test(v) ? v : null);

function cleanWord(w) {
  if (!w || typeof w !== 'object') return null;
  const id = cleanId(w.id);
  const de = typeof w.de === 'string' ? w.de.trim().slice(0, 80) : '';
  const he = typeof w.he === 'string' ? w.he.trim().slice(0, 200) : '';
  if (!id || !de || !he) return null;
  const at = typeof w.at === 'string' && !isNaN(Date.parse(w.at)) ? new Date(w.at).toISOString() : new Date().toISOString();
  return { id, de, he, at };
}

function cleanCountdown(c) {
  if (!c || typeof c !== 'object') return null;
  const id = cleanId(c.id);
  const name = typeof c.name === 'string' ? c.name.trim().slice(0, 60) : '';
  const date = typeof c.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : '';
  const time = typeof c.time === 'string' && /^\d{2}:\d{2}$/.test(c.time) ? c.time : '';
  const emoji = typeof c.emoji === 'string' ? c.emoji.slice(0, 8) : '';
  if (!id || !name || !date) return null;
  return { id, name, date, time, emoji };
}

// Her settings (for now, the site colors she picked); one item per setting, the newest wins.
const HEX = /^#[0-9a-f]{6}$/i;
function cleanPref(p) {
  if (!p || typeof p !== 'object' || p.id !== 'theme') return null;
  const preset = typeof p.preset === 'string' && /^[a-z]{1,20}$/.test(p.preset) ? p.preset : 'sunset';
  const out = { id: 'theme', preset, at: Number.isFinite(p.at) ? Math.round(p.at) : Date.now() };
  for (const k of ['bg', 'card', 'accent']) if (typeof p[k] === 'string' && HEX.test(p[k])) out[k] = p[k].toLowerCase();
  return out;
}

const LISTS = {
  '/words': { path: 'roni/words.json', key: 'words', field: 'word', max: 5000, clean: cleanWord,
    added: 'Roni learned a new German word', changed: "Update Roni's German words" },
  '/countdowns': { path: 'roni/countdowns.json', key: 'countdowns', field: 'item', max: 300, clean: cleanCountdown,
    added: 'Roni added a countdown', changed: "Update Roni's countdowns" },
  '/prefs': { path: 'roni/prefs.json', key: 'prefs', field: 'item', max: 10, clean: cleanPref,
    added: "Save Roni's site colors", changed: "Save Roni's site colors" },
};

async function readList(env, list) {
  const file = await getFile(env, list.path);
  if (!file) return { sha: null, items: [] };
  const data = JSON.parse(base64ToUtf8(file.contentBase64));
  return { sha: file.sha, items: Array.isArray(data[list.key]) ? data[list.key] : [] };
}

async function handleList(request, env, list) {
  if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return json({ ok: false, error: 'forbidden' }, 403);
  try {
    if (request.method === 'GET') {
      const { items } = await readList(env, list);
      return json({ ok: true, [list.key]: items });
    }

    const now = Date.now();
    if (now - listHourStart > 60 * 60 * 1000) { listHourStart = now; listHourCount = 0; }
    if (listHourCount >= LIST_SAVES_PER_HOUR) return json({ ok: false, error: 'too many saves' }, 429);
    listHourCount++;

    const raw = await request.text();
    if (raw.length > 50000) return json({ ok: false, error: 'too large' }, 413);
    const body = JSON.parse(raw);
    const ops = Array.isArray(body.ops) ? body.ops.slice(0, 50) : [];

    for (let attempt = 0; attempt < 3; attempt++) {
      const { sha, items } = await readList(env, list);
      let next = items.slice();
      for (const op of ops) {
        if (op && op.op === 'add') {
          const item = list.clean(op[list.field]);
          if (item && !next.some((x) => x.id === item.id) && next.length < list.max) next.push(item);
        } else if (op && op.op === 'del' && typeof op.id === 'string') {
          next = next.filter((x) => x.id !== op.id);
        }
      }
      if (JSON.stringify(next) === JSON.stringify(items)) return json({ ok: true, [list.key]: items });
      const res = await putFile(env, list.path, utf8ToBase64(JSON.stringify({ [list.key]: next }, null, 2) + '\n'),
        next.length > items.length ? list.added : list.changed, sha);
      if (res.ok) return json({ ok: true, [list.key]: next });
      if (res.status !== 409 && res.status !== 422) throw new Error(`save failed: ${res.status}`);
    }
    throw new Error('save failed after retries');
  } catch (e) {
    console.error(`${list.key}:`, e.message);
    return json({ ok: false, error: 'server error' }, 500);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/contribute') {
      return handleContribute(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/visit') {
      return handleVisit(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/visit-summary') {
      return handleVisitSummary(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/sos') {
      return handleSos(request, env);
    }
    if ((request.method === 'GET' || request.method === 'POST') && LISTS[url.pathname]) {
      return handleList(request, env, LISTS[url.pathname]);
    }
    return json({ ok: false, error: 'not found' }, 404);
  },
};
