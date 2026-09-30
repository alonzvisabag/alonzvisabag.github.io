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
const MERGE_WINDOW_MS = 15 * 60 * 1000;

async function notify(env, text) {
  const token = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) {
    console.log('notify: telegram not configured, skipping');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      console.error('notify: telegram send failed', res.status, await res.text());
    } else {
      console.log('notify: telegram send ok');
    }
  } catch (e) {
    console.error('notify: telegram send threw', e.message);
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

// How many greetings Galit's page shows: entries from the same person a few minutes apart are one
// greeting sent in parts (a recording and some photos). Must match mergeGreetings in galit/greetings.js.
function greetingCount(list) {
  const cards = [];
  for (const g of list) {
    const from = (g.from || '').trim();
    const at = Date.parse(g.sentAt || '') || 0;
    let card = null;
    for (let i = cards.length - 1; i >= 0; i--) {
      const c = cards[i];
      if (at - c.lastAt > MERGE_WINDOW_MS) break;
      if (from && at && c.from === from && c.group === g.group) { card = c; break; }
    }
    if (!card) {
      card = { from, group: g.group, lastAt: at };
      cards.push(card);
    }
    card.lastAt = Math.max(card.lastAt, at);
  }
  return cards.length;
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

  const { capsuleId, newCapsule, from, text, mediaBase64, mediaExt, website, group } = body;
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
        data.greetings.push({ ...item, group });
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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/contribute') {
      return handleContribute(request, env);
    }
    return json({ ok: false, error: 'not found' }, 404);
  },
};
