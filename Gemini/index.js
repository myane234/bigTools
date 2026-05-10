import pupeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs'
import path from 'path';
import { createCursor } from 'ghost-cursor';

import { uploadFile, getPhotos, deletePhotos } from './utils/Photo.js';
import { waitForResponseDone, getResponseCount, scrollToRenderAll, getAllResponses } from './utils/getChat.js';
import { createResultJSON } from './utils/parseData.js';

const chromeProfiles = path.join("D:", "chrome-profiles");

const delay = ms => (new Promise(resolve => setTimeout(resolve, ms)))

pupeteer.use(StealthPlugin())

const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 10000;

// ── Mutex sederhana untuk mencegah race condition pada getPhotos ─────────────
// Node.js single-threaded, tapi await membuat dua coroutine bisa interleave.
// Tanpa mutex: Profile A dan B bisa getPhotos() di saat yang sama dan mendapat
// list file IDENTIK sebelum salah satunya sempat deletePhotos().
class Mutex {
    constructor() {
        this._queue = [];
        this._locked = false;
    }
    /** Tunggu sampai lock tersedia, lalu ambil lock-nya. */
    lock() {
        return new Promise(resolve => {
            if (!this._locked) {
                this._locked = true;
                resolve();
            } else {
                this._queue.push(resolve);
            }
        });
    }
    /** Lepas lock dan beri ke antrian berikutnya jika ada. */
    unlock() {
        if (this._queue.length > 0) {
            this._queue.shift()();
        } else {
            this._locked = false;
        }
    }
}

// Satu mutex global untuk operasi klaim foto
const photoMutex = new Mutex();
// Set berisi path foto yang sudah diklaim oleh profile tertentu
const claimedPhotos = new Set();

/**
 * Ambil foto secara atomik: hanya foto yang belum diklaim oleh profile lain.
 * Operasi check + klaim dilindungi mutex sehingga tidak ada double-claim.
 * @returns {string[]} array path foto yang berhasil diklaim
 */
async function reservePhotos(downloadsDir, imagesPerProfile) {
    await photoMutex.lock();
    try {
        const allPhotos = await getPhotos(downloadsDir, null); // semua foto di folder
        const available = allPhotos.filter(f => !claimedPhotos.has(f));
        const reserved = available.slice(0, imagesPerProfile);
        reserved.forEach(f => claimedPhotos.add(f));
        return reserved;
    } finally {
        photoMutex.unlock();
    }
}

/**
 * Hapus klaim foto setelah selesai diproses (baik sukses maupun gagal).
 * @param {string[]} filePaths
 */
function releasePhotos(filePaths) {
    filePaths.forEach(f => claimedPhotos.delete(f));
}

class Browser {
    constructor() {
        this.browser = null;
        this.page = null;
        this.cursor = null;
    }

    async init(profile) {
        this.browser = await pupeteer.launch({
            headless: false,
            userDataDir: path.join(chromeProfiles, profile),
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const pages = await this.browser.pages();

        // sisain 1 tab aja
        if (pages.length > 0) {
            for (let i = 1; i < pages.length; i++) {
                await pages[i].close().catch(() => { });
            }
            this.page = pages[0];
        } else {
            this.page = await this.browser.newPage();
        }

        // reset biar bersih
        await this.page.goto('about:blank');

        // Buat cursor sekali untuk seluruh sesi
        this.cursor = createCursor(this.page);
    }

    async close() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
                this.cursor = null;
            }
        } catch (err) {
            console.error('[Browser.close] Error:', err.message);
        }
    }
}

async function readChromeProfiles() {
    try {
        const profiles = await fs.promises.readdir(chromeProfiles);
        console.log(profiles);
        return profiles;
    } catch (err) {
        console.error(err);
        return [];
    }
}

const SigInSelector = 'a[aria-label="Sign in"]';

const selectors = [
    '[aria-label="Masukkan perintah untuk Gemini"]',
    '[aria-label="Enter a prompt for Gemini"]',
];

async function findSelector(page) {
    for (const selector of selectors) {
        try {
            await page.waitForSelector(selector, { visible: true, timeout: 5000 });
            console.log('Selector found:', selector);
            return selector;
        } catch {
            console.log('Selector not found, trying next:', selector);
        }
    }
    throw new Error('No selector found');
}

/**
 * Kirim 1 batch prompt (upload gambar → type → enter)
 * Tidak menunggu response, tidak ambil data.
 * Mengembalikan responseIndexBefore = jumlah response sebelum prompt dikirim
 */
async function sendBatch(page, cursor, semuaGambar, inputSelector) {
    const responseIndexBefore = await getResponseCount(page);

    await cursor.click(inputSelector, { hesitate: 80, waitForClick: 50 });

    const uploadSuccess = await uploadFile(page, semuaGambar);
    if (!uploadSuccess) {
        throw new Error('Upload gagal');
    }

    console.log(`  Upload ${semuaGambar.length} gambar OK, menunggu UI konfirmasi...`);
    await page.waitForFunction(() => {
        const imgs = document.querySelectorAll('img');
        return Array.from(imgs).some(img => img.src.includes('blob') || img.alt.includes('uploaded'));
    }, { timeout: 30000 });

    console.log(`  Type prompt...`);
    await page.keyboard.type(
        `Analyze each of the ${semuaGambar.length} uploaded images. For each image create one vector artwork prompt inspired by it. Reply with a JSON array containing exactly ${semuaGambar.length} objects, each with a single "prompt" key. Example format: [{"prompt":"..."},{"prompt":"..."}]. Each prompt must describe a VECTOR illustration style. Output only the JSON array, no explanation.`
    );
    await delay(1000);
    await page.keyboard.press('Enter');

    console.log(`  Prompt dikirim. responseIndexBefore=${responseIndexBefore}`);
    return responseIndexBefore;
}

/**
 * Wrapper retry untuk sendBatch.
 * Jika gagal, delay 10 detik lalu coba lagi sampai maxRetries kali.
 * Lempar error jika semua retry habis.
 */
async function sendBatchWithRetry(page, cursor, semuaGambar, inputSelector, profile, batchNum) {
    for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
        try {
            return await sendBatch(page, cursor, semuaGambar, inputSelector);
        } catch (err) {
            console.error(`[${profile}] Batch #${batchNum} attempt ${attempt}/${RETRY_COUNT} gagal: ${err.message}`);
            if (attempt < RETRY_COUNT) {
                console.log(`[${profile}] Retry dalam ${RETRY_DELAY_MS / 1000} detik...`);
                await delay(RETRY_DELAY_MS);
            } else {
                throw new Error(`[${profile}] Batch #${batchNum} gagal setelah ${RETRY_COUNT}x retry. Menutup browser.`);
            }
        }
    }
}

/**
 * Jalankan 1 sesi profile:
 * - Menerima browser instance yang sudah dibuka dan diarahkan ke Gemini
 * - Kirim semua batch gambar dengan retry per batch
 * - Setelah semua dikirim, scroll + ambil semua response
 * - Parse dan simpan hasil
 * - Jika retry habis, lempar error (browser akan ditutup di GeminiClient)
 */
async function start(browserInstance, profile, downloadsDir, imagesPerProfile = 10) {
    const outputDir = path.join(downloadsDir, '..');
    const { page, cursor } = browserInstance;

    // Buka Gemini
    await page.goto('https://gemini.google.com', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });

    const inputSelector = await findSelector(page);

    // Kumpulkan metadata setiap batch: { gambar, responseIndexBefore }
    const batches = [];

    // ── FASE 1: Kirim semua batch tanpa tunggu response ──────────────────
    let batchNum = 0;
    while (true) {
        // reservePhotos: atomik check + klaim, aman dari race condition
        const semuaGambar = await reservePhotos(downloadsDir, imagesPerProfile);
        if (semuaGambar.length === 0) {
            console.log(`[${profile}] Tidak ada gambar tersisa, semua batch sudah dikirim.`);
            break;
        }

        batchNum++;
        console.log(`\n[${profile}] Batch #${batchNum}: ${semuaGambar.length} gambar`);

        // Sebelum kirim, tunggu response batch sebelumnya selesai
        if (batches.length > 0) {
            console.log(`[${profile}] Menunggu response batch sebelumnya selesai...`);
            await waitForResponseDone(page);
            console.log(`[${profile}] Response sebelumnya done ✓`);
        }

        // sendBatch dengan retry — akan throw jika semua retry habis
        let responseIndexBefore;
        try {
            responseIndexBefore = await sendBatchWithRetry(page, cursor, semuaGambar, inputSelector, profile, batchNum);
        } catch (err) {
            // Retry habis: lepas klaim supaya foto bisa diambil profile lain, lalu propagate error
            releasePhotos(semuaGambar);
            throw err;
        }
        batches.push({ gambar: semuaGambar, responseIndexBefore });

        // Hapus file dari disk + lepas klaim agar batch berikutnya bisa ambil foto yang berbeda
        await deletePhotos(semuaGambar);
        releasePhotos(semuaGambar);
        console.log(`[${profile}] ${semuaGambar.length} gambar dihapus setelah dikirim.`);
    }

    if (batches.length === 0) {
        console.log(`[${profile}] Tidak ada gambar sama sekali, skip.`);
        return false;
    }

    // ── FASE 2: Tunggu response batch TERAKHIR selesai ───────────────────
    console.log(`\n[${profile}] Menunggu response batch terakhir selesai...`);
    await waitForResponseDone(page);
    console.log(`[${profile}] Semua response done ✓`);

    // ── FASE 3: Scroll top→bottom→top biar semua ter-render ──────────────
    console.log(`[${profile}] Scrolling untuk render semua response...`);
    await scrollToRenderAll(page);

    // ── FASE 4: Ambil semua response dan simpan per batch ─────────────────
    const allResponses = await getAllResponses(page, 0);
    console.log(`[${profile}] Total response di DOM: ${allResponses.length}`);

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const responseIdx = batch.responseIndexBefore;
        const response = allResponses[responseIdx];

        if (!response) {
            console.warn(`[${profile}] Batch #${i + 1}: response tidak ditemukan di index ${responseIdx}`);
            continue;
        }

        console.log(`[${profile}] Batch #${i + 1} → response[${responseIdx}], parsing...`);
        await createResultJSON(response, outputDir);
    }

    console.log(`[${profile}] Semua batch selesai diproses ✓`);
    return true;
}

/**
 * Jalankan Gemini dengan semua profiles secara BERSAMAAN:
 * 1. Buka semua browser sekaligus (Promise.all)
 * 2. Jalankan semua sesi paralel (Promise.all)
 * 3. Tiap batch punya retry 3x @ 10 detik jika error
 * 4. Jika retry habis, browser ditutup dan profile tersebut dianggap gagal
 *
 * @param {string} outputDir - folder output untuk gambar
 * @param {number} imagesPerProfile - jumlah gambar per batch (default: 10)
 */
export async function GeminiClient(outputDir, imagesPerProfile = 10) {
    const downloadsDir = path.join(outputDir, "downloads");
    const profiles = await readChromeProfiles();

    if (profiles.length === 0) {
        console.error('❌ Tidak ada chrome profile ditemukan.');
        return;
    }

    const imageCheck = await getPhotos(downloadsDir, 1);
    if (imageCheck.length === 0) {
        console.log('✅ Tidak ada gambar di downloads, skip.');
        return;
    }

    console.log(`\n🚀 Membuka ${profiles.length} browser secara bersamaan...`);

    // ── STEP 1: Buka SEMUA browser sekaligus ─────────────────────────────
    const browserInstances = await Promise.all(
        profiles.map(async (profile) => {
            try {
                const b = new Browser();
                await b.init(profile);
                console.log(`✅ Browser [${profile}] berhasil dibuka.`);
                return { browser: b, profile, ok: true };
            } catch (err) {
                console.error(`❌ Gagal membuka browser [${profile}]: ${err.message}`);
                return { browser: null, profile, ok: false };
            }
        })
    );

    const activeBrowsers = browserInstances.filter(b => b.ok);
    console.log(`\n▶️ ${activeBrowsers.length}/${profiles.length} browser aktif. Mulai semua sesi bersamaan...\n`);

    // ── STEP 2: Jalankan semua sesi PARALEL ──────────────────────────────
    await Promise.all(
        activeBrowsers.map(async ({ browser, profile }) => {
            try {
                await start(browser, profile, downloadsDir, imagesPerProfile);
            } catch (err) {
                // Error ini biasanya dari sendBatchWithRetry yang sudah habis retry
                console.error(`❌ [${profile}] Sesi gagal: ${err.message}`);
            } finally {
                // Tutup browser profile ini setelah selesai atau gagal
                console.log(`🔒 [${profile}] Menutup browser...`);
                await browser.close();
            }
        })
    );

    console.log('\n✅ GeminiClient selesai. Semua profile telah diproses.');
}