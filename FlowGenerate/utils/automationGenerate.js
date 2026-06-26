import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const textBox = '[contenteditable="true"]';
const testingGambarPath = './GambarTesting';
const hasilPath = './Hasil';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const flowApiMarker = '/fx/api/trpc/media.getMediaUrlRedirect';

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

    const waitForImages = async (targetCount, timeoutMs = 60000) => {
        let currentPromptSaved = 0;
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs && currentPromptSaved < targetCount) {
            // Scroll ke bawah
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await delay(2000);

            // Cari element gambar
            const imgLocators = await page.$$(`img[src*="${flowApiMarker}"]`);
            for (const img of imgLocators) {
                const src = await page.evaluate(el => el.src, img);
                if (src && !seenUrls.has(src)) {
                    seenUrls.add(src);

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
                            const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
                            const buffer = Buffer.from(base64Data, 'base64');

                            const urlObj = new URL(src);
                            const mediaId = urlObj.searchParams.get('name') || Date.now().toString();

                            checkDir(saveDir);
                            const filePath = path.join(saveDir, `${mediaId}.png`);
                            fs.writeFileSync(filePath, buffer);

                            savedCount++;
                            currentPromptSaved++;
                            savedFiles.push(filePath);
                            console.log(`[Flow] ✅ Tersimpan: ${filePath}`);

                            if (currentPromptSaved >= targetCount) break;
                        }
                    } catch (err) {
                        console.error(`[Flow] ❌ Gagal download image dari DOM:`, err.message);
                    }
                }
            }

            if (currentPromptSaved >= targetCount) break;

            // Scroll ke atas
            await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
            await delay(2000);
        }

        return { savedCount: currentPromptSaved, savedFiles };
    };

    const stop = () => { };

    console.log('[Flow] 🟢 DOM Scanner siap');
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
            // Robust handling: fix elements with aria-pressed or aria-disabled set to true.
            const selectors = ['[aria-pressed="true"]', '[aria-disabled="true"]'];
            for (const sel of selectors) {
                const locator = page.locator(sel);
                const count = await locator.count();
                for (let i = 0; i < count; i++) {
                    const el = locator.nth(i);
                    const tag = await el.evaluate(node => node.tagName);
                    console.log(`Detected ${sel} on <${tag}> — attempting to toggle/enable`);

                    // Try to click first (force), then fallback to dispatching a click event.
                    let clicked = false;
                    try {
                        await el.click({ force: true });
                        clicked = true;
                    } catch (clickErr) {
                        try {
                            const handle = await el.elementHandle();
                            if (handle) {
                                await page.evaluate((node) => {
                                    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
                                    node.dispatchEvent(ev);
                                }, handle);
                                clicked = true;
                            }
                        } catch (evErr) {
                            console.warn('Fallback dispatch click failed:', evErr.message);
                        }
                    }

                    await page.waitForTimeout(300);

                    // If still in the unwanted state, set attribute directly as last resort.
                    const attrName = sel.includes('pressed') ? 'aria-pressed' : 'aria-disabled';
                    const current = await el.getAttribute(attrName);
                    if (current === 'true') {
                        try {
                            const handle = await el.elementHandle();
                            if (handle) await page.evaluate((node, name) => node.setAttribute(name, 'false'), handle, attrName);
                            console.log(`Forced ${attrName} to false via JS`);
                        } catch (setErr) {
                            console.warn(`Failed to force ${attrName} to false:`, setErr.message);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Error toggling stateful buttons:', e.message);
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

            // Jika ada prompt berikutnya, tunggu 1 menit
            if (i < prompts.length - 1) {
                console.log('⏳ Jeda 1 menit sebelum prompt berikutnya...');
                await delay(60000);
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
            await researchLabel.first().click().catch(() => { });
            await page.waitForTimeout(300);

            const nextBtn = page.getByRole('button', { name: /Berikutnya|Next|Continue/i }).first();
            if (await nextBtn.count() > 0) {
                await nextBtn.click().catch(() => { });
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
            await continueBtn.click().catch(() => { });
            await page.waitForTimeout(500);
        } else {
            console.warn('[Popup] Continue button not enabled after scrolling');
        }
    }
}