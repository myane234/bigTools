import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { identifyPopup, askVision } from './aiAgent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const textBox = '[contenteditable="true"]';
const testingGambarPath = './GambarTesting';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const flowApiMarkers = [
  '/asb/',
  'flow.google.com/asb/',
  '/fx/api/trpc/media.getMediaUrlRedirect',
  'flow-content.google/image',
];

function checkDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Direktori ${dirPath} berhasil dibuat`);
    }
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

/**
 * Pengecekan apakah notifikasi batas penggunaan / kuota habis muncul
 */
export async function checkQuotaLimitError(page) {
  try {
    const errorMsgLocators = [
      page.locator('.error-message'),
      page.locator('.error-message-text'),
      page.locator('.error-subtitle'),
      page.getByText(/Anda telah mencapai batas penggunaan/i),
      page.getByText(/Anda telah mencapai batas kuota/i),
      page.getByText(/Kuota Agen Alat habis/i),
    ];

    for (const loc of errorMsgLocators) {
      if (await loc.count() > 0 && await loc.first().isVisible()) {
        const text = await loc.first().innerText().catch(() => '');
        if (
          text.includes('batas penggunaan') ||
          text.includes('batas kuota') ||
          text.includes('Kuota Agen') ||
          text.includes('Gagal')
        ) {
          console.log('🚨 Peringatan: Batas penggunaan / kuota tercapai!');
          return true;
        }
      }
    }
  } catch (err) {
    // ignore
  }
  return false;
}

/**
 * Tangani Agent Panel Header & Agent mode toggle chip
 * 1. Jika .agent-panel-header ada, klik tombol Close (aria-label="Close")
 * 2. Jika aria-pressed="true" pada chip Agent, klik agar menjadi false
 */
export async function ensureAgentModeDisabled(page) {
  try {
    // 1. Tutup agent panel header jika terbuka di awal
    const headerCloseBtn = page.locator('.agent-panel-header button[aria-label="Close"]').first();
    if (await headerCloseBtn.count() > 0 && await headerCloseBtn.isVisible()) {
      console.log('✖️ Menutup agent-panel-header...');
      await headerCloseBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // 2. Cek Agent mode toggle chip
    const agentBtn = page.locator('button.agent-mode-chip, button:has-text("Agent")').first();
    if (await agentBtn.count() > 0) {
      const isPressed = await agentBtn.getAttribute('aria-pressed');
      if (isPressed === 'true') {
        console.log('🤖 Agent mode aktif (aria-pressed="true"), menonaktifkan...');
        await agentBtn.click();
        await page.waitForTimeout(500);
      }
    }
  } catch (err) {
    console.warn('⚠️ Gagal mengecek/menonaktifkan Agent mode:', err.message);
  }
}

/**
 * Tangani Pengaturan Canvas (Image vs Video, 16:9, Nano Banana Pro, x2)
 */
export async function ensureCanvasSettings(page) {
  try {
    const summaryBtn = page.locator('.settings-summary, button:has(.settings-summary)').first();

    if (await summaryBtn.count() > 0 && await summaryBtn.isVisible()) {
      const summaryText = await summaryBtn.innerText().catch(() => '');

      // Jika masih dalam mode Video atau tidak sesuai
      if (summaryText.includes('Video') || !summaryText.includes('Image')) {
        console.log('🎨 Mengubah pengaturan canvas ke Image, 16:9, Nano Banana Pro, x2...');
        await summaryBtn.click();
        await page.waitForTimeout(1000);

        // Pilih toggle Image jika saat ini Video
        const imageToggle = page.locator('.toggle-text:has-text("Image"), span:has-text("Image")').first();
        if (await imageToggle.count() > 0 && await imageToggle.isVisible()) {
          await imageToggle.click();
          await page.waitForTimeout(500);
        }

        // Tutup modal / simpan jika ada tombol simpan atau klik di luar
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  } catch (err) {
    console.warn('⚠️ Gagal menyesuaikan pengaturan canvas:', err.message);
  }
}

/**
 * Menunggu proses generasi selesai
 * Menggunakan gabungan selector DOM (<flow-pending-tile>) & polling media URL
 */
export async function waitForPendingGeneration(page, timeoutMs = 90000) {
  const startTime = Date.now();
  console.log('⏳ Menunggu proses gambar (<flow-pending-tile>) selesai...');

  while (Date.now() - startTime < timeoutMs) {
    // Cek error batas penggunaan / kuota saat menunggu
    if (await checkQuotaLimitError(page)) {
      return { success: false, quotaReached: true };
    }

    const pendingTile = page.locator('flow-pending-tile').first();
    const isPending = await pendingTile.count() > 0 && await pendingTile.isVisible();

    if (!isPending) {
      console.log('✅ Proses generasi gambar selesai!');
      return { success: true, quotaReached: false };
    }

    const percentage = await page.locator('.loading-percentage').first().innerText().catch(() => '');
    if (percentage) {
      console.log(`⏳ Generasi berlangsung: ${percentage}`);
    }

    await delay(2000);
  }

  console.warn('⏱️ Timeout menunggu generasi selesai.');
  return { success: false, quotaReached: false };
}

/**
 * Scan DOM secara polling untuk menangkap gambar yang sudah muncul
 * Mendukung selector img[src*="/asb/"], img[src*="flow.google.com"], img[data-media-id]
 */
export function attachFlowListener(page, saveDir = './Hasil') {
  const seenKeys = new Set();
  let savedCount = 0;
  const savedFiles = [];

  const waitForImages = async (targetCount, timeoutMs = 60000) => {
    let currentPromptSaved = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs && currentPromptSaved < targetCount) {
      // Cek error kuota / batas penggunaan terlebih dahulu
      if (await checkQuotaLimitError(page)) {
        return { savedCount: currentPromptSaved, savedFiles, quotaReached: true };
      }

      // Tunggu tile pending selesai jika ada
      const pendingResult = await waitForPendingGeneration(page, 15000).catch(() => ({ quotaReached: false }));
      if (pendingResult?.quotaReached) {
        return { savedCount: currentPromptSaved, savedFiles, quotaReached: true };
      }

      // Scroll ke bawah agar gambar ter-render
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await delay(2000);

      // Cari elemen gambar di DOM dengan berbagai selector marker
      const imgLocators = await page.$$('img[src*="/asb/"], img[src*="flow-content.google"], img[src*="getMediaUrlRedirect"], img[data-media-id], img.image[src^="http"]');
      for (const img of imgLocators) {
        const src = await page.evaluate(el => el.src, img);
        const mediaIdAttr = await page.evaluate(el => el.getAttribute('data-media-id'), img);
        const uniqueKey = mediaIdAttr || src;

        if (src && !seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);

          try {
            const base64 = await page.evaluate(async (imgSrc) => {
              const res = await fetch(imgSrc);
              const blob = await res.blob();
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
            }, src);

            if (base64) {
              const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
              const buffer = Buffer.from(base64Data, 'base64');

              const fileId = mediaIdAttr || Date.now().toString();
              checkDir(saveDir);
              const filePath = path.join(saveDir, `${fileId}.png`);
              fs.writeFileSync(filePath, buffer);

              savedCount++;
              currentPromptSaved++;
              savedFiles.push(filePath);
              console.log(`[Flow] ✅ Gambar tersimpan dari DOM: ${filePath}`);

              if (currentPromptSaved >= targetCount) break;
            }
          } catch (err) {
            console.error(`[Flow] ❌ Gagal download image dari DOM:`, err.message);
          }
        }
      }

      if (currentPromptSaved >= targetCount) break;

      // Scroll ke atas lagi
      await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
      await delay(2000);
    }

    return { savedCount: currentPromptSaved, savedFiles, quotaReached: false };
  };

  const stop = () => {};

  console.log('[Flow] 🟢 DOM Scanner siap');
  return { waitForImages, stop, getSavedCount: () => savedCount };
}

/**
 * Handle Popups dengan Selector + Fallback AI Vision Qwen2.5
 */
export async function handleAllPopupsWithAIFallback(page) {
  // 1. Cek dengan selector biasa
  await handleInitialPopups(page).catch(err => console.warn('handleInitialPopups error:', err.message));

  // 2. Cek AI Vision untuk memastikan tidak ada popup tak terduga yang nutupin
  try {
    const popupType = await identifyPopup(page);
    if (popupType !== 'none' && popupType !== 'other') {
      console.log(`🤖 AI mendeteksi popup tertinggal: ${popupType}. Mencoba penanganan otomatis...`);
      if (popupType === 'privacy_policy' || popupType === 'consent' || popupType === 'welcome') {
        await handleInitialPopups(page).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  } catch (err) {
    console.warn('⚠️ Gagal menjalankan AI vision popup fallback:', err.message);
  }
}

/**
 * Buka link project dan mengunduh data project (Zip) langsung ke komputer
 */
export async function downloadProject(page, projectUrl, saveDir = './Hasil') {
  try {
    console.log(`📌 Mengakses URL project untuk mengunduh: ${projectUrl}`);
    if (projectUrl && page.url() !== projectUrl) {
      await page.goto(projectUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    // 1. Klik tombol "More options" di dalam container flow-more-options-menu
    const moreOptionsSelectors = [
      'flow-more-options-menu button',
      '.tools-button-group flow-more-options-menu button',
      'button[aria-label="More options"]',
      'button[aria-label="Opsi lainnya"]',
      '.tools-button-group button:has(mat-icon:has-text("more_vert"))',
    ];

    let opened = false;
    for (const sel of moreOptionsSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.count() > 0 && await btn.isVisible()) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(1000);
        opened = true;
        break;
      }
    }

    // Siapkan event listener Playwright download sebelum klik Download project
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);

    // 2. Klik "Download project"
    const downloadItem = page.locator('.label:has-text("Download project"), .item-text:has-text("Download project"), span:has-text("Download project")').first();
    if (await downloadItem.count() > 0 && await downloadItem.isVisible()) {
      console.log('⬇️ Mengklik "Download project"...');
      await downloadItem.click().catch(() => {});
    } else {
      const downloadMenu = page.getByRole('menuitem', { name: /Download project|Download/i }).first();
      if (await downloadMenu.count() > 0 && await downloadMenu.isVisible()) {
        console.log('⬇️ Mengklik menu Download project...');
        await downloadMenu.click().catch(() => {});
      }
    }

    // Tangkap file download dan simpan ke saveDir
    const download = await downloadPromise;
    if (download) {
      checkDir(saveDir);
      const suggestedFilename = download.suggestedFilename() || `project_${Date.now()}.zip`;
      const savePath = path.join(saveDir, suggestedFilename);
      await download.saveAs(savePath);
      console.log(`📦 File Project ZIP berhasil disimpan di: ${savePath}`);
    } else {
      console.log('ℹ️ Mengirim perintah download, menunggu browser memproses simpan file...');
      await page.waitForTimeout(5000);
    }
  } catch (err) {
    console.warn(`⚠️ Gagal download project: ${err.message}`);
  }
}

/**
 * Generate gambar dengan batch prompt
 */
export async function generate(page, profile, prompts, saveDir, expectedCount = 3, timeoutMs = 60000) {
  let successCount = 0;
  let finalUrl = '';
  let quotaReached = false;

  try {
    // Tangani popup consent / privacy + AI fallback
    await handleAllPopupsWithAIFallback(page);

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')]
        .find(b => b.textContent.includes('Project baru') || b.textContent.includes('New project'));
      btn?.click();
    });
    console.log('Click Project baru berhasil');

    await page.keyboard.press('Escape');
    await delay(3000);

    // Simpan URL project pengerjaan
    finalUrl = page.url();
    console.log(`📌 URL Project tersimpan: ${finalUrl}`);

    // Cek dan sesuaikan Agent Panel Header, Agent Mode & Pengaturan Canvas
    await ensureAgentModeDisabled(page);
    await ensureCanvasSettings(page);

    await delay(3000);

    // Satu listener untuk semua prompts dalam session ini
    const listener = attachFlowListener(page, saveDir);

    for (let i = 0; i < prompts.length; i++) {
      let prompt = prompts[i];

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        console.warn(`⚠️ Prompt ke-${i + 1} kosong, melewati...`);
        continue;
      }

      // Cek error batas penggunaan sebelum input prompt
      if (await checkQuotaLimitError(page)) {
        console.log(`🚨 Batas penggunaan tercapai pada profile '${profile}', menghentikan & rotasi akun.`);
        quotaReached = true;
        break;
      }

      console.log(`\n▶️ Memproses prompt ${i + 1}/${prompts.length}: ${prompt.substring(0, 60)}...`);

      // Pastikan Agent Panel Header & Agent Mode mati sebelum mengetik prompt
      await ensureAgentModeDisabled(page);

      await page.waitForSelector(textBox, { visible: true });

      await page.click(textBox);
      await delay(500);

      // Clear textbox
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await delay(500);

      // Ketik prompt
      await page.keyboard.type(prompt, { delay: 10 });
      await delay(2000);
      console.log('Typing berhasil');

      await page.keyboard.press('Enter');

      const result = await listener.waitForImages(expectedCount, timeoutMs);
      console.log(`[Flow] selesai prompt ${i + 1}: ${result.savedCount} file (target ${expectedCount})`);

      if (result.quotaReached) {
        console.log(`🛑 Batas penggunaan tercapai pada profile '${profile}', rotasi akun.`);
        quotaReached = true;
        break;
      }

      if (result.savedCount === 0) {
        console.log(`⚠️ Tidak ada gambar ter-capture untuk prompt ${i + 1}, menghentikan.`);
        break;
      }

      checkDir(testingGambarPath);
      await page.screenshot({ path: `${testingGambarPath}/${profile}_p${i + 1}.png` });
      console.log(`Screenshot berhasil untuk prompt ${i + 1}`);

      successCount++;

      if (i < prompts.length - 1) {
        console.log('⏳ Jeda 1 menit sebelum prompt berikutnya...');
        await delay(60000);
      }
    }

    listener.stop();

    // Mengunduh project saat semua prompt untuk profile ini sudah selesai (jika tidak diblokir kuota)
    if (finalUrl && !quotaReached) {
      await downloadProject(page, finalUrl, saveDir);
    }

    return { successCount, finalUrl, quotaReached };
  } catch (err) {
    console.error('Error di generate:', err);
    await page.screenshot({ path: `${testingGambarPath}/${profile}_error.png` });
    return { successCount, finalUrl: finalUrl || page.url(), quotaReached };
  }
}

async function handleInitialPopups(page) {
  await page.waitForTimeout(800);

  // Consent modal
  const researchLabel = page.getByText('Saya ingin menerima undangan riset');
  if (await researchLabel.count() > 0) {
    console.log('[Popup] Consent modal detected — klik research dan Next');
    try {
      await researchLabel.first().click().catch(() => {});
      await page.waitForTimeout(300);
      const nextBtn = page.getByRole('button', { name: /Berikutnya|Next|Continue/i }).first();
      if (await nextBtn.count() > 0) {
        await nextBtn.click().catch(() => {});
        await page.waitForTimeout(700);
      }
    } catch (e) {
      console.warn('[Popup] Gagal handle consent modal:', e.message);
    }
  }

  // Privacy policy modal
  const policyHeading = page.getByRole('heading', { name: /Tinjau kebijakan privasi|Tinjau kebijakan/i });
  if (await policyHeading.count() > 0) {
    console.log('[Popup] Privacy policy modal — scroll sampai Continue aktif');
    const continueBtn = page.getByRole('button', { name: /Lanjutkan|Continue|Next/i }).first();
    let attempts = 0;
    while (await continueBtn.count() > 0 && await continueBtn.isDisabled() && attempts < 15) {
      await page.evaluate((headingText) => {
        const headings = Array.from(document.querySelectorAll('h1,h2,h3'));
        const h = headings.find(e => e.textContent && e.textContent.includes(headingText));
        if (!h) return;
        let el = h.parentElement;
        while (el && el !== document.body && el.scrollHeight <= el.clientHeight) el = el.parentElement;
        if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
      }, 'Tinjau kebijakan privasi');
      await page.waitForTimeout(600);
      attempts++;
    }

    if (await continueBtn.count() > 0 && !(await continueBtn.isDisabled())) {
      await continueBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    } else {
      console.warn('[Popup] Continue button tidak aktif setelah scroll');
    }
  }
}
