/**
 * Helper untuk ekstrak konten dari response markdown Gemini
 */

/**
 * Tunggu sampai response selesai di-generate (aria-busy jadi false)
 * @param {number} timeout - ms maksimal tunggu
 */
export async function waitForResponseDone(page, timeout = 120000) {
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
 * Ambil struktur dari response terakhir saja
 * @returns {Object} { paragraphs, headings, listItems, bold, raw }
 */
export async function getResponseStructured(page, messageId = null) {
  const selector = messageId
    ? `#${messageId}`
    : '.markdown.markdown-main-panel';

  await page.waitForSelector(selector, { visible: true });

  return await page.$$eval(selector, (els) => {
    const last = els[els.length - 1];
    if (!last) return null;

    const paragraphs = [...last.querySelectorAll('p')].map(p => p.innerText.trim()).filter(Boolean);
    const headings   = [...last.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => ({
      level: h.tagName.toLowerCase(),
      text: h.innerText.trim(),
    }));
    const listItems  = [...last.querySelectorAll('li')].map(li => li.innerText.trim()).filter(Boolean);
    const bold       = [...last.querySelectorAll('b,strong')].map(b => b.innerText.trim()).filter(Boolean);
    const raw        = last.innerText.trim();

    return { paragraphs, headings, listItems, bold, raw };
  });
}

/**
 * Hitung jumlah response block yang sudah ada di DOM sekarang
 * Berguna untuk track "mulai dari index berapa" setelah kirim prompt baru
 */
export async function getResponseCount(page) {
  return await page.$$eval('.markdown.markdown-main-panel', els => els.length);
}

/**
 * Scroll page dari atas ke bawah lalu ke atas lagi
 * untuk memastikan semua response ter-render (lazy render)
 * @param {number} stepSize - pixel per langkah scroll
 * @param {number} stepDelay - ms jeda antar langkah
 */
export async function scrollToRenderAll(page, stepSize = 600, stepDelay = 200) {
  // Scroll ke paling atas dulu
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 300));

  // Scroll ke bawah pelan-pelan
  let lastHeight = 0;
  while (true) {
    const currentHeight = await page.evaluate(() => document.body.scrollHeight);
    const scrollY = await page.evaluate(() => window.scrollY + window.innerHeight);

    if (scrollY >= currentHeight) break;

    await page.evaluate((step) => window.scrollBy(0, step), stepSize);
    await new Promise(r => setTimeout(r, stepDelay));

    // Deteksi kalau halaman nambah (lazy load)
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === lastHeight && scrollY >= newHeight) break;
    lastHeight = newHeight;
  }

  // Scroll balik ke atas
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 300));

  console.log('[scroll] Selesai scroll top→bottom→top');
}

/**
 * Ambil SEMUA response dari chat mulai dari index tertentu
 * Panggil scrollToRenderAll() dulu sebelum ini biar semua kerender
 * @param {number} fromIndex - index mulai ambil (0-based), default 0 = semua
 * @returns {Array<Object>} array of { paragraphs, headings, listItems, bold, raw }
 */
export async function getAllResponses(page, fromIndex = 0) {
  return await page.$$eval(
    '.markdown.markdown-main-panel',
    (els, startIdx) => {
      return els.slice(startIdx).map(el => {
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
    },
    fromIndex
  );
}
