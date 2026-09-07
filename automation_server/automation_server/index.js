import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

//utils
import {
  imageQueue,
  setDownloaderFinished,
  getDownloaderFinished,
} from "./utils/queue.js";
import { ask, askAwal, askGroqNFlowGenerate } from "./utils/CliAsk/tanya.js";
import { scrollAll, delay } from "./utils/scrool.js";
import GroqAi from "./utils/groq/groqAi.js";
import { generateImageFlow } from "../FlowGenerate/index.js";
import { stopTesting, testingMode } from "./utils/CliAsk/TestingMode.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Note: downloads folder will be created inside `outputDir` provided by the user

//testing
const modeScrape = false; //Testing mode true
let testingPilihan = null;

if (modeScrape) {
  testingPilihan = await testingMode();
  let limitGroq = 5; // kalau testing, batasi proses Groq cuma 5
}

//blokade

// async function checkKeyApp() {
//   const KeyApp = path.join("D:", "wlee.txt");

//   if (!fs.existsSync(KeyApp)) {
//     console.log(KeyApp);
//     throw new Error("Key App tidak ditemukan");
//   }
//   const checkKey = await fs.promises.readFile(KeyApp, "utf8");

//   if (checkKey.trim() !== "babiBerjalan") {
//     throw new Error("Key App salah");
//   }

//   return true;
// }

// Blokade logic removed as calculateWorkerCount and tokens are no longer needed

//Blokade

const GROQ_MAX_REQ_PER_MINUTE = 30;
const GROQ_MIN_INTERVAL_MS = Math.ceil(60000 / GROQ_MAX_REQ_PER_MINUTE); // 2000 ms
let lastGroqRequestTs = 0;

async function waitGroqRateLimit() {
  const now = Date.now();
  const elapsed = now - lastGroqRequestTs;
  if (elapsed < GROQ_MIN_INTERVAL_MS) {
    await delay(GROQ_MIN_INTERVAL_MS - elapsed);
  }
  lastGroqRequestTs = Date.now();
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

async function groqWorker(hasilFilePath) {
  const hasilJson = path.join(hasilFilePath, "hasil.json");
  const hasil = [];

  while (!getDownloaderFinished() || imageQueue.length > 0) {
    if (imageQueue.length === 0) {
      await delay(500);
      continue;
    }

    const imagePath = imageQueue.shift();
    const result = await processImagesWithGroq(imagePath);

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

  console.log("Groq Worker Selesai, hasil.json dibuat");
}

async function processImagesWithGroq(imagePath) {
  const maxRetries = 3000; // tambah max retries untuk 429 / error lain
  const retryDelay = 10000; // Delay 10detik

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await waitGroqRateLimit();
      console.log(`\nMemproses ${imagePath} dengan... (attempt ${attempt})`);
      const base64Image = await Base64(imagePath);
      const groqResult = await GroqAi.generateImage(base64Image);

      let parsedPrompt = groqResult;
      try {
        const parsed = JSON.parse(groqResult);
        if (parsed.prompt) parsedPrompt = parsed.prompt;
      } catch (e) {}

      console.log(`Selesai proses: ${imagePath}`);
      return {
        filename: path.basename(imagePath),
        groqResult: groqResult,
        prompt: parsedPrompt,
      };
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

// FlowGenerate dipanggil langsung di main/start
// generateImagesFromGroqResults function removed

export async function main() {
  // const keyApp = await checkKeyApp();
  // if (keyApp !== true) {
  //   console.log("Key App tidak valid, keluar dari aplikasi.");
  //   process.exit(1);
  // }

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

    const groqPromise = groqWorker(outputDir);
    const scrollResult = await scrollAll(page, pageCustom, outputDir); //1 kali scroll fullPage
    setDownloaderFinished(true);

    console.log("\n Menutup browser setelah download selesai...");
    await browser.close();

    await groqPromise;

    // // Testing hook: hentikan jika user memilih stop saat testing
    //     await stopTesting('1', testingPilihan)

    console.log(
      `\n Gambar berhasil disimpan di folder: ${path.join(outputDir, "downloads")}`,
    );

    // Generate gambar dengan FlowGenerate
    console.log(
      "\n Mulai generate gambar dengan FlowGenerate berdasarkan hasil Groq...\n",
    );
    await generateImageFlow(outputDir);
    // await stopTesting('2', testingPilihan) // Testing hook: hentikan jika user memilih stop saat testing

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

export async function startGroqNFlowGenerate() {
  try {
    const pathSemuaGambarTanggal = await askGroqNFlowGenerate();

    if (!pathSemuaGambarTanggal || pathSemuaGambarTanggal.length === 0) {
      console.log("Tidak ada downloads Folder yang valid");
      return;
    }

    if (!pathSemuaGambarTanggal) {
      console.error("Path tidak valid, keluar dari aplikasi.");
    }

    for (const fileDownloads of pathSemuaGambarTanggal) {
      console.log(`Memproses folder: ${fileDownloads}`);
      const outputDir = path.dirname(fileDownloads);

      setDownloaderFinished(false);

      // Baca gambar dari folder downloads dan masukkan ke queue
      const imageFiles = await getImage(fileDownloads);
      console.log(`Ditemukan ${imageFiles.length} gambar di ${fileDownloads}`);

      // Tambahkan gambar ke queue dengan full path
      for (const imageFile of imageFiles) {
        const fullImagePath = path.join(fileDownloads, imageFile);
        imageQueue.push(fullImagePath);
      }

      const groqPromise = groqWorker(outputDir);

      setDownloaderFinished(true);
      await groqPromise;

      // // Testing hook: hentikan jika user memilih stop saat testing
      //     await stopTesting('1', testingPilihan)

      console.log(
        `\n Gambar berhasil disimpan di folder: ${path.join(outputDir, "downloads")}`,
      );

      // Generate gambar dengan FlowGenerate
      console.log(
        "\n Mulai generate gambar dengan FlowGenerate berdasarkan hasil Groq...\n",
      );
      await generateImageFlow(outputDir);

      await sortingFile(outputDir);

      console.log(`Selesai memproses folder: ${fileDownloads}\n`);
    }
  } catch (err) {
    console.error("Error di startGeminiNWhisk:", err);
  } finally {
    console.log("Proses selesai, keluar dari aplikasi.");
    process.exit(0);
  }
}

export async function GenerateJustFlow(pathHasilJson) {
  try {
    if (!pathHasilJson || pathHasilJson.length === 0) {
      console.log("Tidak ada hasil.json yang valid");
      return;
    }

    console.log(`Memproses file/folder: ${pathHasilJson}`);

    // Determine whether the provided path is a folder containing hasil.json
    // or a direct path to a hasil.json file. Normalize to outputDir.
    let outputDir = pathHasilJson;

    try {
      if (fs.existsSync(pathHasilJson)) {
        const stat = fs.statSync(pathHasilJson);
        if (stat.isFile()) {
          // If user passed the file path, use its directory
          outputDir = path.dirname(pathHasilJson);
        } else if (stat.isDirectory()) {
          outputDir = pathHasilJson;
        }
      } else {
        // If the exact path doesn't exist, but it's likely a folder,
        // try checking for hasil.json inside it. Otherwise, if it looks
        // like a json file, use its dirname.
        const possibleHasil = path.join(pathHasilJson, "hasil.json");
        if (fs.existsSync(possibleHasil)) {
          outputDir = pathHasilJson;
        } else if (pathHasilJson.toLowerCase().endsWith(".json")) {
          outputDir = path.dirname(pathHasilJson);
        }
      }
    } catch (e) {
      console.error("Error checking path:", e.message);
      return;
    }

    const hasilPath = path.join(outputDir, "hasil.json");
    if (!fs.existsSync(hasilPath)) {
      console.error(`❌ Hasil.json tidak ditemukan di ${hasilPath}`);
      return;
    }

    // Call generateImageFlow with the directory that contains hasil.json
    await generateImageFlow(outputDir);

    console.log(`Selesai memproses: ${hasilPath}\n`);
  } catch (err) {
    console.error("Error di GenerateJustFlow:", err);
  }
}
