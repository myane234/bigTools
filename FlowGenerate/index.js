import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import { generate } from "./utils/automationGenerate.js";
import { saveHistory } from "./utils/historyJson.js";

export const profiles = (await fs.readdir("D:\\chrome-profiles"))
  .filter((name) => /^profile\d+$/i.test(name))
  .sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
);

chromium.use(StealthPlugin());
console.log(profiles);

export class browser {
  constructor() {
    this.context = null;
    this.page = null;
  }

  async init(profile) {
    this.context = await chromium.launchPersistentContext(
      `D:\\chrome-profiles\\${profile}`,
      {
        executablePath:
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        headless: false,
        ignoreDefaultArgs: [
          "--enable-automation",
          "--disable-extensions", // Biarkan ekstensi bawaan Chrome asli tetap jalan agar terlihat manusiawi,
        ],
        args: [
          "--disable-blink-features=AutomationControlled", // Kunci utama menyembunyikan navigator.webdriver
          "--start-maximized",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-infobars", // Menghilangkan baris "Chrome sedang dikendalikan..."
          "--window-position=0,0",
          "--ignore-certificate-errors",
        ],
        viewport: null, // Pengganti defaultViewport: null di persistent context
      },
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
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });

      // Buat mock objek chrome bawaan browser asli agar Google tidak curiga
      window.chrome = {
        runtime: {},
        loadTimes: function () {},
        csi: function () {},
      };
    });
  }

  async close() {
    if (this.context) {
      await new Promise((r) => setTimeout(r, 1000));
      await this.context.close(); // Menutup context otomatis menutup seluruh browser
      this.context = null;
      this.page = null;
    }
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Jalankan generateImageFlow dengan prompt dari hasil.json
 * @param {string} outputDir - folder output yang berisi hasil.json
 */
export async function generateImageFlow(
  outputDir,
  promptsPerProfile = 3,
  imagesPerPrompt = 2,
  promptTimeoutMs = 60000,
  maxConcurrentProfiles = 10,
) {
  try {
    const hasilJsonPath = `${outputDir}/hasil.json`;

    let prompts = [];
    try {
      const hasilData = await fs.readFile(hasilJsonPath, "utf-8");
      const hasil = JSON.parse(hasilData);

      prompts = Array.isArray(hasil)
        ? hasil
            .map((item) => {
              if (!item) return null;

              // Ambil string mentah dari geminiResult atau properti lainnya
              const rawResult = item.geminiResult ?? item.prompt ?? item;

              let textToParse = rawResult;
              if (typeof rawResult === "object" && rawResult !== null) {
                textToParse =
                  rawResult.prompt ||
                  rawResult.text ||
                  Object.values(rawResult)[0];
              }

              if (typeof textToParse === "string") {
                try {
                  // Bersihkan bungkus markdown code block ```json ... ``` atau ``` ... ```
                  let cleanStr = textToParse.trim();
                  if (cleanStr.startsWith("```json")) {
                    cleanStr = cleanStr
                      .replace(/^```json/, "")
                      .replace(/```$/, "")
                      .trim();
                  } else if (cleanStr.startsWith("```")) {
                    cleanStr = cleanStr
                      .replace(/^```/, "")
                      .replace(/```$/, "")
                      .trim();
                  }

                  // Coba parse jika formatnya string JSON
                  const parsed = JSON.parse(cleanStr);
                  if (parsed && typeof parsed === "object") {
                    return (
                      parsed.prompt ||
                      parsed.text ||
                      Object.values(parsed).find(
                        (v) => typeof v === "string",
                      ) ||
                      cleanStr
                    );
                  }
                  return cleanStr;
                } catch (e) {
                  // Jika gagal parse JSON, kembalikan teks mentahnya
                  return textToParse;
                }
              }

              return null;
            })
            .filter((p) => typeof p === "string" && p.trim().length > 0)
        : [];

      console.log(`📄 Loaded ${prompts.length} prompts dari ${hasilJsonPath}`);
    } catch (err) {
      console.error(`❌ Gagal baca hasil.json: ${err.message}`);
      return;
    }

    if (prompts.length === 0) {
      console.log("⚠️ Tidak ada prompt, skip generateImageFlow");
      return;
    }

    // Setup saveDir
    const saveDir = `${outputDir}/Hasil`;

    await delay(5000); // Tunggu 5 detik sebelum mulai

    let round = 1;
    let promptsToProcess = [...prompts];

    while (promptsToProcess.length > 0) {
      console.log(
        `\n🔁 Mulai round ${round} dengan ${promptsToProcess.length} prompt tersisa`,
      );
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

        const activeProfilesInBatch = currentProfiles.filter(
          (p) => profileToPrompts[p].length > 0,
        );
        if (activeProfilesInBatch.length === 0) continue;

        console.log(
          `\n🚀 [Batch] Menjalankan ${activeProfilesInBatch.length} profil secara bersamaan...`,
        );

        const tasks = activeProfilesInBatch.map(async (profile, idx) => {
          const batchPrompts = profileToPrompts[profile];
          console.log(
            `👤 Profil: ${profile} | 📝 Ditugaskan ${batchPrompts.length} prompt`,
          );

          // Staggered delay agar browser tidak terbuka secara bersamaan di detik yang sama
          if (idx > 0) {
            const staggerDelay = idx * 3000; // 3 detik per browser
            await delay(staggerDelay);
          }

          return scrape(
            profile,
            batchPrompts,
            saveDir,
            imagesPerPrompt,
            promptTimeoutMs,
          )
            .then((successCount) => {
              if (successCount > 0) roundSuccess = true;
              console.log(
                `✅ Profile '${profile}' sukses memproses ${successCount}/${batchPrompts.length} prompt`,
              );

              if (successCount < batchPrompts.length) {
                const failed = batchPrompts.slice(successCount);
                failedPrompts.push(...failed);
                console.log(
                  `⚠️ ${failed.length} prompt dari profile '${profile}' gagal dan akan dikembalikan ke antrean.`,
                );
              }
            })
            .catch((err) => {
              console.error(
                `❌ Error tidak terduga pada profile '${profile}':`,
                err,
              );
              failedPrompts.push(...batchPrompts);
            });
        });

        await Promise.all(tasks);
      }

      if (!roundSuccess && failedPrompts.length > 0) {
        console.log(
          "⚠️ Tidak ada profile yang berhasil dalam round ini. Hentikan loop agar tidak infinite.",
        );
        break;
      }

      promptsToProcess = failedPrompts;
      if (promptsToProcess.length > 0) {
        console.log(
          `♻️ ${promptsToProcess.length} prompt dikembalikan ke antrean untuk round berikutnya.`,
        );
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
async function scrape(
  profile,
  batchPrompts,
  saveDir,
  expectedCount,
  timeoutMs,
) {
  console.log(`Profil ke : ${profile}`);

  const browserI = new browser();

  try {
    await browserI.init(profile);

    await browserI.page.goto("https://labs.google/fx/id/tools/flow", {
      waitUntil: "networkidle",
    });

    const { successCount, finalUrl } = await generate(
      browserI.page,
      profile,
      batchPrompts,
      saveDir,
      expectedCount,
      timeoutMs,
    );

    // --- SIMPAN KE HISTORY.JSON ---
    saveHistory(profile, finalUrl, successCount, saveDir);
    // ------------------------------

    await new Promise((resolve) => setTimeout(resolve, 5000));

    return successCount;

    await new Promise((resolve) => setTimeout(resolve, 5000));

    return successCount;
  } catch (err) {
    console.error(`❌ Error di profile '${profile}': ${err.message}`);
    return 0; // Gagal semua
  } finally {
    try {
      await browserI.close();
    } catch (closeErr) {
      console.error(
        `❌ Gagal menutup browser profile '${profile}': ${closeErr.message}`,
      );
    }
  }
}

export async function openProfiles() {
  console.log(`📦 Total profil ditemukan: ${profiles.length}`);
  let batchSize = 3;

  for (let i = 0; i < profiles.length; i += batchSize) {
    const currentBatch = profiles.slice(i, i + batchSize);
    console.log(
      `\n🚀 Membuka batch profil (${i + 1} s/d ${i + currentBatch.length}):`,
      currentBatch,
    );

    // Array untuk menyimpan instance browser aktif di batch ini
    const activeBrowsers = [];

    for (const profile of currentBatch) {
      try {
        console.log(`🌐 Membuka profile: ${profile}`);

        // Membuka persistent context tanpa bendera automation
        const context = await chromium.launchPersistentContext(
          `D:\\chrome-profiles\\${profile}`,
          {
            executablePath:
              "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            headless: false,
            ignoreDefaultArgs: ["--enable-automation", "--disable-extensions"],
            args: [
              "--disable-blink-features=AutomationControlled",
              "--start-maximized",
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-infobars",
              "--window-position=0,0",
              "--ignore-certificate-errors",
            ],
            viewport: null,
          },
        );

        const pages = context.pages();
        const page = pages.length > 0 ? pages[0] : await context.newPage();

        // Hapus jejak webdriver agar terlihat seperti browser manual/asli
        await context.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", {
            get: () => undefined,
          });
          window.chrome = {
            runtime: {},
            loadTimes: function () {},
            csi: function () {},
          };
        });

        // Buka halaman utama Flow AI (atau bisa dikosongkan jika hanya ingin buka browsernya saja)
        await page
          .goto("https://labs.google/fx/id/tools/flow", {
            waitUntil: "domcontentloaded",
          })
          .catch(() => {});

        activeBrowsers.push({ profile, context });
        await delay(1500); // Jeda kecil antar pembukaan jendela browser
      } catch (err) {
        console.error(`❌ Gagal membuka profile '${profile}': ${err.message}`);
      }
    }

    console.log(`✅ ${activeBrowsers.length} profil berhasil dibuka.`);

    // Jika masih ada sisa profil berikutnya di antrean, tunggu input Space dari user
    if (i + batchSize < profiles.length) {
      function waitForKeypress() {
        return new Promise((resolve) => {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          console.log(
            "\n⏸️  [PAUSE] Tekan [SPACE] lalu [ENTER] untuk melanjutkan ke 3 profil berikutnya...",
          );

          rl.on("line", (line) => {
            rl.close();
            resolve();
          });
        });
      }
    } else {
      console.log("\n🎉 Semua profil telah selesai dibuka!");
    }
  }
}

async function handleFlowPopups(page) {
  const signInButton = page
    .getByRole("button", { name: /Sign in to Flow/i })
    .first();
  if (await signInButton.count() > 0 && await signInButton.isVisible()) {
    await signInButton.click();
    await page.waitForTimeout(1500);
  }

  const settingsHeading = page
    .getByRole("heading", { name: /Gunakan dan bentuk alat AI untuk kreativitas/i })
    .first();
  if (await settingsHeading.count() > 0 && await settingsHeading.isVisible()) {
    const checkboxes = page.getByRole("checkbox");
    for (let i = 0; i < await checkboxes.count(); i++) {
      const checkbox = checkboxes.nth(i);
      if ((await checkbox.getAttribute("aria-checked")) !== "true") {
        await checkbox.check().catch(() => checkbox.click());
      }
    }

    const nextButton = page
      .getByRole("button", { name: /Berikutnya/i })
      .first();
    await nextButton.waitFor({ state: "visible", timeout: 30000 });
    await nextButton.click();
    await page.waitForTimeout(1000);
  }

  const privacyHeading = page
    .getByRole("heading", { name: /Tinjau kebijakan privasi kami/i })
    .first();
  if (await privacyHeading.count() > 0 && await privacyHeading.isVisible()) {
    const scrollContainer = privacyHeading.locator("xpath=..").locator("xpath=..");
    await scrollContainer.evaluate((element) => {
      let current = element;
      while (current && current !== document.body) {
        if (current.scrollHeight > current.clientHeight) {
          current.scrollTop = current.scrollHeight;
          return;
        }
        current = current.parentElement;
      }
      window.scrollTo(0, document.body.scrollHeight);
    });

    const continueButton = page
      .getByRole("button", { name: /Lanjutkan/i })
      .first();
    await continueButton.waitFor({ state: "visible", timeout: 30000 });
    for (let attempt = 0; attempt < 15 && await continueButton.isDisabled(); attempt++) {
      await scrollContainer.evaluate((element) => {
        let current = element;
        while (current && current !== document.body) {
          if (current.scrollHeight > current.clientHeight) {
            current.scrollTop = current.scrollHeight;
            return;
          }
          current = current.parentElement;
        }
      });
      await page.waitForTimeout(400);
    }
    await continueButton.click();
    await page.waitForTimeout(1500);
  }
}

export async function openSharedFlowInAllProfiles() {
  const sharedFlowUrl =
    "https://labs.google/fx/tools/flow/shared/tool/a82f2baf-ebcd-4e00-b119-2ef077fe44af";
  const activeBrowsers = [];

  if (profiles.length === 0) {
    console.log("Tidak ada profil Chrome yang tersedia.");
    return;
  }

  for (const [index, profile] of profiles.entries()) {
    const profileBrowser = new browser();

    try {
      console.log(`🌐 Membuka shared Flow pada ${profile} (${index + 1}/${profiles.length})...`);
      await profileBrowser.init(profile);
      const page = profileBrowser.page;

      await page.goto("https://labs.google/fx/id/tools/flow", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(3000);
      await handleFlowPopups(page);

      const newProjectButton = page
        .getByRole("button", { name: /Project baru|New project/i })
        .first();
      if (await newProjectButton.count() > 0 && await newProjectButton.isVisible()) {
        await newProjectButton.click();
      }

      const projectUrlPattern =
        /https:\/\/labs\.google\/fx\/id\/tools\/flow\/project\/[^/]+\/tool-version\/a82f2baf-ebcd-4e00-b119-2ef077fe44af/;
      await page.waitForURL(projectUrlPattern, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const promptMarker = page.getByText("Paste JSON or Type Prompt", { exact: true }).first();
      const isPromptProject = projectUrlPattern.test(page.url()) &&
        await promptMarker.count() > 0 &&
        await promptMarker.isVisible();

      if (isPromptProject) {
        activeBrowsers.push({ profile, context: profileBrowser.context });
        console.log(`✅ ${profile}: project siap, ditemukan "Paste JSON or Type Prompt".`);
        continue;
      }

      await page.goto(sharedFlowUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);
      await handleFlowPopups(page);

      const tryProjectButton = page
        .getByRole("button", { name: /Coba di project/i })
        .first();
      await tryProjectButton.waitFor({ state: "visible", timeout: 30000 });
      await tryProjectButton.click();

      const projectDate = page
        .locator("span")
        .filter({ hasText: /\d{1,2}:\d{2}/ })
        .first();
      await projectDate.waitFor({ state: "visible", timeout: 30000 });
      await projectDate.click();

      const openButton = page
        .getByRole("button", { name: /^Buka$/i })
        .first();
      await openButton.waitFor({ state: "visible", timeout: 30000 });
      await openButton.click();

      await page.waitForTimeout(3000);
      const moreOptionsButton = page
        .getByRole("button", { name: /Opsi lainnya/i })
        .first();
      await moreOptionsButton.waitFor({ state: "visible", timeout: 30000 });
      await moreOptionsButton.click();

      const pinButton = page
        .getByRole("menuitem", { name: /Sematkan/i })
        .first();
      await pinButton.waitFor({ state: "visible", timeout: 30000 });
      await pinButton.click();

      activeBrowsers.push({ profile, context: profileBrowser.context });
      console.log(`✅ Project berhasil dibuka pada ${profile}.`);
      await delay(1500);
    } catch (err) {
      console.error(`❌ Gagal membuka project pada profile '${profile}': ${err.message}`);
      await profileBrowser.close().catch(() => {});
    }
  }

  console.log(`✅ Selesai: ${activeBrowsers.length}/${profiles.length} profile berhasil diproses.`);
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
