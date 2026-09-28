const REPO = 'alonzvisabag/alonzvisabag.github.io';
const BRANCH = 'main';
const CONTENT_PATH = 'roni/content.json';
const MEDIA_DIR = 'roni/media';
const ALLOWED_ORIGIN = 'https://alonzvisabag.github.io';

const MEDIA_EXT_WHITELIST = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'wav', 'm4a', 'ogg', 'aac', 'mp4', 'mov', 'webm', 'm4v'];
const VALID_TYPES = ['letter', 'audio', 'video', 'photo'];
const MAX_TEXT = 20000;
const FLOOD_WINDOW_MS = 10 * 60 * 1000;
const FLOOD_MAX = 30;

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

async function readContent(env) {
  const file = await getFile(env, CONTENT_PATH);
  if (!file) throw new Error('content.json not found');
  return { sha: file.sha, data: JSON.parse(base64ToUtf8(file.contentBase64)) };
}

function recentCount(data) {
  const since = Date.now() - FLOOD_WINDOW_MS;
  let n = 0;
  for (const c of data.capsules || []) {
    for (const it of c.items || []) {
      if (Date.parse(it.sentAt || '') > since) n++;
    }
  }
  return n;
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

async function addItemToContent(env, { capsuleId, newCapsule }, item) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const file = await readContent(env);
    const data = file.data;

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
    const newBase64 = utf8ToBase64(JSON.stringify(data, null, 2) + '\n');
    const res = await putFile(env, CONTENT_PATH, newBase64, `contribute: add item to ${capsule.id}`, file.sha);
    if (res.ok) return capsule;
    if (res.status === 409 && attempt < 2) continue;
    const errText = await res.text();
    throw new Error(`failed to update content.json: ${res.status} ${errText}`);
  }
  throw new Error('failed to update content.json after retries');
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

  const { capsuleId, newCapsule, from, text, mediaBase64, mediaExt, website } = body;

  if (typeof website === 'string' && website.trim()) {
    return json({ ok: true });
  }

  if (typeof from === 'string' && from.length > 60) {
    return json({ ok: false, error: 'name too long' }, 400);
  }

  if (typeof text === 'string' && text.length > MAX_TEXT) {
    return json({ ok: false, error: 'text too long' }, 400);
  }

  const hasExisting = typeof capsuleId === 'string' && capsuleId.length > 0;
  let cleanNewCapsule = null;
  if (!hasExisting) {
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
    current = await readContent(env);
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

  let mediaFilename = null;
  if (hasMedia) {
    const prefix = (hasExisting ? capsuleId : 'custom').replace(/[^a-zA-Z0-9-]/g, '');
    mediaFilename = `${prefix}-${Date.now()}.${ext}`;
    const res = await putFile(
      env,
      `${MEDIA_DIR}/${mediaFilename}`,
      mediaBase64,
      `contribute: add media for ${hasExisting ? capsuleId : 'new capsule'}`
    );
    if (!res.ok) {
      console.error('media upload failed', res.status, await res.text());
      await notify(env, 'עדכון');
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
    await addItemToContent(env, { capsuleId: hasExisting ? capsuleId : null, newCapsule: cleanNewCapsule }, item);
  } catch (e) {
    console.error('save failed', e.message);
    await notify(env, 'עדכון');
    return json({ ok: false, error: 'server error' }, 500);
  }

  await notify(env, 'עדכון');

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
