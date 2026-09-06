/**
 * AI Agent via Ollama
 * - identifyPopup(page)  → deteksi popup menggunakan Qwen2.5vl (vision)
 * - askVision(page, q)   → tanya sesuatu berdasarkan screenshot
 */

const OLLAMA_BASE = 'http://100.65.224.93:11434';
const VISION_MODEL = 'qwen2.5vl:latest';

/**
 * Ambil screenshot halaman, kirim ke Qwen2.5vl, tanya ada popup apa.
 * @param {import('playwright').Page} page
 * @returns {Promise<'privacy_policy'|'consent'|'sign_in'|'welcome'|'other'|'none'>}
 */
export async function identifyPopup(page) {
  try {
    const screenshot = await page.screenshot({ encoding: 'base64' });

    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VISION_MODEL,
        prompt: `This is a screenshot of Google Flow (an AI image/video generation web app).
Is there a modal, popup, dialog, or overlay blocking the main interface?

Answer with ONLY one of these exact words (no explanation):
- privacy_policy   (privacy/terms of service dialog to scroll and accept)
- consent          (research consent modal with checkboxes)
- sign_in          (sign in to Flow button or dialog)
- welcome          (onboarding slides, "what's new", or "get started" dialog)
- none             (no popup visible, the main interface is accessible)
- other            (some other blocking element)`,
        images: [screenshot],
        stream: false,
      }),
    });

    if (!res.ok) {
      console.warn(`[AI] Ollama HTTP error: ${res.status}`);
      return 'none';
    }

    const data = await res.json();
    // Ambil hanya baris pertama, lowercase, trim
    const answer = (data.response ?? '').trim().toLowerCase().split(/[\n\r]/)[0].trim();
    console.log(`[AI] identifyPopup → "${answer}"`);
    return answer;
  } catch (err) {
    console.warn('[AI] identifyPopup gagal:', err.message);
    return 'none'; // safe default: anggap tidak ada popup
  }
}

/**
 * Tanya AI berdasarkan screenshot — untuk debugging atau fallback custom.
 * @param {import('playwright').Page} page
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function askVision(page, question) {
  try {
    const screenshot = await page.screenshot({ encoding: 'base64' });

    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VISION_MODEL,
        prompt: question,
        images: [screenshot],
        stream: false,
      }),
    });

    if (!res.ok) {
      console.warn(`[AI] Ollama HTTP error: ${res.status}`);
      return '';
    }

    const data = await res.json();
    return (data.response ?? '').trim();
  } catch (err) {
    console.warn('[AI] askVision gagal:', err.message);
    return '';
  }
}
