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

        // Tangani popup awal (consent/marketing) jika muncul — gunakan teks, bukan class
        try {
          await deleteBrowser.page.waitForTimeout(1000);
          const researchLabel = deleteBrowser.page.getByText('Saya ingin menerima undangan riset');
          if (await researchLabel.count() > 0) {
            console.log('Detect consent modal — mencoba cek opsi riset dan klik Berikutnya');
            try {
              await researchLabel.first().click().catch(() => {});
              await deleteBrowser.page.waitForTimeout(300);

              const nextBtn = deleteBrowser.page.getByRole('button', { name: /Berikutnya|Next|Continue/i }).first();
              if (await nextBtn.count() > 0) {
                await nextBtn.click().catch(() => {});
                await deleteBrowser.page.waitForTimeout(800);
              }
            } catch (inner) {
              console.warn('Gagal handle consent modal:', inner.message);
            }
          }
        } catch (e) {
          console.warn('No consent modal detected or error:', e.message);
        }

        // Tangani popup kebijakan privasi — deteksi via heading text dan scroll ancestor
        try {
          await deleteBrowser.page.waitForTimeout(500);
          const policyHeading = deleteBrowser.page.getByRole('heading', { name: /Tinjau kebijakan privasi|Tinjau kebijakan/i });
          if (await policyHeading.count() > 0) {
            console.log('Detect privacy policy modal — scroll sampai Lanjutkan aktif');

            const continueBtn = deleteBrowser.page.getByRole('button', { name: /Lanjutkan|Continue|Next/i }).first();

            let attempts = 0;
            while (await continueBtn.count() > 0 && await continueBtn.isDisabled() && attempts < 12) {
              await deleteBrowser.page.evaluate((headingText) => {
                const headings = Array.from(document.querySelectorAll('h1,h2,h3'));
                const h = headings.find(e => e.textContent && e.textContent.includes(headingText));
                if (!h) return;
                let el = h.parentElement;
                while (el && el !== document.body && el.scrollHeight <= el.clientHeight) el = el.parentElement;
                if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
              }, 'Tinjau kebijakan privasi');

              await deleteBrowser.page.waitForTimeout(700);
              attempts++;
            }

            if (await continueBtn.count() > 0 && !(await continueBtn.isDisabled())) {
              await continueBtn.click().catch(() => {});
              await deleteBrowser.page.waitForTimeout(500);
            } else {
              console.warn('Tombol Lanjutkan tidak aktif setelah scroll/fallback');
            }
          }
        } catch (e) {
          console.warn('No policy modal detected or error:', e.message);
        }

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