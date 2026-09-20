'use strict';

/**
 * NANAL / NANAL local proxy server.
 *
 * The OpenAI API key is read from `.env` on this machine and never leaves the
 * server process: the browser talks only to this server, so the key is not in
 * the page source, not in the network tab, and not in the repository.
 *
 *   1. cp .env.example .env
 *   2. put your key in .env   (OPENAI_API_KEY=sk-...)
 *   3. npm start              (or: node server.js)
 *
 *   http://localhost:5173/gift.html           the NANAL gift box
 *   http://localhost:5173/letter-studio.html  the NANAL letter studio
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 5173);
const API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

// ato-project.md originally specified gpt-5-mini and gpt-4o-mini-transcribe.
// Both are on OpenAI's retirement list, so the defaults below are their current
// equivalents. Override either one in .env without touching this file.
const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-5.6-luna';
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 2000;
const MAX_PROMPT_CHARS = 8000;
const UPSTREAM_TIMEOUT_MS = 30000;
const STREAM_TIMEOUT_MS = 120000;

// Pages live in two folders, so they are mapped to clean URLs here rather than
// exposing folder names that contain spaces.
const APP_DIR = __dirname;
const SITE_DIR = path.join(__dirname, '..', '00 website');
const ALIASES = {
  '/': path.join(APP_DIR, 'gift.html'),
  '/gift.html': path.join(APP_DIR, 'gift.html'),
  '/letter-studio.html': path.join(SITE_DIR, 'letter-studio.html'),
  '/ato.html': path.join(SITE_DIR, 'ato.html'),
};

// OpenAI infers the audio format from the filename, so the extension has to
// match what the browser actually recorded (webm on Chrome, mp4 on Safari).
const AUDIO_EXTENSIONS = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'application/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mpga': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

const SYSTEM_PROMPT = `당신은 '나날(NANAL)'이라는 이름의 선물 상자입니다. '나날'은 '날마다, 매일'을 뜻하는 순우리말입니다.
따뜻하고 명랑하며 항상 존댓말로 말합니다. 누군가의 특별한 날을 오래 간직할 추억으로 만드는 일을 좋아하고,
한아름·아름드리·도담도담 같은 예쁜 순우리말을 즐겨 씁니다.

사용자가 들려준 이야기를 읽고 아래 JSON 형식으로만 답하세요. 다른 텍스트는 절대 덧붙이지 마세요.

{"special_day": boolean, "occasion": string, "hero": string, "card": string, "bubble": string}

판단 기준 (엄격하게 적용):
- special_day 는 이야기에 "어떤 특별한 날인지"와 "누구를 위한 날인지"가 둘 다 나와야만 true 입니다.
- 생일, 결혼식, 졸업, 돌잔치, 프로포즈, 기념일, 연말 등이 특별한 날에 해당합니다.
- "오늘 기분이 좋아요" 같은 잡담이나 막연한 말은 둘 중 하나라도 빠지면 false 입니다.
- 둘 중 하나라도 없으면 occasion 과 hero 는 빈 문자열로 두세요.

작성 규칙:
- 모든 문장은 한국어 존댓말입니다.
- special_day 가 true 이면: card 는 그 사람과 그 날을 위한 축하 메시지 2~3문장,
  bubble 은 상자가 신이 나서 건네는 한 문장입니다.
- special_day 가 false 이면: card 는 빈 문자열로 두고,
  bubble 은 상자가 조금 시무룩해하며 특별한 날 이야기를 들려달라고 청하는 한 문장입니다.`;

// ---------------------------------------------------------------- utilities

function loadEnvFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return; // no .env yet — /api/health will report it
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (value.length > 1 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function callOpenAI(endpoint, init) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...init,
    headers: { authorization: `Bearer ${API_KEY}`, ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* upstream returned non-JSON */
  }
  return { ok: response.ok, status: response.status, text, json: parsed };
}

/** Pull the assistant's text out of either a Responses or a Chat Completions payload. */
function extractText(payload) {
  if (!payload) return '';
  if (typeof payload.output_text === 'string' && payload.output_text) return payload.output_text;
  if (Array.isArray(payload.output)) {
    const parts = [];
    for (const item of payload.output) {
      for (const piece of item?.content || []) {
        if (typeof piece?.text === 'string') parts.push(piece.text);
      }
    }
    if (parts.length) return parts.join('');
  }
  const message = payload.choices?.[0]?.message?.content;
  if (typeof message === 'string') return message;
  return '';
}

/** One text delta out of a streamed Responses or Chat Completions event. */
function extractDelta(event) {
  if (event?.type === 'response.output_text.delta' && typeof event.delta === 'string') return event.delta;
  const chunk = event?.choices?.[0]?.delta?.content;
  return typeof chunk === 'string' ? chunk : '';
}

function parseModelJson(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

/** Ask the text model, preferring the Responses API and falling back to Chat Completions. */
async function askModel(story) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: story },
  ];

  let result = await callOpenAI('/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_MODEL,
      input: messages,
      text: { format: { type: 'json_object' } },
    }),
  });

  if (!result.ok && (result.status === 404 || result.status === 400)) {
    result = await callOpenAI('/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages,
        response_format: { type: 'json_object' },
      }),
    });
  }

  return result;
}

/** Open a streaming completion, preferring Responses and falling back to Chat Completions. */
async function openStream(prompt, signal) {
  const request = (endpoint, payload) =>
    fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

  let response = await request('/responses', {
    model: TEXT_MODEL,
    input: [{ role: 'user', content: prompt }],
    stream: true,
  });

  if (!response.ok && (response.status === 404 || response.status === 400)) {
    await response.text().catch(() => '');
    response = await request('/chat/completions', {
      model: TEXT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });
  }

  return response;
}

// ----------------------------------------------------------------- handlers

async function handleStory(req, res) {
  if (!API_KEY) {
    return sendJson(res, 503, { error: 'no_key', message: '.env 에 OPENAI_API_KEY 가 설정되지 않았습니다.' });
  }

  const raw = await readBody(req, 64 * 1024);
  const body = parseModelJson(raw.toString('utf8')) || {};
  const story = String(body.text || '').trim().slice(0, MAX_TEXT_CHARS);

  if (!story) {
    return sendJson(res, 400, { error: 'empty_text', message: '이야기가 비어 있습니다.' });
  }

  const result = await askModel(story);

  if (!result.ok) {
    const message = result.json?.error?.message || `OpenAI 오류 (HTTP ${result.status})`;
    console.error(`[story] upstream ${result.status}: ${message}`);
    return sendJson(res, 502, { error: 'upstream', message });
  }

  const parsed = parseModelJson(extractText(result.json));
  if (!parsed) {
    console.error('[story] could not parse model output as JSON');
    return sendJson(res, 502, { error: 'bad_json', message: '모델 응답을 JSON 으로 읽지 못했습니다.' });
  }

  sendJson(res, 200, {
    special_day: Boolean(parsed.special_day),
    occasion: String(parsed.occasion || ''),
    hero: String(parsed.hero || ''),
    card: String(parsed.card || ''),
    bubble: String(parsed.bubble || ''),
  });
}

/** Streams plain text back to the page, so the card appears before the letter finishes. */
async function handleLetter(req, res) {
  if (!API_KEY) {
    return sendJson(res, 503, { error: 'no_key', message: '.env 에 OPENAI_API_KEY 가 설정되지 않았습니다.' });
  }

  const raw = await readBody(req, 64 * 1024);
  const body = parseModelJson(raw.toString('utf8')) || {};
  const prompt = String(body.prompt || '').trim().slice(0, MAX_PROMPT_CHARS);

  if (!prompt) {
    return sendJson(res, 400, { error: 'empty_prompt', message: '프롬프트가 비어 있습니다.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  res.on('close', () => controller.abort());

  let upstream;
  try {
    upstream = await openStream(prompt, controller.signal);
  } catch (error) {
    clearTimeout(timer);
    console.error('[letter] upstream request failed:', error?.message || error);
    if (!res.headersSent) sendJson(res, 502, { error: 'upstream', message: 'OpenAI 에 연결하지 못했습니다.' });
    return;
  }

  if (!upstream.ok) {
    clearTimeout(timer);
    const text = await upstream.text().catch(() => '');
    let message;
    try {
      message = JSON.parse(text)?.error?.message;
    } catch {
      /* non-JSON error body */
    }
    console.error(`[letter] upstream ${upstream.status}: ${message || text.slice(0, 200)}`);
    const code = upstream.status === 429 ? 'rate_limited' : 'upstream';
    return sendJson(res, 502, { error: code, message: message || `OpenAI 오류 (HTTP ${upstream.status})` });
  }

  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  });

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let event;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = extractDelta(event);
          if (delta) res.write(delta);
        }
      }
    }
  } catch (error) {
    if (error?.name !== 'AbortError') console.error('[letter] stream error:', error?.message || error);
  } finally {
    clearTimeout(timer);
    res.end();
  }
}

async function handleTranscribe(req, res) {
  if (!API_KEY) {
    return sendJson(res, 503, { error: 'no_key', message: '.env 에 OPENAI_API_KEY 가 설정되지 않았습니다.' });
  }

  const audio = await readBody(req, MAX_AUDIO_BYTES);
  if (!audio.length) {
    return sendJson(res, 400, { error: 'empty_audio', message: '오디오가 비어 있습니다.' });
  }

  const contentType = (req.headers['content-type'] || 'audio/webm').split(';')[0].trim().toLowerCase();
  const extension = AUDIO_EXTENSIONS[contentType] || 'webm';

  const form = new FormData();
  form.append('file', new Blob([audio], { type: contentType }), `story.${extension}`);
  form.append('model', TRANSCRIBE_MODEL);
  form.append('language', 'ko');

  const result = await callOpenAI('/audio/transcriptions', { method: 'POST', body: form });

  if (!result.ok) {
    const message = result.json?.error?.message || `OpenAI 오류 (HTTP ${result.status})`;
    console.error(`[transcribe] upstream ${result.status}: ${message}`);
    return sendJson(res, 502, { error: 'upstream', message });
  }

  sendJson(res, 200, { text: String(result.json?.text || '') });
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res, pathname) {
  let target = ALIASES[pathname];

  if (!target) {
    const relative = decodeURIComponent(pathname);
    // no dotfiles (.env, .git) and nothing outside the app folder
    if (relative.split('/').some((segment) => segment.startsWith('.'))) {
      return sendJson(res, 404, { error: 'not_found' });
    }
    target = path.join(APP_DIR, relative);
    if (!target.startsWith(APP_DIR + path.sep)) {
      return sendJson(res, 404, { error: 'not_found' });
    }
  }

  try {
    const data = await fsp.readFile(target);
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
      'content-length': data.length,
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: 'not_found', message: `${pathname} 을(를) 찾을 수 없습니다.` });
  }
}

// ------------------------------------------------------------------- server

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        configured: Boolean(API_KEY),
        textModel: TEXT_MODEL,
        transcribeModel: TRANSCRIBE_MODEL,
      });
    }
    if (req.method === 'POST' && pathname === '/api/story') return await handleStory(req, res);
    if (req.method === 'POST' && pathname === '/api/letter') return await handleLetter(req, res);
    if (req.method === 'POST' && pathname === '/api/transcribe') return await handleTranscribe(req, res);
    if (req.method === 'GET' || req.method === 'HEAD') return await serveStatic(req, res, pathname);
    sendJson(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    const status = error?.status || 500;
    console.error(`[${req.method} ${pathname}]`, error?.message || error);
    if (!res.headersSent) sendJson(res, status, { error: 'server_error', message: error?.message || 'unknown error' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  NANAL     http://localhost:${PORT}/gift.html`);
  console.log(`  NANAL   http://localhost:${PORT}/letter-studio.html`);
  console.log(`  text: ${TEXT_MODEL}   transcribe: ${TRANSCRIBE_MODEL}`);
  console.log(
    API_KEY
      ? '  key:  loaded from .env\n'
      : '  key:  MISSING — copy .env.example to .env and add OPENAI_API_KEY\n'
  );
});
