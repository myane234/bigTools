import puppeteer from "puppeteer-extra";
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

//utils
import {
  imageQueue,
  setDownloaderFinished,
  getDownloaderFinished,
} from "./utils/queue.js";
import { ask, askAwal } from "./utils/CliAsk/tanya.js";
import { scrollAll, delay } from "./utils/scrool.js";
import Gemini from "./utils/gemini/geminiAi.js";
import { stopTesting, testingMode } from "./utils/CliAsk/TestingMode.js";
import { GeminiClient } from "../Gemini/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
puppeteer.use(StealthPlugin())
// Note: downloads folder will be created inside `outputDir` provided by the user

//testing
const modeScrape = false; //Testing mode true
let testingPilihan = null;

if (modeScrape) {
  testingPilihan = await testingMode();
  let limitGemini = 5; // kalau testing, batasi proses Gemini cuman 5
}

//blokade

async function checkKeyApp() {
  const KeyApp = path.join("D:", "wlee.txt");

  if (!fs.existsSync(KeyApp)) {
    console.log(KeyApp);
    throw new Error("Key App tidak ditemukan");
  }
  const checkKey = await fs.promises.readFile(KeyApp, "utf8");

  if (checkKey.trim() !== "babiBerjalan") {
    throw new Error("Key App salah");
  }

  return true;
}

const tokenFile = path.join("D:", "tokens.txt");


const tokens = (await fs.promises.readFile(tokenFile, "utf8"))
  .split(/\r?\n|,/)
  .map((t) => t.trim())
  .filter(Boolean);

export async function calculateWorkerCount() {
  try {
    const workersPerToken = 2; // sesuaikan dengan kebutuhan: setiap token punya 2 worker
    const workerCount = tokens.length * workersPerToken;

    // safety: jika ada limit max dari provider, ganti di sini (misal 10 worker max)
    // const maxFtps = 10;
    // const workerCountFinal = Math.min(workerCount, maxFtps);

    console.log(
      `Worker count yang akan digunakan: ${workerCount} (dengan ${tokens.length} token, ${workersPerToken} worker/token)`,
    );
    return workerCount;
  } catch (err) {
    console.error("Error calculating worker count:", err);
    throw err;
  }
}

//Blokade

const GEMINI_MAX_REQ_PER_MINUTE = 120;
const GEMINI_MIN_INTERVAL_MS = Math.ceil(60000 / GEMINI_MAX_REQ_PER_MINUTE); // 500 ms
let lastGeminiRequestTs = 0;

async function waitGeminiRateLimit() {
  const now = Date.now();
  const elapsed = now - lastGeminiRequestTs;
  if (elapsed < GEMINI_MIN_INTERVAL_MS) {
    await delay(GEMINI_MIN_INTERVAL_MS - elapsed);
  }
  lastGeminiRequestTs = Date.now();
}

async function Base64(imagePath) {
  try {
    const imageBuffer = await fs.promises.readFile(imagePath);
    return imageBuffer.toString("base64");
  } catch (err) {
    console.error("error converting file to base64:", err);
    throw err;
  }
}

async function sortingFile(outputDir) {
  const filePerFolder = 150;
  const hasilToSorting = path.join(outputDir, "Hasil");

  if (!fs.existsSync(hasilToSorting)) {
    console.log(` Folder 'Hasil' tidak ditemukan di ${hasilToSorting}`);
    return;
  }

  try {
    console.log("hasilFolder:", hasilToSorting);

    const allItems = await fs.promises.readdir(hasilToSorting, {
      withFileTypes: true,
    });
    const files = allItems.filter((item) => item.isFile());
    const totalFiles = files.length;

    if (totalFiles === 0) {
      console.log(" Tidak ada file di folder ini.");
      return;
    }

    if (totalFiles < filePerFolder) {
      console.log(
        ` File cuma ${totalFiles}, kurang dari ${filePerFolder}. Tidak perlu sorting.`,
      );
      return;
    }

    console.log(` Total file: ${totalFiles}, mulai sorting...`);

    let folderIndex = 1;

    for (let i = 0; i < totalFiles; i += filePerFolder) {
      const chunk = files.slice(i, i + filePerFolder);
      const folderName = `Hasil_${folderIndex}`;
      const folderPath = path.join(outputDir, folderName);
      await fs.promises.mkdir(folderPath, { recursive: true });

      // rename paralel
      await Promise.all(
        chunk.map(async (file) => {
          const oldPath = path.join(hasilToSorting, file.name);
          const newPath = path.join(folderPath, file.name);
          if (fs.existsSync(oldPath))
            await fs.promises.rename(oldPath, newPath);
          else console.log(`File tidak ditemukan: ${file.name}`);
        }),
      );

      console.log(`${folderName} → ${chunk.length} files`);
      folderIndex++;
    }

    console.log("Sorting selesai!");

    await delay(2000);

    await fs.promises.rm(hasilToSorting, { recursive: true, force: true });
    console.log(
      `Folder 'Hasil' sudah dipindahkan isinya ke batch_*, dan folder 'Hasil' dihapus.`,
    );
    console.log(`Folder 'Hasil' kosong dan dihapus.`);
  } catch (err) {
    console.error(`Error at sortingFile ${err}`);
  }
}

async function getImage(downloadsDir) {
  try {
    const files = await fs.promises.readdir(downloadsDir);

    if (files.length === 0) {
      throw new Error("Gak ada gambar di folderImage");
    }

    const imageFiles = files.filter((file) =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file),
    );

    return imageFiles;
  } catch (err) {
    console.error("error getting image:", err);
    throw err;
  }
}

async function geminiWorker(hasilFilePath) {
  const hasilJson = path.join(hasilFilePath, "hasil.json");
  const hasil = [];

  while (!getDownloaderFinished() || imageQueue.length > 0) {
    if (imageQueue.length === 0) {
      await delay(500);
      continue;
    }

    const imagePath = imageQueue.shift();
    const result = await processImagesWithGemini(imagePath);

    if (result) {
      hasil.push(result);
      // Tulis file hasil sementara
      await fs.promises.writeFile(hasilJson, JSON.stringify(hasil, null, 2));
      console.log(
        `Hasil sementara disimpan: ${hasilJson} (total ${hasil.length} items)`,
      );
    } else {
      console.log(`Lewati ${imagePath} karena gagal total setelah retry`);
    }
  }

  console.log("Gemini Worker Selesai, hasil.json dibuat");
}

async function processImagesWithGemini(imagePath) {
  const maxRetries = 3000; // tambah max retries untuk 429 / error lain
  const retryDelay = 10000; // Delay 10detik

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await waitGeminiRateLimit();
      console.log(`\nMemproses ${imagePath} dengan... (attempt ${attempt})`);
      const base64Image = await Base64(imagePath);
      const geminiResult = await Gemini.generateImage(base64Image);
      console.log(`Selesai proses: ${imagePath}`);
      return { filename: path.basename(imagePath), geminiResult };
    } catch (err) {
      const code = err?.status || err?.code || "";
      console.error(
        `Gagal proses ${imagePath} (attempt ${attempt}) - ${code}: ${err.message}`,
      );

      // jika rate-limit, perpanjang delay
      if (code === 429 || err.message.toLowerCase().includes("rate limit")) {
        console.log("Terjadi 429 (rate limit), delay tambahan 15000ms...");
        await delay(30000); // delay 30 detik
      }

      if (attempt < maxRetries) {
        console.log(`Retry dalam ${retryDelay}ms...`);
        await delay(retryDelay);
        continue;
      } else {
        console.error(
          `Max retries reached for ${imagePath}. Skip agar hasil.json bukan prompt error.`,
        );
        return null;
      }
    }
  }

  return null;
}

// Fungsi untuk generate gambar dengan Whisk dari hasil Gemini
async function generateImagesFromGeminiResults(numWorkers, outputDir) {
  try {
    console.log(
      "\n Mulai generate gambar dengan Whisk berdasarkan hasil Gemini...\n",
    );

    // Baca hasil.json
    const hasilData = await fs.promises.readFile(
      path.join(outputDir, "hasil.json"),
      "utf-8",
    );
    const hasil = JSON.parse(hasilData);

    // Filter hasil yang gak ada error
    const validResults = hasil.filter((item) => !item.error);

    if (validResults.length === 0) {
      console.log(" Tidak ada hasil valid untuk di-generate");
      return;
    }

    console.log(
      `Ditemukan ${validResults.length} hasil valid dari Gemini AI\n`,
    );

    // Extract prompts
    const prompts = validResults.map((item) => {
      let promptText = item.geminiResult;
      if (typeof promptText === "string") {
        try {
          const parsed = JSON.parse(promptText);
          promptText = parsed.prompt;
        } catch (e) {
          // gunakan langsung
        }
      }
      return promptText;
    });

    // Run batch processing
    await createImageWhiskBatch(prompts, numWorkers, outputDir);
  } catch (err) {
    console.error("Error in generateImagesFromBlablaResults:", err);
    throw err;
  }
}

export async function main() {
  const keyApp = await checkKeyApp();
  if (keyApp !== true) {
    console.log("Key App tidak valid, keluar dari aplikasi.");
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1920,1080",
    ],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  );

  const { URL, pageCustom, outputDir } = await askAwal();

  try {
    await page.goto(URL, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await page.waitForSelector("img", { timeout: 10000 });

    console.log("Menunggu gambar dimuat...");
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight / 4);
      });

      await delay(2000);
    }

    await delay(3000);

    console.log("Mulai scroll pelan-pelan...");


    // const geminiPromise = geminiWorker(outputDir);
    const scrollResult = await scrollAll(page, pageCustom, outputDir); //1 kali scroll fullPage
    // setDownloaderFinished(true);

    console.log("\n Menutup browser setelah download selesai...");
    await browser.close();

    console.log(
      `\n Gambar berhasil disimpan di folder: ${path.join(outputDir, "downloads")}`,
    );

    if (scrollResult.successCount) {
      console.log(`Total gambar valid yang diproses: ${scrollResult.successCount}`);

      await GeminiClient(outputDir, 10); // proses Gemini untuk semua gambar yang valid

      // Setelah GeminiClient selesai, jalankan generateImageFlow
      const { generateImageFlow } = await import('../FlowGenerate/index.js');
      await generateImageFlow(outputDir);
    }

    // // Generate gambar dengan Whisk
    // await generateImagesFromGeminiResults(WhiskWorkersNum, outputDir); // jumlah worker bisa disesuaikan, misal 3 untuk proses paralel

    await sortingFile(outputDir);

    await delay(1000); //delay 10s

    process.exit(0);
  } catch (error) {
    console.error("\n ERROR:", error.message);
    if (error.message.includes("timeout")) {
      console.log("Timeout terjadi. Coba:");
      console.log("1. Periksa koneksi internet");
      console.log("2. Naikkan timeout di waitForSelector");
      console.log("3. Coba keyword lain");
    }
  } finally {
    console.log("\n Browser sudah ditutup setelah download.");
  }
}