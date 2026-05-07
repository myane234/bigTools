import pupeteer from 'puppeteer';
import fs from 'fs'
import path from 'path';

import { uploadFile, getPhotos, deletePhotos } from './utils/Photo.js';
import { waitForResponseDone, getResponseStructured } from './utils/getChat.js';
import { createResultJSON } from './utils/parseData.js';
import { profile } from 'console';
// import { prompt } from './prompt.js';

const chromeProfiles = path.join("D:", "chrome-profiles");

const delay = ms => (new Promise(resolve => setTimeout(resolve, ms)))

class Browser {
    constructor() {
        this.browser = null;
        this.page = null;
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
                await pages[i].close().catch(() => {});
            }

            this.page = pages[0];
        } else {
            // fallback kalau aneh (harusnya jarang)
            this.page = await this.browser.newPage();
        }

        // reset biar bersih
        await this.page.goto('about:blank');
    }
}

async function readChromeProfiles() {
    try {
        const profiles = await fs.promises.readdir(chromeProfiles);
        console.log(profiles);
        return profiles;
    } catch(err) {
        console.error(err);
    }
}

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

async function waitForGetChat(page) {
    try {
        await waitForResponseDone(page)
        const data = await getResponseStructured(page)

        return data;
    } catch(err) {
        console.error(err)
    }
}

async function start(profile, downloadsDir, imagesPerProfile = 10) {
    const outputDir = path.join(downloadsDir, '..');
    const browser = new Browser();
    await browser.init(profile);
    try {
        await browser.page.goto('https://gemini.google.com', { 
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        const selector = await findSelector(browser.page);
        await browser.page.click(selector);

        // Ambil gambar dari downloadsDir dengan limit per profile
        const semuaGambar = await getPhotos(downloadsDir, imagesPerProfile);
        if (semuaGambar.length === 0) {
            console.log('Tidak ada gambar untuk diupload, skip upload dan submit');
            await browser.browser.close();
            return false;
        }

        const uploadSuccess = await uploadFile(browser.page, semuaGambar);
        if (!uploadSuccess) {
            console.log('Upload gagal, skip submit');
            await browser.browser.close();
            return false;
        }

        console.log('Upload berhasil, menunggu proses upload selesai...');
        await browser.page.waitForFunction(() => {
            const imgs = document.querySelectorAll('img');
            return Array.from(imgs).some(img => img.src.includes('blob') || img.alt.includes('uploaded'));
        }, { timeout: 30000 });

        console.log('Gambar uploaded terdeteksi di UI, sekarang type prompt');
        await browser.page.keyboard.type(
            `
Analyze each provided image. There are ${semuaGambar.length} images.

For EACH image, generate ONE vector artwork prompt inspired by that image.

Output MUST be multiple JSON objects, one per image, in this exact format:

{
  "prompt": "string"
}
{
  "prompt": "string"
}
...

Rules:
- Output exactly ${semuaGambar.length} objects
- Each object corresponds to one image in order
- Each prompt must describe a VECTOR illustration (not a photo)
- Do NOT wrap everything in a single JSON object or array
- Do NOT add any explanation, markdown, or text outside the objects
`
        );
        await delay(1000);
        await browser.page.keyboard.press('Enter');

        const data = await waitForGetChat(browser.page);
        if (!data) {
            throw new Error('Tidak menerima data respon dari Gemini');
        }

        console.log(data);

        await createResultJSON(data, outputDir);

        // Hapus gambar yang sudah diproses setelah hasil berhasil disimpan
        await deletePhotos(semuaGambar);
        console.log(`[start] ${semuaGambar.length} gambar dihapus untuk profile '${profile}'`);

        console.log(`Selesai ${profile}`);
        await browser.browser.close();
        console.log(`Browser untuk profile '${profile}' ditutup`);

        return true;
    } catch(err) {
        console.error(err);
        try {
            await browser.browser.close();
        } catch (_) {}
        return false;
    }
}

/**
 * Jalankan Gemini dengan multiple profiles
 * dan ulangi sampai download habis
 * @param {string} outputDir - folder output untuk gambar
 * @param {number} imagesPerProfile - jumlah gambar per profile (default: 10)
 */
export async function GeminiClient(outputDir, imagesPerProfile = 10) {
    const downloadsDir = path.join(outputDir, "downloads");
    const profiles = await readChromeProfiles();
    try {
        let round = 0;
        while (true) {
            const imageCheck = await getPhotos(downloadsDir, 1);
            if (imageCheck.length === 0) {
                console.log('✅ Semua gambar di downloads sudah diproses.');
                break;
            }

            round++;
            console.log(`\n➡️ GeminiClient round ${round} mulai. Gambar tersisa: ${imageCheck.length}`);

            let profileProcessed = false;
            for (const profile of profiles) {
                const remaining = await getPhotos(downloadsDir, 1);
                if (remaining.length === 0) break;

                console.log(`Starting browser with profile: ${profile}`);
                const success = await start(profile, downloadsDir, imagesPerProfile);
                if (success) {
                    profileProcessed = true;
                }
            }

            if (!profileProcessed) {
                console.log('⚠️ Tidak ada profile berhasil memproses gambar pada round ini. Hentikan loop untuk mencegah infinite loop.');
                break;
            }
        }
    } catch(err) {
        console.error(err);
    }
}

// async function jalanin(profile) {
//     try {
//         const browser = new Browser();
//         await browser.init(profile);

//         // kasih delay dikit biar keliatan 1-1 (optional)
//         await new Promise(r => setTimeout(r, 2000));

//     } catch (err) {
//         console.error(err);
//     }
// }

// async function jalan() {
//     const profiles = await readChromeProfiles();

//     for (const profile of profiles) {
//         console.log(`Jalan profile ${profile}`)
//         await jalanin(profile); // tetap sequential
//     }
// }

// jalan();