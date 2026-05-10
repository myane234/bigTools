import path from 'path'
import fs from 'fs'
import { createCursor } from 'ghost-cursor';

const delay = ms => (new Promise(resolve => setTimeout(resolve, ms)))

async function openUploadMenu(page, cursor, options = {}) {
  const { timeout = 10000, waitAfter = 500 } = options;
 
  const selector = 'button[aria-controls="upload-file-menu"]';
 
  await page.waitForSelector(selector, { timeout, visible: true });
  await cursor.click(selector, { hesitate: 80, waitForClick: 50 });
  await delay(waitAfter)
 
  console.log('[uploadMenu] Menu upload berhasil dibuka');
}

/**
 * Step 2: Click tombol "Upload files" di dalam menu,
 * lalu handle file chooser dialog
 * @param {string|string[]} filePaths - path file yang akan diupload
 */
async function clickUploadFiles(page, cursor, filePaths, options = {}) {
  const { timeout = 10000, waitAfter = 1000 } = options;
 
  const selector = 'button[data-test-id="local-images-files-uploader-button"]';
 
  await page.waitForSelector(selector, { timeout, visible: true });
 
  // Tangkap file chooser dialog SEBELUM click
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser({ timeout }),
    cursor.click(selector, { hesitate: 100, waitForClick: 60 }),
  ]);
 
  const files = Array.isArray(filePaths) ? filePaths : [filePaths];
  const absolutePaths = files.map(f => path.resolve(f));
 
  await fileChooser.accept(absolutePaths);
  await delay(waitAfter)
 
  console.log(`[uploadFiles] File dipilih: ${absolutePaths.join(', ')}`);
}

/**
 * Fungsi utama: gabungkan step 1 + step 2 jadi satu flow
 * @param {string|string[]} filePaths - path file yang akan diupload
 */
export async function uploadFile(page, filePaths, options = {}) {
  const cursor = createCursor(page);
  await openUploadMenu(page, cursor, options);
  await clickUploadFiles(page, cursor, filePaths, options);
  console.log('[uploadFile] Upload flow selesai');
  return true;
}

/**
 * Ambil foto dari folder dengan limit jumlah
 * @param {string} outputDir - folder tempat gambar tersimpan
 * @param {number} limit - jumlah maksimal gambar yang diambil
 * @returns {Promise<string[]>} array path file gambar
 */
export async function getPhotos(outputDir, limit = null) {
    try {
        const files = await fs.promises.readdir(outputDir);
        const validPhotos = [];
        for (const file of files) {
            const filePath = path.join(outputDir, file);
            const stats = await fs.promises.stat(filePath);
            if (stats.size > 0) {
                validPhotos.push(filePath);
            }
        }
        // Batasi jumlah hasil jika parameter limit diberikan
        if (limit && limit > 0) {
            return validPhotos.slice(0, limit);
        }
        return validPhotos;
    } catch(err) {
        console.error(err);
        return [];
    }
}

/**
 * Hapus file gambar setelah selesai digunakan
 * @param {string[]} filePaths - array path file yang akan dihapus
 */
export async function deletePhotos(filePaths) {
    try {
        for (const filePath of filePaths) {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                console.log(`[deletePhotos] File dihapus: ${filePath}`);
            }
        }
    } catch(err) {
        console.error(`[deletePhotos] Error:`, err);
    }
}