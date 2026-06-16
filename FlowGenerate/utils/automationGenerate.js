import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const textBox = '[contenteditable="true"]';
const testingGambarPath = './GambarTesting';
const hasilPath = './Hasil';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const flowImageUrlMarker = 'flow-content.google/image';

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

export function attachFlowListener(page, saveDir = './Hasil') {
    const seenUrls = new Set();
    let savedCount = 0;
    const savedFiles = [];
    const callbacks = [];

    const listener = async (response) => {
        const url = response.url();
        if (!url.includes(flowImageUrlMarker) || seenUrls.has(url)) return;
        seenUrls.add(url);

        const contentType = response.headers()['content-type'] || '';
        if (!contentType.startsWith('image/')) return;

        try {
            checkDir(saveDir);

            const mediaId = path.basename(new URL(url).pathname);
            const ext = contentType.split('/')[1]?.split(';')[0] || 'png';
            const filePath = path.join(saveDir, `${mediaId}.${ext}`);

            const buffer = await response.body();
            fs.writeFileSync(filePath, buffer);
            savedCount += 1;
            savedFiles.push(filePath);
            console.log(`[Flow] ✅ Tersimpan: ${filePath}`);
            callbacks.forEach((cb) => cb(savedCount));
        } catch (err) {
            console.error(`[Flow] ❌ Gagal simpan:`, err.message);
        }
    };

    page.on('response', listener);

    const stop = () => {
        page.off('response', listener);
    };

    const waitForImages = (targetCount, timeoutMs = 60000) => {
        return new Promise((resolve) => {
            if (targetCount <= 0) {
                stop();
                return resolve({ savedCount, savedFiles });
            }

            let timeout = null;
            if (timeoutMs > 0) {
                timeout = setTimeout(() => {
                    stop();
                    resolve({ savedCount, savedFiles });
                }, timeoutMs);
            }

            const onSaved = (count) => {
                if (count >= targetCount) {
                    if (timeout) clearTimeout(timeout);
                    stop();
                    resolve({ savedCount, savedFiles });
                }
            };

            callbacks.push(onSaved);

            if (savedCount >= targetCount) {
                if (timeout) clearTimeout(timeout);
                stop();
                resolve({ savedCount, savedFiles });
            }
        });
    };

    console.log('[Flow] 🟢 Listener aktif');
    return { waitForImages, stop, getSavedCount: () => savedCount };
}

/**
 * Generate gambar dengan batch prompt
 * @param {object} page - puppeteer page
 * @param {string} profile - nama profile
 * @param {string[]} prompts - array of prompts untuk di-type ke Flow
 * @param {string} saveDir - folder untuk menyimpan gambar hasil
 * @param {number} expectedCount - target jumlah gambar per prompt
 * @param {number} timeoutMs - batas waktu tunggu dalam ms
 * @returns {Promise<number>} - jumlah prompt yang berhasil diproses
 */
export async function generate(page, profile, prompts, saveDir, expectedCount = 3, timeoutMs = 60000) {
    let successCount = 0;
    try {
        // Tangani popup consent / privacy jika muncul sebelum membuat project baru
        await handleInitialPopups(page).catch(err => console.warn('handleInitialPopups error:', err.message));

        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')]
                .find(b => b.textContent.includes('Project baru'));
            btn?.click();
        });
        console.log('Click berhasil');

        await page.keyboard.press('Escape'); // Tutup modal yang mungkin masih terbuka

        // Jika ada tombol dengan atribut aria-pressed, pastikan yang true menjadi false.
        // Lebih robust: coba click({force:true}), fallback ke el.click() via evaluate,
        // dan terakhir setAttribute('aria-pressed','false') jika masih true.
        try {
            const pressedBtns = page.locator('button[aria-pressed]');
            const total = await pressedBtns.count();
            for (let i = 0; i < total; i++) {
                const btn = pressedBtns.nth(i);
                const val = await btn.getAttribute('aria-pressed');
                if (val === 'true') {
                    console.log('Detected button[aria-pressed="true"] — attempting to toggle off');
                    try {
                        await btn.click({ force: true });
                    } catch (clickErr) {
                        try {
                            const handle = await btn.elementHandle();
                            if (handle) await page.evaluate((el) => el.click(), handle);
                        } catch (evalErr) {
                            console.warn('Fallback click evaluate failed:', evalErr.message);
                        }
                    }

                    await page.waitForTimeout(300);

                    // Verifikasi, jika masih true maka set attribute langsung
                    const newVal = await btn.getAttribute('aria-pressed');
                    if (newVal === 'true') {
                        try {
                            const handle = await btn.elementHandle();
                            if (handle) await page.evaluate((el) => el.setAttribute('aria-pressed', 'false'), handle);
                            console.log('Forced aria-pressed to false via JS');
                        } catch (setErr) {
                            console.warn('Failed to force aria-pressed to false:', setErr.message);
                        }
                    }

                    // Setelah meng-handle satu yang true, stop (sesuai kebutuhan bisa diubah untuk toggle semua)
                    break;
                }
            }
        } catch (e) {
            console.warn('Error checking/toggling aria-pressed button:', e.message);
        }

        await delay(6000); // Tunggu 6 detik untuk memastikan UI sudah siap

        // Buat satu listener untuk semua prompts dalam profile ini
        const listener = attachFlowListener(page, saveDir);

        for (let i = 0; i < prompts.length; i++) {
            const prompt = prompts[i];
            console.log(`\n▶️ Memproses prompt ${i + 1}/${prompts.length}: ${prompt.substring(0, 60)}...`);

            await page.waitForSelector(textBox, { visible: true });

            // Fokus ke text box
            await page.click(textBox);
            await delay(500);

            // Clear textbox dengan menekan Ctrl+A lalu Backspace
            // Ini jauh lebih aman untuk framework React/Lexical/Draft.js daripada mengubah textContent langsung
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            await delay(500);

            // Ketik prompt pelan-pelan agar event onInput terdeteksi dengan baik
            await page.keyboard.type(prompt, { delay: 10 });
            await delay(2000);
            console.log('Typing berhasil');

            await page.keyboard.press('Enter');

            const result = await listener.waitForImages(expectedCount, timeoutMs);
            console.log(`[Flow] selesai menunggu gambar prompt ${i + 1}: ${result.savedCount} file disimpan (target ${expectedCount}, timeout ${timeoutMs} ms)`);

            if (result.savedCount === 0) {
                console.log(`⚠️ Tidak ada gambar yang berhasil di-capture dari Flow untuk prompt ${i + 1}`);
                break;
            }

            checkDir(testingGambarPath);
            await page.screenshot({ path: `${testingGambarPath}/${profile}_p${i + 1}.png` });
            console.log(`Screenshot berhasil untuk prompt ${i + 1}`);

            successCount++;

            // Jika ada prompt berikutnya, scroll dan tunggu sebentar
            if (i < prompts.length - 1) {
                console.log('⏳ Scroll down untuk melihat hasil, tunggu 3 detik...');
                await page.evaluate(() => {
                    window.scrollBy(0, window.innerHeight);
                });
                await delay(3000);

                console.log('↩️ Scroll kembali ke atas untuk prompt berikutnya...');
                await page.evaluate(() => {
                    window.scrollBy(0, -window.innerHeight);
                });
                await delay(2000);
            }
        }

        listener.stop();
        return successCount;
    } catch (err) {
        console.error('Error di generate:', err);
        await page.screenshot({ path: `${testingGambarPath}/${profile}_error.png` });
        return successCount;
    }
}

async function handleInitialPopups(page) {
    // small delay to let modal render
    await page.waitForTimeout(800);

    // Consent modal: detect by visible label text instead of auto-generated classes
    const researchLabel = page.getByText('Saya ingin menerima undangan riset');
    if (await researchLabel.count() > 0) {
        console.log('[Popup] Consent modal detected — trying to select research and click Next');
        try {
            await researchLabel.first().click().catch(() => {});
            await page.waitForTimeout(300);

            const nextBtn = page.getByRole('button', { name: /Berikutnya|Next|Continue/i }).first();
            if (await nextBtn.count() > 0) {
                await nextBtn.click().catch(() => {});
                await page.waitForTimeout(700);
            }
        } catch (e) {
            console.warn('[Popup] Failed to handle consent modal:', e.message);
        }
    }

    // Privacy policy modal: detect by heading text and scroll reachable ancestor
    const policyHeading = page.getByRole('heading', { name: /Tinjau kebijakan privasi|Tinjau kebijakan/i });
    if (await policyHeading.count() > 0) {
        console.log('[Popup] Privacy policy modal detected — scrolling until Continue is enabled');
        const continueBtn = page.getByRole('button', { name: /Lanjutkan|Continue|Next/i }).first();

        // Scroll ancestor container of the heading until continue enabled or max attempts
        let attempts = 0;
        while (await continueBtn.count() > 0 && await continueBtn.isDisabled() && attempts < 15) {
            await page.evaluate((headingText) => {
                const headings = Array.from(document.querySelectorAll('h1,h2,h3'));
                const h = headings.find(e => e.textContent && e.textContent.includes(headingText));
                if (!h) return;
                let el = h.parentElement;
                // climb until find scrollable container
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
            console.warn('[Popup] Continue button not enabled after scrolling');
        }
    }
}