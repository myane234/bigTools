import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs/promises';
import { generate } from './utils/automationGenerate.js';
import {
  isProfileQuotaBlocked,
  markProfileQuotaBlocked,
  saveHistory,
  getNonLabsProfiles,
} from './utils/historyJson.js';

// Baca & filter hanya folder profil yang valid (profile1, profile2, dst.)
export const profiles = (await fs.readdir('D:\\chrome-profiles'))
  .filter(name => /^profile\d+$/i.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

chromium.use(StealthPlugin());
console.log(profiles);

// ─── Browser Class ──────────────────────────────────────────────────────────

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
          '--disable-extensions',
        ],
        args: [
          '--disable-blink-features=AutomationControlled',
          '--start-maximized',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certificate-errors',
        ],
        viewport: null,
      },
    );

    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    try {
      this.page.browser = () => this.context.browser();
    } catch (e) {
      // ignore
    }

    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = {
        runtime: {},
        loadTimes: function () {},
        csi: function () {},
      };
    });
  }

  async close() {
    if (this.context) {
      await new Promise(r => setTimeout(r, 1000));
      await this.context.close();
      this.context = null;
      this.page = null;
    }
  }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ─── Generate Image Flow ─────────────────────────────────────────────────────

/**
 * Entry point utama: jalankan generateImageFlow dari hasil.json
 * @param {string} outputDir - folder output yang berisi hasil.json
 * @param {number} promptsPerProfile - prompt per profil (tidak dipakai langsung, untuk referensi)
 * @param {number} imagesPerPrompt - target jumlah gambar per prompt
 * @param {number} promptTimeoutMs - batas waktu tunggu gambar (ms)
 * @param {number} maxConcurrentProfiles - maksimal profile berjalan bersamaan
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

    // Filter profil yang tidak sedang diblokir kuota
    const availableProfiles = profiles.filter(p => !isProfileQuotaBlocked(p));
    const blockedProfiles = profiles.filter(p => isProfileQuotaBlocked(p));

    for (const profile of blockedProfiles) {
      console.log(`⏭️ Melewati ${profile}: kuota habis hari ini.`);
    }

    if (availableProfiles.length === 0) {
      console.log('Tidak ada profile yang tersedia (semua kena blokir kuota).');
      return;
    }

    // Baca prompts dari hasil.json
    let prompts = [];
    try {
      const hasilData = await fs.readFile(hasilJsonPath, 'utf-8');
      const hasil = JSON.parse(hasilData);
      prompts = Array.isArray(hasil)
        ? hasil.map(item => item?.prompt).filter(p => typeof p === 'string' && p.trim())
        : [];
      console.log(`📄 Loaded ${prompts.length} prompts dari ${hasilJsonPath}`);
    } catch (err) {
      console.error(`❌ Gagal baca hasil.json: ${err.message}`);
      return;
    }

    if (prompts.length === 0) {
      console.log('⚠️ Tidak ada prompt, skip generateImageFlow');
      return;
    }

    const saveDir = `${outputDir}/Hasil`;
    await delay(5000);

    let round = 1;
    let promptsToProcess = [...prompts];

    while (promptsToProcess.length > 0) {
      const roundProfiles = availableProfiles.filter(p => !isProfileQuotaBlocked(p));
      if (roundProfiles.length === 0) {
        console.log('⏭️ Semua profile tersisa terkena blokir kuota.');
        break;
      }

      console.log(`\n🔁 Mulai round ${round} dengan ${promptsToProcess.length} prompt tersisa`);
      const failedPrompts = [];

      // Distribusi prompt merata ke semua profil
      const profileToPrompts = {};
      for (const profile of roundProfiles) profileToPrompts[profile] = [];

      for (let i = 0; i < promptsToProcess.length; i++) {
        const profile = roundProfiles[i % roundProfiles.length];
        profileToPrompts[profile].push(promptsToProcess[i]);
      }

      let roundSuccess = false;

      // Jalankan profil dalam batch
      for (let i = 0; i < roundProfiles.length; i += maxConcurrentProfiles) {
        const currentProfiles = roundProfiles.slice(i, i + maxConcurrentProfiles);
        const activeProfiles = currentProfiles.filter(p => profileToPrompts[p].length > 0);
        if (activeProfiles.length === 0) continue;

        console.log(`\n🚀 [Batch] Menjalankan ${activeProfiles.length} profil bersamaan...`);

        const tasks = activeProfiles.map(async (profile, idx) => {
          const batchPrompts = profileToPrompts[profile];
          console.log(`👤 Profil: ${profile} | 📝 ${batchPrompts.length} prompt`);

          // Stagger agar tidak buka browser bersamaan
          if (idx > 0) await delay(idx * 3000);

          return scrape(profile, batchPrompts, saveDir, imagesPerPrompt, promptTimeoutMs)
            .then(successCount => {
              if (successCount > 0) roundSuccess = true;
              console.log(`✅ Profile '${profile}': ${successCount}/${batchPrompts.length} prompt berhasil`);
              if (successCount < batchPrompts.length) {
                const failed = batchPrompts.slice(successCount);
                failedPrompts.push(...failed);
                console.log(`⚠️ ${failed.length} prompt dari '${profile}' gagal, dikembalikan ke antrean.`);
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
        console.log('⚠️ Tidak ada profile yang berhasil. Hentikan loop.');
        break;
      }

      promptsToProcess = failedPrompts;
      if (promptsToProcess.length > 0) {
        console.log(`♻️ ${promptsToProcess.length} prompt ke antrean berikutnya.`);
      }
      round++;
    }

    console.log('\n✅ Selesai generateImageFlow');
  } catch (err) {
    console.error(err);
  }
}

// ─── Scrape Per-Profile ───────────────────────────────────────────────────────

/**
 * Jalankan satu sesi scrape untuk satu profile
 * @param {string} profile
 * @param {string[]} batchPrompts
 * @param {string} saveDir
 * @param {number} expectedCount
 * @param {number} timeoutMs
 * @returns {Promise<number>}
 */
async function scrape(profile, batchPrompts, saveDir, expectedCount, timeoutMs) {
  console.log(`Profil ke: ${profile}`);
  const browserI = new browser();

  try {
    await browserI.init(profile);
    await fs.mkdir(saveDir, { recursive: true });

    await browserI.page.goto('https://labs.google/fx/id/tools/flow', {
      waitUntil: 'networkidle',
    });

    const successCount = await generate(
      browserI.page,
      profile,
      batchPrompts,
      saveDir,
      expectedCount,
      timeoutMs,
    );

    // Simpan riwayat ke history.json
    saveHistory(profile, browserI.page.url(), successCount, saveDir);

    await new Promise(resolve => setTimeout(resolve, 5000));
    return successCount;
  } catch (err) {
    console.error(`❌ Error di profile '${profile}': ${err.message}`);
    return 0;
  } finally {
    try {
      await browserI.close();
    } catch (closeErr) {
      console.error(`❌ Gagal menutup browser '${profile}': ${closeErr.message}`);
    }
  }
}

// ─── Popup Handler ────────────────────────────────────────────────────────────

/**
 * Tangani popup onboarding Flow (Sign in, settings, privacy)
 */
async function handleFlowPopups(page) {
  const signInButton = page.getByRole('button', { name: /Sign in to Flow/i }).first();
  if (await signInButton.count() > 0 && await signInButton.isVisible()) {
    await signInButton.click();
    await page.waitForTimeout(1500);
  }

  const settingsHeading = page
    .getByRole('heading', { name: /Gunakan dan bentuk alat AI untuk kreativitas/i })
    .first();
  if (await settingsHeading.count() > 0 && await settingsHeading.isVisible()) {
    const checkboxes = page.getByRole('checkbox');
    for (let i = 0; i < await checkboxes.count(); i++) {
      const checkbox = checkboxes.nth(i);
      if ((await checkbox.getAttribute('aria-checked')) !== 'true') {
        await checkbox.check().catch(() => checkbox.click());
      }
    }
    const nextButton = page.getByRole('button', { name: /Berikutnya/i }).first();
    await nextButton.waitFor({ state: 'visible', timeout: 30000 });
    await nextButton.click();
    await page.waitForTimeout(1000);
  }

  const privacyHeading = page
    .getByRole('heading', { name: /Tinjau kebijakan privasi kami/i })
    .first();
  if (await privacyHeading.count() > 0 && await privacyHeading.isVisible()) {
    const scrollContainer = privacyHeading.locator('xpath=..').locator('xpath=..');
    const scrollDown = async () =>
      scrollContainer.evaluate(el => {
        let c = el;
        while (c && c !== document.body) {
          if (c.scrollHeight > c.clientHeight) { c.scrollTop = c.scrollHeight; return; }
          c = c.parentElement;
        }
        window.scrollTo(0, document.body.scrollHeight);
      });

    await scrollDown();
    const continueButton = page.getByRole('button', { name: /Lanjutkan/i }).first();
    await continueButton.waitFor({ state: 'visible', timeout: 30000 });

    for (let attempt = 0; attempt < 15 && await continueButton.isDisabled(); attempt++) {
      await scrollDown();
      await page.waitForTimeout(400);
    }
    await continueButton.click();
    await page.waitForTimeout(1500);
  }
}

// ─── Open Shared Flow ─────────────────────────────────────────────────────────

/**
 * Buka shared Flow di semua profil dan sematkan ke project masing-masing
 */
export async function openSharedFlowInAllProfiles() {
  const sharedFlowUrl =
    'https://labs.google/fx/tools/flow/shared/tool/a82f2baf-ebcd-4e00-b119-2ef077fe44af';
  const activeBrowsers = [];

  if (profiles.length === 0) {
    console.log('Tidak ada profil Chrome yang tersedia.');
    return;
  }

  for (const [index, profile] of profiles.entries()) {
    const profileBrowser = new browser();

    try {
      console.log(`🌐 Membuka shared Flow pada ${profile} (${index + 1}/${profiles.length})...`);
      await profileBrowser.init(profile);
      const page = profileBrowser.page;

      await page.goto('https://labs.google/fx/id/tools/flow', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await handleFlowPopups(page);

      // Cek apakah project dengan tool sudah ada
      const newProjectButton = page
        .getByRole('button', { name: /Project baru|New project/i })
        .first();
      if (await newProjectButton.count() > 0 && await newProjectButton.isVisible()) {
        await newProjectButton.click();
      }

      const projectUrlPattern =
        /https:\/\/labs\.google\/fx\/id\/tools\/flow\/project\/[^/]+\/tool-version\/a82f2baf-ebcd-4e00-b119-2ef077fe44af/;
      await page.waitForURL(projectUrlPattern, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);

      const promptMarker = page.getByText('Paste JSON or Type Prompt', { exact: true }).first();
      const isPromptProject =
        projectUrlPattern.test(page.url()) &&
        (await promptMarker.count()) > 0 &&
        (await promptMarker.isVisible());

      if (isPromptProject) {
        activeBrowsers.push({ profile, context: profileBrowser.context });
        console.log(`✅ ${profile}: project sudah siap.`);
        continue;
      }

      // Buka shared flow dan salin ke project
      await page.goto(sharedFlowUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await handleFlowPopups(page);

      const tryProjectButton = page
        .getByRole('button', { name: /Coba di project/i })
        .first();
      await tryProjectButton.waitFor({ state: 'visible', timeout: 30000 });
      await tryProjectButton.click();

      const projectDate = page.locator('span').filter({ hasText: /\d{1,2}:\d{2}/ }).first();
      await projectDate.waitFor({ state: 'visible', timeout: 30000 });
      await projectDate.click();

      const openButton = page.getByRole('button', { name: /^Buka$/i }).first();
      await openButton.waitFor({ state: 'visible', timeout: 30000 });
      await openButton.click();

      await page.waitForTimeout(3000);
      const moreOptionsButton = page
        .getByRole('button', { name: /Opsi lainnya/i })
        .first();
      await moreOptionsButton.waitFor({ state: 'visible', timeout: 30000 });
      await moreOptionsButton.click();

      const pinButton = page.getByRole('menuitem', { name: /Sematkan/i }).first();
      await pinButton.waitFor({ state: 'visible', timeout: 30000 });
      await pinButton.click();

      activeBrowsers.push({ profile, context: profileBrowser.context });
      console.log(`✅ Project berhasil dibuka pada ${profile}.`);
      await delay(1500);
    } catch (err) {
      console.error(`❌ Gagal membuka project pada '${profile}': ${err.message}`);
      await profileBrowser.close().catch(() => {});
    }
  }

  console.log(
    `✅ Selesai: ${activeBrowsers.length}/${profiles.length} profile berhasil diproses.`,
  );
}
