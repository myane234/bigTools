import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises'
import { generate } from './utils/automationGenerate.js';


const profiles = await fs.readdir("D:\\chrome-profiles")

puppeteer.use(StealthPlugin())
console.log(profiles)

class browser {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init(profile) {
        this.browser = await puppeteer.launch({
            headless: false,
            userDataDir: `D:\\chrome-profiles\\${profile}`,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--start-maximized',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        this.page = await this.browser.newPage();
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
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

                const tasks = activeProfilesInBatch.map(profile => {
                    const batchPrompts = profileToPrompts[profile];
                    console.log(`👤 Profil: ${profile} | 📝 Ditugaskan ${batchPrompts.length} prompt`);

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
            { waitUntil: 'networkidle2' }
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