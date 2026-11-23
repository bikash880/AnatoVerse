/**
 * Skelly backend — a tiny Node HTTP server (no framework) that keeps the AI API key on the server
 * and proxies tutor questions to Claude (ANTHROPIC_API_KEY) or, as a free alternative, Google
 * Gemini (GEMINI_API_KEY). Claude is used when both are set.
 *
 *   POST /api/skelly/chat    { messages: [{ role, content }], selected?: { name, latin, system } }
 *                         →  { answer, structures: string[] }
 *   GET  /api/skelly/health  { ok, configured }
 *
 * In production (`npm start`) it also serves the built app from dist/.
 * Run directly with Node ≥ 23.6 (built-in TypeScript type stripping):
 *   node --env-file-if-exists=.env server/skelly.ts
 */
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const PORT = Number(process.env.SKELLY_PORT ?? process.env.PORT ?? 8787);
const MODEL = 'claude-opus-5-5';
const MAX_TURNS = 24; // history sent per request (session history beyond this is trimmed client-side)
const MAX_CHARS = 1500; // per message
const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const SYSTEM_PROMPT = [
  'You are Skelly, a friendly skeleton anatomy tutor for medical students. Answer clearly and simply in 3–5 sentences. Reply in the same language the user asks in (English or Hindi).',
  '',
  'You live inside AnatoVerse, a 3D anatomy atlas. Put your reply in `answer`. In `structures`, list in English the specific body structures your answer is mainly about (at most 3, using standard anatomical names such as "Femur", "Biceps brachii", "Heart", "Left ventricle"), so the app can highlight them in 3D; use an empty list if none apply.',
  'When the user asks to be quizzed, ask one question at a time and wait for their answer before revealing it.',
  'Keep the answer as plain text that sounds natural when read aloud: no markdown, lists, headings or emoji.',
].join('\n');

const ReplySchema = z.object({
  answer: z.string(),
  structures: z.array(z.string()),
});

// Credentials are resolved by the SDK from the environment (ANTHROPIC_API_KEY, …) — never sent
// to or stored in the browser.
const client = new Anthropic();
const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
const hasGemini = () => Boolean(process.env.GEMINI_API_KEY?.trim());
const configured = () => hasClaude() || hasGemini();
const provider = () => (hasClaude() ? 'claude' : hasGemini() ? 'gemini' : 'none');
// Tried in order: a model that is retired (404), overloaded (503/500), rate-limited (429) or slow
// falls through to the next one. GEMINI_MODEL in .env goes first.
const GEMINI_MODELS = [
  ...new Set([process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-flash-lite-latest']),
];
const GEMINI_TIMEOUT_MS = 30_000;
const NOT_CONFIGURED = 'Skelly is not configured: add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to the .env file and restart the server.';

/** Error from the Gemini REST call, mapped to HTTP responses in handleChat. */
class GeminiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ChatTurn = { role: 'user' | 'assistant'; content: string };
type ChatRequest = { messages: ChatTurn[]; selected?: { name?: string; latin?: string; system?: string } | null };

/** Validate untrusted request JSON; returns an error string or the clean request. */
function validate(body: unknown): string | ChatRequest {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object.';
  const { messages, selected } = body as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0) return '`messages` must be a non-empty array.';
  const turns = messages.slice(-MAX_TURNS);
  const clean: ChatTurn[] = [];
  for (const m of turns) {
    if (!m || typeof m !== 'object') return 'Each message must be an object.';
    const { role, content } = m as Record<string, unknown>;
    if (role !== 'user' && role !== 'assistant') return 'Message role must be "user" or "assistant".';
    if (typeof content !== 'string' || !content.trim()) return 'Message content must be a non-empty string.';
    clean.push({ role, content: content.slice(0, MAX_CHARS) });
  }
  while (clean.length && clean[0].role !== 'user') clean.shift(); // first turn must be the user
  if (!clean.length || clean[clean.length - 1].role !== 'user') return 'The last message must be from the user.';
  let sel: ChatRequest['selected'] = null;
  if (selected && typeof selected === 'object') {
    const s = selected as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 120) : undefined);
    sel = { name: str(s.name), latin: str(s.latin), system: str(s.system) };
  }
  return { messages: clean, selected: sel };
}

async function askSkelly(req: ChatRequest) {
  if (!configured()) throw new GeminiError(401, 'no key');
  const messages: Anthropic.Beta.BetaMessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
  // The structure selected in the 3D model is context for the newest question only.
  if (req.selected?.name) {
    const last = messages[messages.length - 1];
    const ctx = `[Context: the student currently has "${req.selected.name}"${req.selected.latin ? ` (${req.selected.latin})` : ''}${req.selected.system ? `, ${req.selected.system} system,` : ''} selected in the 3D model.]`;
    last.content = `${ctx}\n${last.content as string}`;
  }

  if (provider() === 'gemini') return askGemini(messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content as string })));

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    // Short tutoring answers: low effort keeps replies fast (Opus 5.5 always thinks; effort is the control).
    output_config: { effort: 'low', format: betaZodOutputFormat(ReplySchema) },
    // If a safety classifier declines, the API retries on a suitable fallback model in the same call.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages,
  });

  if (response.stop_reason === 'refusal') {
    return { answer: "Sorry, I can't help with that one. Try asking me about a bone, muscle or organ!", structures: [] as string[] };
  }
  const parsed = response.parsed_output;
  if (parsed) return { answer: parsed.answer.trim(), structures: parsed.structures.slice(0, 3) };
  // Defensive fallback: plain text if parsing failed (e.g. truncated output)
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
  return { answer: text || 'Hmm, I lost my train of thought. Could you ask that again?', structures: [] as string[] };
}

/** Google Gemini (free tier) via its REST API, with a JSON-schema reply like the Claude path. */
async function askGemini(turns: ChatTurn[]) {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { answer: { type: 'STRING' }, structures: { type: 'ARRAY', items: { type: 'STRING' } } },
        required: ['answer', 'structures'],
      },
    },
  };
  let lastErr: GeminiError | null = null;
  for (const model of GEMINI_MODELS) {
    let r: Response;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': (process.env.GEMINI_API_KEY ?? '').trim() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });
    } catch (e) {
      lastErr = new GeminiError(504, `${model}: ${(e as Error).message}`);
      continue; // timeout / network hiccup -> next model
    }
    const data = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    if (!r.ok) {
      lastErr = new GeminiError(r.status, data.error?.message ?? r.statusText);
      // retired model, overloaded, server error or per-model quota -> try the next model
      if ([404, 429, 500, 503].includes(r.status)) {
        console.warn(`[skelly] ${model} unavailable (${r.status}), trying the next model`);
        continue;
      }
      // an invalid key comes back as 400 INVALID_ARGUMENT ("API key not valid")
      if (r.status === 400 && /api key/i.test(lastErr.message)) lastErr.status = 401;
      throw lastErr;
    }
    const cand = data.candidates?.[0];
    if (data.promptFeedback?.blockReason || cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') {
      return { answer: "Sorry, I can't help with that one. Try asking me about a bone, muscle or organ!", structures: [] as string[] };
    }
    const text = (cand?.content?.parts ?? []).filter((x) => !x.thought).map((x) => x.text ?? '').join('').trim();
    try {
      const parsed = ReplySchema.parse(JSON.parse(text));
      return { answer: parsed.answer.trim(), structures: parsed.structures.slice(0, 3) };
    } catch {
      return { answer: text || 'Hmm, I lost my train of thought. Could you ask that again?', structures: [] as string[] };
    }
  }
  throw lastErr ?? new GeminiError(502, 'No Gemini model available.');
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch {
        reject(new Error('bad_json'));
      }
    });
    req.on('error', reject);
  });
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  let body: unknown;
  try {
    body = await readJson(req);
  } catch (e) {
    return send(res, (e as Error).message === 'too_large' ? 413 : 400, { error: 'Invalid request body.' });
  }
  const v = validate(body);
  if (typeof v === 'string') return send(res, 400, { error: v });
  try {
    send(res, 200, await askSkelly(v));
  } catch (err) {
    if (err instanceof GeminiError) {
      if (!configured()) return send(res, 503, { error: NOT_CONFIGURED, code: 'not_configured' });
      console.error(`[skelly] Gemini error ${err.status}:`, err.message);
      if (err.status === 401 || err.status === 403) return send(res, 503, { error: 'Skelly is not configured: the Gemini API key is missing or invalid.', code: 'not_configured' });
      if (err.status === 429) return send(res, 429, { error: 'Skelly has used up the free Gemini limit for now. Please try again in a minute.', code: 'rate_limited' });
      if (err.status === 503 || err.status === 500 || err.status === 504) return send(res, 503, { error: 'Google’s free AI service is very busy right now. Please try again in a moment.', code: 'busy' });
      return send(res, 502, { error: 'Skelly could not reach the AI service. Please try again.', code: 'upstream' });
    }
    // Most specific first (SDK typed errors), never string-matching messages.
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      return send(res, 503, { error: 'Skelly is not configured: the server API key is missing or invalid.', code: 'not_configured' });
    }
    if (err instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'Skelly is busy right now — please try again in a moment.', code: 'rate_limited' });
    if (err instanceof Anthropic.BadRequestError) {
      console.error('[skelly] bad request:', err.message);
      return send(res, 400, { error: 'Skelly could not process that question.', code: 'bad_request' });
    }
    if (err instanceof Anthropic.APIError && err.status) {
      console.error(`[skelly] API error ${err.status}:`, err.message);
      return send(res, 502, { error: 'Skelly could not reach the AI service. Please try again.', code: 'upstream' });
    }
    if (err instanceof Anthropic.APIConnectionError) return send(res, 502, { error: 'Skelly could not reach the AI service. Check the server’s internet connection.', code: 'upstream' });
    // No credentials at all → the SDK throws before sending
    if (!configured()) return send(res, 503, { error: NOT_CONFIGURED, code: 'not_configured' });
    console.error('[skelly] unexpected error:', err);
    return send(res, 500, { error: 'Something went wrong in Skelly’s brain.', code: 'internal' });
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
};

/** Serve the production build (npm start). In development Vite serves the app and proxies /api here. */
function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (!fs.existsSync(DIST)) return send(res, 404, { error: 'Not found. Run `npm run build` first, or use `npm run dev`.' });
  const url = new URL(req.url ?? '/', 'http://x');
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) return send(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/api/skelly/chat') && req.method === 'POST') return void handleChat(req, res);
  if (url.startsWith('/api/skelly/health')) return send(res, 200, { ok: true, configured: configured(), provider: provider(), model: provider() === 'gemini' ? GEMINI_MODELS[0] : MODEL });
  if (url.startsWith('/api/')) return send(res, 404, { error: 'Unknown API route.' });
  if (req.method === 'GET') return serveStatic(req, res);
  send(res, 405, { error: 'Method not allowed.' });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[skelly] Port ${PORT} is already in use — another Skelly server is probably running. Stop it, or set SKELLY_PORT to a free port.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const using = provider() === 'claude' ? `Claude ${MODEL}` : provider() === 'gemini' ? `Gemini ${GEMINI_MODELS[0]}, free tier` : 'NO API KEY: add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY to .env';
  console.log(`[skelly] API listening on http://localhost:${PORT}  (${using})`);
});
