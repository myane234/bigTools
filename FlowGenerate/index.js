import puppeteer from 'puppeteer';
import fs from 'fs/promises'
import { generate } from './utils/automationGenerate.js';


const profiles = await fs.readdir("D:\\chrome-profiles")

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

        let promptIndex = 0; // Track index prompt yang sedang diproses
        let round = 0;
        let roundSuccess = false; // Initialize roundSuccess

        while (promptIndex < prompts.length) {
            round++;
            roundSuccess = false; // Reset setiap round
            console.log(`\n🔁 Mulai round ${round} dengan ${prompts.length - promptIndex} prompt tersisa`);

            // Jalankan profil dalam batch sesuai maxConcurrentProfiles
            for (let i = 0; i < profiles.length; i += maxConcurrentProfiles) {
                if (promptIndex >= prompts.length) break;

                const currentProfiles = profiles.slice(i, i + maxConcurrentProfiles);
                console.log(`\n🚀 [Batch] Menjalankan ${currentProfiles.length} profil secara bersamaan...`);

                const tasks = [];
                const batchFailedPrompts = [];

                for (let pIndex = 0; pIndex < currentProfiles.length; pIndex++) {
                    const profile = currentProfiles[pIndex];
                    if (promptIndex >= prompts.length) break;

                    const batchPrompts = prompts.slice(promptIndex, promptIndex + promptsPerProfile);
                    promptIndex += batchPrompts.length;

                    console.log(`👤 Profil: ${profile} | 📝 Ditugaskan ${batchPrompts.length} prompt`);

                    const task = scrape(profile, batchPrompts, saveDir, imagesPerPrompt, promptTimeoutMs)
                        .then(successCount => {
                            if (successCount > 0) {
                                roundSuccess = true;
                                console.log(`✅ Profile '${profile}' sukses memproses ${successCount}/${batchPrompts.length} prompt`);
                            } else {
                                console.log(`⚠️ Profile '${profile}' gagal memproses seluruh prompt`);
                            }

                            if (successCount < batchPrompts.length) {
                                const failedPrompts = batchPrompts.slice(successCount);
                                batchFailedPrompts.push(...failedPrompts);
                                console.log(`⚠️ ${failedPrompts.length} prompt dari profile '${profile}' akan dikembalikan ke antrean.`);
                            }
                        })
                        .catch(err => {
                            console.error(`❌ Error tidak terduga pada profile '${profile}':`, err);
                            batchFailedPrompts.push(...batchPrompts);
                        });

                    tasks.push(task);
                }

                // Tunggu semua profil dalam batch ini selesai
                await Promise.all(tasks);

                // Jika ada prompt yang gagal, kembalikan ke antrean utama
                if (batchFailedPrompts.length > 0) {
                    prompts.splice(promptIndex, 0, ...batchFailedPrompts);
                    console.log(`♻️ ${batchFailedPrompts.length} prompt dikembalikan ke antrean. Total antrean tersisa: ${prompts.length - promptIndex}`);
                }
            }

            if (!roundSuccess) {
                console.log('⚠️ Tidak ada profile yang berhasil dalam round ini. Hentikan loop agar tidak infinite.');
                break;
            }
        }

        console.log(`\n✅ Selesai generateImageFlow (${promptIndex}/${prompts.length} prompt berhasil diproses)`);
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