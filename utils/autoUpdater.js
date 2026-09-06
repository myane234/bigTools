import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_DIR = path.resolve(__dirname, '..');
const TARGET_FILES = [
  path.join(PROJECT_DIR, 'FlowGenerate', 'utils', 'automationGenerate.js'),
  path.join(PROJECT_DIR, 'FlowGenerate', 'index.js'),
];

// Golang API authorize endpoint
const AUTHORIZE_API = process.env.AUTHORIZE_API_URL || 'https://yagitudehhguajuga.faaruq.com/client/authorize';

/**
 * Mendapatkan nama PC / Hostname
 */
export function getPcName() {
  return process.env.PC_NAME || os.hostname() || 'UNKNOWN-PC';
}

/**
 * Otorisasi client ke API Golang: https://yagitudehhguajuga.faaruq.com/client/authorize
 */
export async function authorizeWithGolangApi() {
  const pcName = getPcName();
  try {
    const res = await fetch(AUTHORIZE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pcName,
        hostname: os.hostname(),
        ip: getLocalIp(),
        timestamp: new Date().toISOString(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`🌐 [Golang API] Authorized '${pcName}' | SkipObfuscate=${data.skipObfuscate}, WipeCode=${data.wipeCode}`);
      return data;
    } else {
      console.warn(`⚠️ [Golang API] HTTP status ${res.status} dari ${AUTHORIZE_API}`);
    }
  } catch (err) {
    console.warn(`⚠️ [Golang API] Gagal terhubung ke ${AUTHORIZE_API}: ${err.message}. Menggunakan pengaturan default.`);
  }

  return { skipObfuscate: false, wipeCode: false };
}

/**
 * Pengelolaan Obfuscation & Clean Wipe Code
 */
export async function processCodeSecurity() {
  const { skipObfuscate, wipeCode } = await authorizeWithGolangApi();
  const pcName = getPcName();

  for (const filePath of TARGET_FILES) {
    if (!fs.existsSync(filePath)) continue;

    const backupPath = `${filePath}.backup`;

    // Simpan backup mentah jika belum ada
    if (!fs.existsSync(backupPath)) {
      const currentContent = fs.readFileSync(filePath, 'utf-8');
      if (currentContent.length > 50) {
        fs.writeFileSync(backupPath, currentContent, 'utf-8');
      }
    }

    // 1. SKENARIO HAPUS ISI FILE CODE FULL BERSIH (Remote Clean Wipe)
    if (wipeCode) {
      console.log(`🚨 [Wipe] PERINTAH HAPUS CODE DITERIMA! Hapus isi file ${path.basename(filePath)} FULL BERSIH.`);
      fs.writeFileSync(filePath, '', 'utf-8'); // Kosongkan file bersih
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath); // Hapus backup lokal
      continue;
    }

    // 2. SKENARIO SKIP OBFUSCATE (Restorasi Kode Mentah)
    if (skipObfuscate) {
      console.log(`🔓 [Obfuscate] PC '${pcName}' diatur SKIP OBFUSCATE. Menggunakan kode mentah...`);
      if (fs.existsSync(backupPath)) {
        const rawContent = fs.readFileSync(backupPath, 'utf-8');
        fs.writeFileSync(filePath, rawContent, 'utf-8');
      }
      continue;
    }

    // 3. SKENARIO OBFUSCATE KODE RUNNER (Ringan & Cepat, Tidak Lemot)
    console.log(`🔒 [Obfuscate] Meng-obfuscate kode runner (${path.basename(filePath)}) opsi cepat/ringan...`);
    try {
      const sourceCode = fs.existsSync(backupPath)
        ? fs.readFileSync(backupPath, 'utf-8')
        : fs.readFileSync(filePath, 'utf-8');

      // Proteksi file kosong agar tidak error
      if (!sourceCode.trim()) {
        console.warn(`⚠️ [Obfuscate] File ${path.basename(filePath)} kosong, melewatinya...`);
        continue;
      }

      const obfuscatedResult = JavaScriptObfuscator.obfuscate(sourceCode, {
        compact: true,
        controlFlowFlattening: false, // OFF agar runtime TIDAK LEMOT
        deadCodeInjection: false,     // OFF agar file TIDAK BENGKAK
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.5,
        splitStrings: false,
        disableConsoleOutput: false,
      });

      fs.writeFileSync(filePath, obfuscatedResult.getObfuscatedCode(), 'utf-8');
      console.log(`✅ [Obfuscate] ${path.basename(filePath)} selesai di-obfuscate (Runtime super cepat).`);
    } catch (err) {
      console.error(`❌ [Obfuscate] Gagal meng-obfuscate ${path.basename(filePath)}:`, err.message);
    }
  }
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Jika dijalankan langsung: node utils/autoUpdater.js
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  processCodeSecurity().then(() => console.log('✅ Security & Obfuscation Sync Selesai.'));
}
