import { browser } from '../index.js';
import fs from 'fs/promises';

const profiles = await fs.readdir("D:\\chrome-profiles");

async function deleteAllProject() {
  try {
    for (const profile of profiles) {
      const deleteBrowser = new browser();
      try {
        await deleteBrowser.init(profile);

        await deleteBrowser.page.goto('https://labs.google/fx/id/tools/flow', { waitUntil: 'networkidle' });
        let scrollAttempts = 0;
        const maxScrollAttempts = 3; // Batas percobaan scroll

                while (true) {
                    // Cari tombol delete — terima beberapa variasi teks (ID/EN)
                    const deleteBtnLocator = deleteBrowser.page.getByRole('button', { name: /Hapus project|Hapus|Delete project|delete/i }).first();

                    // Jika ada tombol yang bisa di-click
                    const btnCount = await deleteBtnLocator.count();
                    if (btnCount > 0) {
                        const isVisible = await deleteBtnLocator.isVisible();
                        if (isVisible) {
                            console.log("Tombol ditemukan, menghapus...");
                            await deleteBtnLocator.click();

                            // (Opsional) Jika ada konfirmasi, uncomment baris di bawah:
                            // await deleteBrowser.page.getByRole('button', { name: /Yes|Ya/i }).click();

                            // Tunggu sampai elemen benar-benar hilang (tapi jangan tunggu selamanya)
                            await deleteBtnLocator.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

                            // Reset scroll attempts karena kita berhasil menemukan tombol baru
                            scrollAttempts = 0;

                            // Kasih jeda sebentar agar list terupdate
                            await deleteBrowser.page.waitForTimeout(500);
                            continue; // periksa lagi dari atas
                        }
                    }

                    // Jika tidak ada tombol visible, coba scroll container virtualized list
                    if (scrollAttempts < maxScrollAttempts) {
                        console.log(`Tidak ditemukan, scroll container (Percobaan: ${scrollAttempts + 1})`);

                        const listLocator = deleteBrowser.page.locator('[data-testid="virtuoso-item-list"]');
                        const listCount = await listLocator.count();

                        if (listCount > 0) {
                            // Scroll container 600px
                            await listLocator.evaluate((el, delta) => { el.scrollBy(0, delta); }, 600).catch(() => {});
                        } else {
                            // Fallback: scroll whole page
                            await deleteBrowser.page.mouse.wheel(0, 600).catch(() => {});
                        }

                        scrollAttempts++;
                        // Tunggu supaya item baru ter-load
                        await deleteBrowser.page.waitForTimeout(1200);

                        // Cek apakah setelah scroll muncul tombol baru, loop akan ulang
                        continue;
                    } else {
                        // Kalau sudah 3x scroll dan tetap gak ketemu, berhenti
                        console.log("Sudah scroll 3x dan tidak ada project lagi.");
                        break;
                    }
                }

      } catch (err) {
        console.error(`❌ Error saat deleteAllProject pada profile '${profile}': ${err.message}`);
      } finally {
        try {
          await deleteBrowser.close();
        } catch (closeErr) {
          console.error(`❌ Gagal menutup browser profile '${profile}': ${closeErr.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`❌ Error saat deleteAllProject: ${err.message}`);
  }
}

// Jalankan fungsi ketika file dieksekusi langsung
await deleteAllProject();