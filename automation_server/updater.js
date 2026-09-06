/**
 * updater.js (ESM)
 * Auto-updater tanpa Git: download zipball dari private GitHub repository.
 */

import https from "https";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_DIR = path.resolve(__dirname, "..");

// ================================================================
// KONFIGURASI
// ================================================================
const CONFIG = {
  GITHUB_OWNER: "myane234",
  GITHUB_REPO:  "bigTools",
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
  BRANCH:       process.env.GITHUB_BRANCH || "main",

  // File yang TIDAK akan di-overwrite saat update
  PROTECTED: [
    ".env",
    ".env.local",
    "updater.js",
    ".version",
    "AdobeScraper.bat"
  ],
};
// ================================================================

const VERSION_FILE = path.join(PROJECT_DIR, ".version");
const TEMP_DIR     = path.join(os.tmpdir(), "automation-update-temp");

function getSavedSHA() {
  try {
    return fs.readFileSync(VERSION_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        "User-Agent":    "auto-updater",
        Authorization:   `token ${CONFIG.GITHUB_TOKEN}`,
        Accept:          "application/vnd.github+json",
      },
    };

    const request = (target) => {
      https.get(target, opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return request(res.headers.location);
        }
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ statusCode: res.statusCode, body: data }));
      }).on("error", reject);
    };

    request(url);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        "User-Agent":  "auto-updater",
        Authorization: `token ${CONFIG.GITHUB_TOKEN}`,
        Accept:        "application/vnd.github+json",
      },
    };

    const follow = (target) => {
      https.get(target, opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download gagal: HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      }).on("error", reject);
    };

    follow(url);
  });
}

function extractZip(zipPath, destDir) {
  execSync(
    `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
    { stdio: "inherit" }
  );
}

function copyRecursive(src, dest, protectedList) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    const isProtected = protectedList.some(
      (p) => entry.name === p || entry.name === path.basename(p)
    );

    if (isProtected) {
      console.log(`  [SKIP] ${entry.name} (protected)`);
      continue;
    }

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyRecursive(srcPath, destPath, protectedList);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  [OK]   ${entry.name}`);
    }
  }
}

export async function checkAndUpdate() {
  if (!CONFIG.GITHUB_TOKEN.trim()) {
    console.warn("[Updater] GITHUB_TOKEN belum dikonfigurasi. Skip update.");
    return false;
  }

  const savedSHA = getSavedSHA();
  console.log(`\n[Updater] SHA tersimpan : ${savedSHA ? savedSHA.slice(0, 7) : "(belum ada)"}`);
  console.log(`[Updater] Mengecek commit terbaru di branch "${CONFIG.BRANCH}"...`);

  let latestSHA;
  try {
    const url = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/commits/${CONFIG.BRANCH}`;
    const res = await httpsGet(url);

    if (res.statusCode === 401) {
      console.warn("[Updater] Token tidak valid atau expired. Skip update.");
      return false;
    }
    if (res.statusCode === 404) {
      console.warn("[Updater] Repo atau branch tidak ditemukan. Skip update.");
      return false;
    }

    const data = JSON.parse(res.body);
    latestSHA  = data.sha;
  } catch (err) {
    console.warn("[Updater] Gagal cek update:", err.message);
    return false;
  }

  console.log(`[Updater] SHA terbaru   : ${latestSHA.slice(0, 7)}`);

  if (latestSHA === savedSHA) {
    console.log("[Updater] Aplikasi sudah up-to-date!\n");
    return false;
  }

  const from = savedSHA ? savedSHA.slice(0, 7) : "fresh install";
  console.log(`\n[Updater] Ada update! ${from} → ${latestSHA.slice(0, 7)}`);
  console.log("[Updater] Mengunduh file terbaru...");

  const zipUrl = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/zipball/${CONFIG.BRANCH}`;

  if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const zipPath = path.join(TEMP_DIR, "update.zip");

  try {
    await downloadFile(zipUrl, zipPath);
  } catch (err) {
    console.error("[Updater] Gagal download:", err.message);
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    return false;
  }

  console.log("[Updater] Mengekstrak file...");
  extractZip(zipPath, TEMP_DIR);

  // GitHub zipball punya wrapper folder (owner-repo-sha/)
  const extractedItems  = fs.readdirSync(TEMP_DIR).filter((f) => f !== "update.zip");
  const extractedFolder = path.join(TEMP_DIR, extractedItems[0]);

  console.log("[Updater] Menyalin file baru (skip file protected)...");
  copyRecursive(extractedFolder, PROJECT_DIR, CONFIG.PROTECTED);

  // Simpan SHA terbaru
  fs.writeFileSync(VERSION_FILE, latestSHA, "utf8");

  // Bersihkan temp
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  console.log(`\n[Updater] ✅ Update selesai! (${latestSHA.slice(0, 7)})\n`);
  return true;
}

// Entry point kalau dijalankan langsung: node updater.js
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  checkAndUpdate()
    .then((updated) => {
      process.exit(updated ? 2 : 0);
    })
    .catch((err) => {
      console.error("[Updater] Error tidak terduga:", err);
      process.exit(1);
    });
}