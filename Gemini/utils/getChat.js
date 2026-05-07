/**
 * Helper untuk ekstrak konten dari response markdown Gemini
 */

/**
 * Ambil semua teks plain dari satu response block
 * @param {Page} page
 * @param {string} messageId - id elemen (opsional, default ambil semua)
 */
async function getResponseText(page, messageId = null) {
  const selector = messageId
    ? `#${messageId}`
    : '.markdown.markdown-main-panel';

  await page.waitForSelector(selector, { visible: true });

  return await page.$eval(selector, el => el.innerText.trim());
}

/**
 * Ambil struktur lengkap: paragraf, list, heading per block
 * @returns {Object} { paragraphs, headings, listItems, raw }
 */
export async function getResponseStructured(page, messageId = null) {
  const selector = messageId
    ? `#${messageId}`
    : '.markdown.markdown-main-panel';

  await page.waitForSelector(selector, { visible: true });

  return await page.$eval(selector, (el) => {
    const paragraphs = [...el.querySelectorAll('p')].map(p => p.innerText.trim()).filter(Boolean);
    const headings   = [...el.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => ({
      level: h.tagName.toLowerCase(),
      text: h.innerText.trim(),
    }));
    const listItems  = [...el.querySelectorAll('li')].map(li => li.innerText.trim()).filter(Boolean);
    const bold       = [...el.querySelectorAll('b,strong')].map(b => b.innerText.trim()).filter(Boolean);
    const raw        = el.innerText.trim();

    return { paragraphs, headings, listItems, bold, raw };
  });
}

/**
 * Ambil response terakhir (paling bawah) dari chat
 */
async function getLastResponse(page) {
  return await page.$$eval('.markdown.markdown-main-panel', (els) => {
    const last = els[els.length - 1];
    return last ? last.innerText.trim() : null;
  });
}

/**
 * Tunggu sampai response selesai di-generate (aria-busy jadi false)
 * @param {number} timeout - ms maksimal tunggu
 */
export async function waitForResponseDone(page, timeout = 60000) {
  await page.waitForFunction(
    () => {
      const els = document.querySelectorAll('.markdown.markdown-main-panel[aria-busy]');
      if (!els.length) return false;
      const last = els[els.length - 1];
      return last.getAttribute('aria-busy') === 'false';
    },
    { timeout, polling: 500 }
  );
}

/**
 * Combo: tunggu selesai lalu langsung ambil teks terakhir
 */
async function waitAndGetLastResponse(page, timeout = 60000) {
  await waitForResponseDone(page, timeout);
  return await getLastResponse(page);
}

