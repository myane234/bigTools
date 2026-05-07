import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Fungsi untuk menghitung hash file
function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', reject);

    stream.on('data', chunk => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

// Fungsi utama untuk cek duplikat
async function checkDuplicates(folderPath) {
  const files = fs.readdirSync(folderPath);
  const hashes = {};
  const duplicates = [];

  for (const file of files) {
    const filePath = path.join(folderPath, file);

    // Skip kalau bukan file biasa
    if (!fs.statSync(filePath).isFile()) continue;

    const fileHash = await getFileHash(filePath);

    if (hashes[fileHash]) {
      duplicates.push({ original: hashes[fileHash], duplicate: file });
    } else {
      hashes[fileHash] = file;
    }
  }

  if (duplicates.length > 0) {
    console.log("Duplikat ditemukan:");
    duplicates.forEach(d => {
      console.log(`- ${d.duplicate} duplikat dari ${d.original}`);
    });
  } else {
    console.log("Tidak ada duplikat ditemukan.");
  }
}

// Ganti dengan folder yang mau dicek
const folderToCheck = path.join(path.dirname(fileURLToPath(import.meta.url)), '../downloads');
checkDuplicates(folderToCheck);
