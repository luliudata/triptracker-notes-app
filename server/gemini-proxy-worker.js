/**
 * Cloudflare Worker — Gemini API proxy.
 *
 * Deploy this as a Cloudflare Worker, then set:
 *   EXPO_PUBLIC_GEMINI_PROXY_URL=https://your-worker.your-subdomain.workers.dev
 *
 * Setup:
 *   1. npm create cloudflare@latest gemini-proxy
 *   2. Replace the generated worker code with this file.
 *   3. Run: npx wrangler secret put GEMINI_API_KEY   (paste your key when prompted)
 *   4. Run: npx wrangler deploy
 *
 * The worker forwards requests to Gemini and keeps GEMINI_API_KEY server-side.
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: missing GEMINI_API_KEY secret' }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.text();
      const geminiRes = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      const data = await geminiRes.text();
      return new Response(data, {
        status: geminiRes.status,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
