import { browser } from '../index.js';
import fs from 'fs/promises';

const profiles = (await fs.readdir('D:\\chrome-profiles'))
  .filter(name => /^profile\d+$/i.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

async function deleteAllProject() {
  try {
    for (const profile of profiles) {
      const deleteBrowser = new browser();
      try {
        await deleteBrowser.init(profile);

        await deleteBrowser.page.goto('https://labs.google/fx/id/tools/flow', {
          waitUntil: 'networkidle',
        });

        // Tangani popup consent / marketing
        try {
          await deleteBrowser.page.waitForTimeout(1000);
          const researchLabel = deleteBrowser.page.getByText('Saya ingin menerima undangan riset');
          if (await researchLabel.count() > 0) {
            console.log('Detect consent modal — klik riset dan Berikutnya');
            try {
              await researchLabel.first().click().catch(() => {});
              await deleteBrowser.page.waitForTimeout(300);
              const nextBtn = deleteBrowser.page
                .getByRole('button', { name: /Berikutnya|Next|Continue/i })
                .first();
              if (await nextBtn.count() > 0) {
                await nextBtn.click().catch(() => {});
                await deleteBrowser.page.waitForTimeout(800);
              }
            } catch (inner) {
              console.warn('Gagal handle consent modal:', inner.message);
            }
          }
        } catch (e) {
          console.warn('No consent modal detected:', e.message);
        }

        // Tangani popup kebijakan privasi
        try {
          await deleteBrowser.page.waitForTimeout(500);
          const policyHeading = deleteBrowser.page.getByRole('heading', {
            name: /Tinjau kebijakan privasi|Tinjau kebijakan/i,
          });
          if (await policyHeading.count() > 0) {
            console.log('Detect privacy policy modal — scroll sampai Lanjutkan aktif');
            const continueBtn = deleteBrowser.page
              .getByRole('button', { name: /Lanjutkan|Continue|Next/i })
              .first();
            let attempts = 0;
            while (
              await continueBtn.count() > 0 &&
              await continueBtn.isDisabled() &&
              attempts < 12
            ) {
              await deleteBrowser.page.evaluate((headingText) => {
                const headings = Array.from(document.querySelectorAll('h1,h2,h3'));
                const h = headings.find(e => e.textContent && e.textContent.includes(headingText));
                if (!h) return;
                let el = h.parentElement;
                while (el && el !== document.body && el.scrollHeight <= el.clientHeight)
                  el = el.parentElement;
                if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
              }, 'Tinjau kebijakan privasi');
              await deleteBrowser.page.waitForTimeout(700);
              attempts++;
            }
            if (await continueBtn.count() > 0 && !(await continueBtn.isDisabled())) {
              await continueBtn.click().catch(() => {});
              await deleteBrowser.page.waitForTimeout(500);
            } else {
              console.warn('Tombol Lanjutkan tidak aktif setelah scroll');
            }
          }
        } catch (e) {
          console.warn('No policy modal detected:', e.message);
        }

        let scrollAttempts = 0;
        const maxScrollAttempts = 3;

        while (true) {
          const deleteBtnLocator = deleteBrowser.page
            .getByRole('button', { name: /Hapus project|Hapus|Delete project|delete/i })
            .first();

          const btnCount = await deleteBtnLocator.count();
          if (btnCount > 0) {
            const isVisible = await deleteBtnLocator.isVisible();
            if (isVisible) {
              console.log('Tombol ditemukan, menghapus...');
              await deleteBtnLocator.click();
              await deleteBtnLocator
                .waitFor({ state: 'detached', timeout: 5000 })
                .catch(() => {});
              scrollAttempts = 0;
              await deleteBrowser.page.waitForTimeout(500);
              continue;
            }
          }

          if (scrollAttempts < maxScrollAttempts) {
            console.log(`Tidak ditemukan, scroll container (Percobaan: ${scrollAttempts + 1})`);
            const listLocator = deleteBrowser.page.locator('[data-testid="virtuoso-item-list"]');
            const listCount = await listLocator.count();
            if (listCount > 0) {
              await listLocator
                .evaluate((el, delta) => { el.scrollBy(0, delta); }, 600)
                .catch(() => {});
            } else {
              await deleteBrowser.page.mouse.wheel(0, 600).catch(() => {});
            }
            scrollAttempts++;
            await deleteBrowser.page.waitForTimeout(1200);
            continue;
          } else {
            console.log('Sudah scroll 3x dan tidak ada project lagi.');
            break;
          }
        }
      } catch (err) {
        console.error(`❌ Error deleteAllProject pada profile '${profile}': ${err.message}`);
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

await deleteAllProject();
