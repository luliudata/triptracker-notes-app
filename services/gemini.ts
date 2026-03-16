/**
 * Gemini API service.
 *
 * DEV mode  – calls Google directly using EXPO_PUBLIC_GEMINI_API_KEY (fast to test).
 * PROD mode – calls your own proxy server so the key never ships in the app bundle.
 *
 * Set EXPO_PUBLIC_GEMINI_PROXY_URL to enable proxy mode.
 * When the proxy URL is set the direct key is ignored even if present.
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const DIRECT_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function getConfig() {
  const directKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
  const proxyUrl = process.env.EXPO_PUBLIC_GEMINI_PROXY_URL ?? '';
  const useProxy = proxyUrl.length > 0;
  return { directKey, proxyUrl, useProxy };
}

async function callGemini(body: Record<string, unknown>): Promise<any> {
  const { directKey, proxyUrl, useProxy } = getConfig();

  if (!useProxy && !directKey) {
    throw new Error('Missing Gemini configuration. Set EXPO_PUBLIC_GEMINI_API_KEY (dev) or EXPO_PUBLIC_GEMINI_PROXY_URL (prod).');
  }

  const url = useProxy
    ? proxyUrl
    : `${DIRECT_BASE}?key=${encodeURIComponent(directKey)}`;

  console.log('[Gemini] Calling API...', useProxy ? '(proxy)' : '(direct)', 'key length:', directKey.length);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[Gemini] API error:', res.status, text.slice(0, 500));
    let shortMsg = `Gemini API ${res.status}`;
    try {
      const errJson = JSON.parse(text);
      shortMsg += ': ' + (errJson?.error?.message ?? text.slice(0, 120));
    } catch {
      shortMsg += ': ' + text.slice(0, 120);
    }
    throw new Error(shortMsg);
  }

  return res.json();
}

function extractText(json: any): string {
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function generateItinerary(prompt: string): Promise<string> {
  const json = await callGemini({
    contents: [{ parts: [{ text: prompt }] }],
  });
  return extractText(json);
}

export interface VoiceItem {
  itemName: string;
  categoryName: string;
  categoryIcon: string;
}

export async function processVoiceAudio(
  base64Audio: string,
  mimeType: string,
  systemPrompt: string,
): Promise<VoiceItem[]> {
  const json = await callGemini({
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64Audio } },
        { text: systemPrompt },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            itemName: { type: 'STRING' },
            categoryName: { type: 'STRING' },
            categoryIcon: { type: 'STRING' },
          },
          required: ['itemName', 'categoryName', 'categoryIcon'],
        },
      },
    },
  });
  const text = extractText(json);
  return text ? JSON.parse(text) : [];
}

export function isConfigured(): boolean {
  const { directKey, proxyUrl, useProxy } = getConfig();
  return useProxy || directKey.length > 0;
}
