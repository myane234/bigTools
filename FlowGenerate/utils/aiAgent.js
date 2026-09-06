/**
 * AI Agent via Ollama API
 * - identifyPopup(page)  → deteksi popup menggunakan Qwen2.5vl (vision)
 * - askVision(page, q)   → tanya sesuatu berdasarkan screenshot
 */

const OLLAMA_BASE = process.env.OLLAMA_HOST || 'http://100.65.224.93:11434';
const VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen2.5vl:latest';

/**
 * Helper internal untuk memanggil Ollama (mencoba /api/chat dulu, fallback /api/generate)
 */
async function callOllamaVision(promptText, imageInput) {
  let cleanImage = '';

  // 1. Handling Base64: pastikan input siap dibaca Ollama (mencegah error unmarshal)
  if (Buffer.isBuffer(imageInput)) {
    cleanImage = imageInput.toString('base64');
  } else if (typeof imageInput === 'string') {
    cleanImage = imageInput.replace(/^data:image\/\w+;base64,/, '').trim();
  } else {
    console.warn('[AI] Error: Format gambar tidak valid. Harus Buffer atau String.');
    return '';
  }

  // 2. Set parameter AI agar deterministik dan hemat token
  const optionsPayload = {
    temperature: 0,
    num_predict: 20 
  };

  // 3. Coba /api/chat (standar Ollama untuk vision model)
  try {
    const chatRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: promptText,
            images: [cleanImage],
          },
        ],
        options: optionsPayload,
        stream: false,
      }),
    });

    if (chatRes.ok) {
      const data = await chatRes.json();
      return (data.message?.content ?? '').trim();
    }

    const errText = await chatRes.text().catch(() => '');
    console.warn(`[AI] /api/chat status ${chatRes.status}: ${errText}`);
  } catch (err) {
    console.warn(`[AI] Gagal memanggil /api/chat: ${err.message}`);
  }

  // 4. Fallback ke /api/generate jika /api/chat gagal
  try {
    const genRes = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VISION_MODEL,
        prompt: promptText,
        images: [cleanImage],
        options: optionsPayload,
        stream: false,
      }),
    });

    if (genRes.ok) {
      const data = await genRes.json();
      return (data.response ?? '').trim();
    }

    const errText = await genRes.text().catch(() => '');
    console.warn(`[AI] /api/generate status ${genRes.status}: ${errText}`);
  } catch (err) {
    console.warn(`[AI] Gagal memanggil /api/generate: ${err.message}`);
  }

  return '';
}

/**
 * Ambil screenshot halaman, kirim ke Qwen2.5vl, tanya ada popup apa.
 * @param {import('playwright').Page} page
 * @returns {Promise<'privacy_policy'|'consent'|'sign_in'|'welcome'|'other'|'none'>}
 */
export async function identifyPopup(page) {
  try {
    // 5. Kompresi JPEG kualitas 60% agar transmisi inference jauh lebih cepat
    const screenshot = await page.screenshot({ 
      type: 'jpeg', 
      quality: 60, 
      encoding: 'base64' 
    });

    const prompt = `This is a screenshot of Google Flow (an AI image/video generation web app).
Is there a modal, popup, dialog, or overlay blocking the main interface?

Answer with ONLY one of these exact words (no explanation):
- privacy_policy   (privacy/terms of service dialog to scroll and accept)
- consent          (research consent modal with checkboxes)
- sign_in          (sign in to Flow button or dialog)
- welcome          (onboarding slides, "what's new", or "get started" dialog)
- none             (no popup visible, the main interface is accessible)
- other            (some other blocking element)`;

    const reply = await callOllamaVision(prompt, screenshot);
    if (!reply) return 'none';

    // 6. Ekstraksi keyword agar kebal markdown (misal AI jawab: **none**)
    const rawAnswer = reply.toLowerCase();
    const validCategories = ['privacy_policy', 'consent', 'sign_in', 'welcome', 'other', 'none'];
    const matchedCategory = validCategories.find(cat => rawAnswer.includes(cat));

    const finalAnswer = matchedCategory || 'none';
    console.log(`🤖 [AI Vision] identifyPopup raw: "${reply}" → parsed: "${finalAnswer}"`);
    
    return finalAnswer;
  } catch (err) {
    console.warn('[AI] identifyPopup gagal:', err.message);
    return 'none';
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
    const screenshot = await page.screenshot({ 
      type: 'jpeg', 
      quality: 70, 
      encoding: 'base64' 
    });
    return await callOllamaVision(question, screenshot);
  } catch (err) {
    console.warn('[AI] askVision gagal:', err.message);
    return '';
  }
}