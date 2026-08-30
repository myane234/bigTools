import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const textBox = 'textarea[placeholder^="Paste JSON array"]';
const testingGambarPath = "./GambarTesting";
const hasilPath = "./Hasil";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const flowImageUrlMarker = "flow-content.google/image";

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

async function waitForImage(page) {
  try {
    const appFrame = page.frameLocator('iframe[title="Applet preview"]');
    const generatingLocator = appFrame.locator("span", {
      hasText: "Generating",
    });

    // Locator untuk mendeteksi notifikasi kuota habis
    const quotaErrorLocator = appFrame.getByText(
      /Anda telah mencapai batas kuota/i,
    );

    await generatingLocator
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() =>
        console.log(
          "Proses sangat cepat atau gagal mulai, tidak mendeteksi tulisan Generating",
        ),
      );

    console.log("⏳ Menunggu proses generasi selesai...");

    const startTime = Date.now();
    while (true) {
      // --- CEK ERROR KUOTA ---
      // 1. Cek di dalam iframe
      if ((await quotaErrorLocator.count()) > 0 ||
        (await appFrame.getByText(/Kuota Agen Alat habis/i).count()) > 0 ||
        (await page.getByText(/Anda telah mencapai batas kuota|Kuota Agen Alat habis/i).count()) > 0) {
        console.log("🚨 Peringatan: Kuota Agen Alat habis!");
        return { success: false, quotaReached: true };
      }

      // 2. Cek di halaman utama (jaga-jaga jika toast muncul di luar iframe)
      if (
        (await page.getByText(/Anda telah mencapai batas kuota/i).count()) > 0
      ) {
        console.log("🚨 Peringatan: Kuota Agen Alat habis!");
        return { success: false, quotaReached: true };
      }
      // -----------------------

      // Cek apakah masih generating
      const count = await generatingLocator.count();
      if (count === 0) {
        break;
      }

      if (Date.now() - startTime > 90000) {
        console.log("⏱️ Timeout: Generasi terlalu lama (lebih dari 90 detik).");
        break;
      }

      await page.waitForTimeout(1000);
    }

    console.log("✅ Generasi selesai!");
    return { success: true, quotaReached: false };
  } catch (err) {
    console.error("Error saat menunggu proses generasi:", err);
    return { success: true, quotaReached: false }; // Default lanjut jika error sistem yang tidak diketahui
  }
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
export async function generate(
  page,
  profile,
  prompts,
  saveDir,
  expectedCount = 3,
  timeoutMs = 60000,
) {
  let successCount = 0;
  let finalUrl = "";
  let quotaReached = false;
  try {
    // Tangani popup consent / privacy jika muncul sebelum membuat project baru
    await handleInitialPopups(page).catch((err) =>
      console.warn("handleInitialPopups error:", err.message),
    );

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) =>
          b.textContent.includes("Project baru") ||
          b.textContent.includes("New project"),
      );
      btn?.click();
    });
    console.log("Click berhasil");

    // Tangani welcome slides jika muncul: klik "See what's new", lalu tekan Next sampai tombol Mulai muncul
    try {
      await page.waitForTimeout(800);

      const seeWhatsNew = page.getByRole("button", {
        name: /See what'?s new|See what's new/i,
      });
      if ((await seeWhatsNew.count()) > 0) {
        console.log("[Welcome] See what's new detected — clicking");
        await seeWhatsNew
          .first()
          .click()
          .catch(() => {});
        await page.waitForTimeout(600);
      }

      // Loop tekan Next sampai tombol Mulai/Start terlihat
      const startBtnName = /Mulai|Start|Get started|Lanjutkan/i;
      let attempts = 0;
      while (attempts < 12) {
        const startBtn = page
          .getByRole("button", { name: startBtnName })
          .first();
        if ((await startBtn.count()) > 0 && !(await startBtn.isDisabled())) {
          console.log("[Welcome] Start button detected — clicking");
          await startBtn.click().catch(() => {});
          await page.waitForTimeout(700);
          break;
        }

        // cari tombol Next dengan atribut atau aria-label
        const nextBtn = page
          .locator(
            'button[aria-label="Next"], button[data-button="next"], button.nav-btn.next-btn',
          )
          .first();
        if ((await nextBtn.count()) > 0) {
          console.log("[Welcome] Next button detected — clicking");
          await nextBtn.click().catch(() => {});
          await page.waitForTimeout(600);
          attempts++;
          continue;
        }

        // fallback: tombol dengan ikon arrow_forward
        const arrowBtn = page.getByText("arrow_forward").first();
        if ((await arrowBtn.count()) > 0) {
          console.log("[Welcome] Arrow forward detected — clicking");
          await arrowBtn
            .first()
            .click()
            .catch(() => {});
          await page.waitForTimeout(600);
          attempts++;
          continue;
        }

        // tidak ada tombol next/start — hentikan
        break;
      }
    } catch (e) {
      console.warn("[Welcome] error handling slides:", e.message);
    }
    await delay(6000);

    const projectUrl = page.url();
    const ToolsUrl = "/tool-version/a82f2baf-ebcd-4e00-b119-2ef077fe44af";

    console.log(`Project URL: ${projectUrl}`);

    finalUrl = projectUrl.replace(/\/$/, "") + ToolsUrl;

    await page.goto(finalUrl, { waitUntil: "networkidle" });

    await delay(6000); // Tunggu 6 detik untuk memastikan UI sudah siap

    for (let i = 0; i < prompts.length; i++) {
      let prompt = prompts[i];

      // Pengaman mutlak: pastikan prompt selalu berupa string yang valid
      if (typeof prompt !== "string") {
        if (prompt && typeof prompt === "object") {
          prompt =
            prompt.prompt ||
            prompt.text ||
            Object.values(prompt).find((v) => typeof v === "string") ||
            "";
        } else {
          prompt = String(prompt || "");
        }
      }

      if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
        console.warn(
          `⚠️ Prompt ke-${i + 1} kosong atau format tidak valid, melewati...`,
        );
        continue;
      }

      console.log(
        `\n▶️ Memproses prompt ${i + 1}/${prompts.length}: ${prompt.substring(0, 60)}...`,
      );

      const appFrame = page.frameLocator('iframe[title="Applet preview"]');

      // Klik dan isi teks langsung di dalam iframe (Fungsi 'fill' di Playwright otomatis memicu event React)
      await appFrame.locator(textBox).click();
      await appFrame.locator(textBox).fill(prompt);

      await delay(2000);

      // Tekan Enter spesifik pada textarea di dalam iframe
      await appFrame.locator("button", { hasText: "Create" }).click();

      const generationResult = await waitForImage(page);

      // Jika false (karena kuota habis), hentikan perulangan prompt
      if (!generationResult.success) {
        quotaReached = generationResult.quotaReached;
        console.log(
          `🛑 Menghentikan proses pada profile: ${profile} karena batas kuota.`,
        );
        break; // Langsung keluar dari loop for, menuju ke 'return successCount'
      }
      successCount++;
    }

    return { successCount, finalUrl, quotaReached };
  } catch (err) {
    console.error("Error di generate:", err);
    await page.screenshot({
      path: `${testingGambarPath}/${profile}_error.png`,
    });
    return { successCount, finalUrl, quotaReached };
  }
}

async function handleInitialPopups(page) {
  // small delay to let modal render
  await page.waitForTimeout(800);

  // Consent modal: detect by visible label text instead of auto-generated classes
  const researchLabel = page.getByText("Saya ingin menerima undangan riset");
  if ((await researchLabel.count()) > 0) {
    console.log(
      "[Popup] Consent modal detected — trying to select research and click Next",
    );
    try {
      await researchLabel
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(300);

      const nextBtn = page
        .getByRole("button", { name: /Berikutnya|Next|Continue/i })
        .first();
      if ((await nextBtn.count()) > 0) {
        await nextBtn.click().catch(() => {});
        await page.waitForTimeout(700);
      }
    } catch (e) {
      console.warn("[Popup] Failed to handle consent modal:", e.message);
    }
  }

  // Privacy policy modal: detect by heading text and scroll reachable ancestor
  const policyHeading = page.getByRole("heading", {
    name: /Tinjau kebijakan privasi|Tinjau kebijakan/i,
  });
  if ((await policyHeading.count()) > 0) {
    console.log(
      "[Popup] Privacy policy modal detected — scrolling until Continue is enabled",
    );
    const continueBtn = page
      .getByRole("button", { name: /Lanjutkan|Continue|Next/i })
      .first();

    // Scroll ancestor container of the heading until continue enabled or max attempts
    let attempts = 0;
    while (
      (await continueBtn.count()) > 0 &&
      (await continueBtn.isDisabled()) &&
      attempts < 15
    ) {
      await page.evaluate((headingText) => {
        const headings = Array.from(document.querySelectorAll("h1,h2,h3"));
        const h = headings.find(
          (e) => e.textContent && e.textContent.includes(headingText),
        );
        if (!h) return;
        let el = h.parentElement;
        // climb until find scrollable container
        while (el && el !== document.body && el.scrollHeight <= el.clientHeight)
          el = el.parentElement;
        if (el && el.scrollHeight > el.clientHeight)
          el.scrollTop = el.scrollHeight;
      }, "Tinjau kebijakan privasi");

      await page.waitForTimeout(600);
      attempts++;
    }

    if ((await continueBtn.count()) > 0 && !(await continueBtn.isDisabled())) {
      await continueBtn.click().catch(() => {});
      await page.waitForTimeout(500);
    } else {
      console.warn("[Popup] Continue button not enabled after scrolling");
    }
  }
}
