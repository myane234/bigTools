import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { ask } from './tanya.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// daftar path fallback
export const candidatePaths = "D:\\SemuaGambar";


// helper format tanggal: 23;03;2025
function getTodayFolderName() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    return `${day};${month};${year}`;
}

// cari base path yang valid
export async function getValidBasePath() {
    const basePath = candidatePaths;
        try {
            if(!fs.existsSync(basePath)) {
                fs.mkdir(basePath, { recursive: true }, (err) => {
                    if (err) {
                        console.error(`Gagal membuat path: ${basePath} - ${err.message}`);
                    } else {
                        console.log(`Berhasil membuat path: ${basePath}`);
                    }
                });
            }
            await fs.promises.access(basePath, fs.constants.W_OK);
            console.log(`Menggunakan path: ${basePath}`);
            return basePath;
        } catch (err) {
            console.log(`Path gagal dipakai: ${basePath}`);
        }
    }



// baca isi folder dari base path yang valid
async function readFolder(basePath) {
    try {
        return await fs.promises.readdir(basePath);
    } catch (err) {
        console.error(`Error at readFolder: ${err.message}`);
        return [];
    }
}

export async function main() {
    try {
        // cari path aktif
        const allOfImagePath = await getValidBasePath();

        const folderList = await readFolder(allOfImagePath);

        const todayFolderName = getTodayFolderName();
        let tanggalDir = path.join(allOfImagePath, todayFolderName);

        // CEK apakah folder tanggal sudah ada
        if (folderList.includes(todayFolderName)) {
            console.log(`Folder tanggal sudah ada: ${todayFolderName}`);
        } else {
            // kalau belum ada → buat
            await fs.promises.mkdir(tanggalDir, { recursive: true });
            console.log(`Berhasil membuat folder tanggal: ${todayFolderName}`);
        }

        const timestamp = Date.now();

        const folderInput = await ask(
            "Masukkan nama folder baru:",
            "input",
            {
                validate: (val) =>
                    val.trim() === "" ? "Tidak boleh kosong" : true
            }
        );

        const folderFixName = `${folderInput.trim()}-${timestamp}`;

        // folder final di dalam folder tanggal
        const outputDir = path.join(tanggalDir, folderFixName);

        await fs.promises.mkdir(outputDir, { recursive: true });

        console.log(`Berhasil membuat folder baru: ${folderFixName}`);

        return {
            basePath: allOfImagePath,
            folderList,
            tanggalDir,
            outputDir
        };

    } catch (err) {
        console.error(`Error at main: ${err.message}`);
    }
}