import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises'
import { generate } from './utils/automationGenerate.js';


const profiles = await fs.readdir("D:\\chrome-profiles")

chromium.use(StealthPlugin())
console.log(profiles)

export class browser {
    constructor() {
        this.context = null;
        this.page = null;
    }

    async init(profile) {
        
        this.context = await chromium.launchPersistentContext(
            `D:\\chrome-profiles\\${profile}`, 
            {
                executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                headless: false,
                ignoreDefaultArgs: [
                '--enable-automation',
                '--disable-extensions' // Biarkan ekstensi bawaan Chrome asli tetap jalan agar terlihat manusiawi,
                ],
                args: [
                '--disable-blink-features=AutomationControlled', // Kunci utama menyembunyikan navigator.webdriver
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars', // Menghilangkan baris "Chrome sedang dikendalikan..."
                '--window-position=0,0',
                '--ignore-certificate-errors'
                ],
                viewport: null // Pengganti defaultViewport: null di persistent context
            }
            
        );

        // Di persistent context, kita ambil page pertama langsung dari context
        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

        // Provide a Puppeteer-compatible `page.browser()` shim for libraries
        // (like ghost-cursor) that expect Puppeteer's API.
        try {
            this.page.browser = () => this.context.browser();
        } catch (e) {
            // ignore if not available
        }

        await this.context.addInitScript(() => {
        // Hapus penanda webdriver
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
        
        // Buat mock objek chrome bawaan browser asli agar Google tidak curiga
        window.chrome = {
            runtime: {},
            loadTimes: function() {},
            csi: function() {}
        };
    });
    }

    async close() {
        if (this.context) {
            await new Promise(r => setTimeout(r, 1000));
            await this.context.close(); // Menutup context otomatis menutup seluruh browser
            this.context = null;
            this.page = null;
        }
    }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Jalankan generateImageFlow dengan prompt dari hasil.json
 * @param {string} outputDir - folder output yang berisi hasil.json
 */
export async function generateImageFlow(outputDir, promptsPerProfile = 3, imagesPerPrompt = 2, promptTimeoutMs = 60000, maxConcurrentProfiles = 10) {
    try {
        const hasilJsonPath = `${outputDir}/hasil.json`;

        // Baca hasil.json
        let prompts = [];
        try {
            const hasilData = await fs.readFile(hasilJsonPath, 'utf-8');
            const hasil = JSON.parse(hasilData);
            prompts = Array.isArray(hasil) ? hasil.map(item => item.prompt) : [];
            console.log(`📄 Loaded ${prompts.length} prompts dari ${hasilJsonPath}`);
        } catch (err) {
            console.error(`❌ Gagal baca hasil.json: ${err.message}`);
            return;
        }

        if (prompts.length === 0) {
            console.log('⚠️ Tidak ada prompt, skip generateImageFlow');
            return;
        }

        // Setup saveDir
        const saveDir = `${outputDir}/Hasil`;

        await delay(5000); // Tunggu 5 detik sebelum mulai

        let round = 1;
        let promptsToProcess = [...prompts];

        while (promptsToProcess.length > 0) {
            console.log(`\n🔁 Mulai round ${round} dengan ${promptsToProcess.length} prompt tersisa`);
            const failedPrompts = [];

            // Siapkan distribusi prompt untuk semua profil yang tersedia
            const profileToPrompts = {};
            for (const profile of profiles) {
                profileToPrompts[profile] = [];
            }

            // Bagi rata prompt ke semua profil secara berurutan
            for (let i = 0; i < promptsToProcess.length; i++) {
                const profileIndex = i % profiles.length;
                const profile = profiles[profileIndex];
                profileToPrompts[profile].push(promptsToProcess[i]);
            }

            let roundSuccess = false;

            // Jalankan profil dalam batch sesuai maxConcurrentProfiles
            for (let i = 0; i < profiles.length; i += maxConcurrentProfiles) {
                const currentProfiles = profiles.slice(i, i + maxConcurrentProfiles);

                const activeProfilesInBatch = currentProfiles.filter(p => profileToPrompts[p].length > 0);
                if (activeProfilesInBatch.length === 0) continue;

                console.log(`\n🚀 [Batch] Menjalankan ${activeProfilesInBatch.length} profil secara bersamaan...`);

                const tasks = activeProfilesInBatch.map(async (profile, idx) => {
                    const batchPrompts = profileToPrompts[profile];
                    console.log(`👤 Profil: ${profile} | 📝 Ditugaskan ${batchPrompts.length} prompt`);

                    // Staggered delay agar browser tidak terbuka secara bersamaan di detik yang sama
                    if (idx > 0) {
                        const staggerDelay = idx * 3000; // 3 detik per browser
                        await delay(staggerDelay);
                    }

                    return scrape(profile, batchPrompts, saveDir, imagesPerPrompt, promptTimeoutMs)
                        .then(successCount => {
                            if (successCount > 0) roundSuccess = true;
                            console.log(`✅ Profile '${profile}' sukses memproses ${successCount}/${batchPrompts.length} prompt`);

                            if (successCount < batchPrompts.length) {
                                const failed = batchPrompts.slice(successCount);
                                failedPrompts.push(...failed);
                                console.log(`⚠️ ${failed.length} prompt dari profile '${profile}' gagal dan akan dikembalikan ke antrean.`);
                            }
                        })
                        .catch(err => {
                            console.error(`❌ Error tidak terduga pada profile '${profile}':`, err);
                            failedPrompts.push(...batchPrompts);
                        });
                });

                await Promise.all(tasks);
            }

            if (!roundSuccess && failedPrompts.length > 0) {
                console.log('⚠️ Tidak ada profile yang berhasil dalam round ini. Hentikan loop agar tidak infinite.');
                break;
            }

            promptsToProcess = failedPrompts;
            if (promptsToProcess.length > 0) {
                console.log(`♻️ ${promptsToProcess.length} prompt dikembalikan ke antrean untuk round berikutnya.`);
            }
            round++;
        }

        console.log(`\n✅ Selesai generateImageFlow`);
    } catch (err) {
        console.error(err);
    }
}

/**
 * Scrape dengan profile tertentu menggunakan batch prompt
 * @param {string} profile - nama profile
 * @param {string[]} batchPrompts - array of prompts untuk di-type
 * @param {string} saveDir - folder tempat menyimpan hasil gambar
 * @returns {Promise<number>} jumlah prompt yang berhasil
 */
async function scrape(profile, batchPrompts, saveDir, expectedCount, timeoutMs) {
    console.log(`Profil ke : ${profile}`);

    const browserI = new browser();

    try {
        await browserI.init(profile);

        await browserI.page.goto(
            "https://labs.google/fx/id/tools/flow",
            { waitUntil: 'networkidle' }
        );

        const successCount = await generate(browserI.page, profile, batchPrompts, saveDir, expectedCount, timeoutMs);

        await new Promise(resolve => setTimeout(resolve, 5000));

        return successCount;

    } catch (err) {
        console.error(`❌ Error di profile '${profile}': ${err.message}`);
        return 0; // Gagal semua
    } finally {
        try {
            await browserI.close();
        } catch (closeErr) {
            console.error(`❌ Gagal menutup browser profile '${profile}': ${closeErr.message}`);
        }
    }
}

// async function test() {
//     const browserI = new browser();
//     console.log('Mulai test generateImageFlow...');

//     for(const profile of profiles) {
//         console.log(`Profil ke : ${profile}`);
//         await browserI.init(profile);
//     await browserI.page.goto(
//         "https://www.browserscan.net/",
//         { waitUntil: 'networkidle' }
//     );
//     await delay(2000) 

//     await browserI.page.screenshot({ path: `test-${profile}.png` });
//     }
//     console.log('Selesai test generateImageFlow.');
    
    

// }

// test();