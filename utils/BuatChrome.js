import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import fs from "fs/promises";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { profiles } from "../FlowGenerate/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Menentukan folder penyimpan profil Chrome relatif terhadap lokasi file script ini
const BASE_PROFILES_DIR = "D:\\chrome-profiles";

function createInterface() {
  return readline.createInterface({ input, output });
}

export async function manageProfiles() {
  const rl = createInterface();

  try {
    // Pastikan folder induk profil sudah dibuat
    await fs.mkdir(BASE_PROFILES_DIR, { recursive: true });

    console.log("\n--- MANAJEMEN CHROME PROFILE ---");
    console.log("1. Buat Chrome Profile Baru & Buka Browser");
    console.log("2. Hapus Chrome Profile");
    console.log("3. Lihat Daftar Profile");
    console.log("4. Kembali");

    const option = (await rl.question("\nPilih opsi (1-4): ")).trim();

    if (option === "1") {
      let maxNumber = 0;

      profiles.forEach((p) => {
        const match = p.match(/^profile(\d+)$/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      });

      const nextNumber = maxNumber + 1;
      const newProfileName = `profile${nextNumber}`;

      // Menyusun absolute path ke folder profil baru
      const profilePath = path.join(BASE_PROFILES_DIR, newProfileName);
      await fs.mkdir(profilePath, { recursive: true });

      profiles.push(newProfileName);

      console.log(`\nBerhasil membuat profil baru: ${newProfileName}`);
      console.log(`Path Profil: ${profilePath}`);

      // Path standar executable Chrome di Windows
      const chromePath = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;
      const command = `${chromePath} --user-data-dir="${profilePath}"`;

      console.log(`\nMenjalankan perintah:\n${command}`);

      // Membuka Chrome secara otomatis menggunakan profil yang baru dibuat
      exec(command, (error) => {
        if (error) {
          console.error(`Gagal membuka Chrome: ${error.message}`);
        }
      });
    } else if (option === "2") {
      if (profiles.length === 0) {
        console.log("\nTidak ada profil yang tersedia untuk dihapus.");
      } else {
        console.log("\n--- Daftar Profile ---");
        profiles.forEach((p, index) => {
          console.log(`${index + 1}. ${p}`);
        });

        const inputIndex = await rl.question(
          `\nPilih nomor profil yang ingin dihapus (1-${profiles.length}): `,
        );
        const targetIndex = parseInt(inputIndex, 10) - 1;

        if (
          isNaN(targetIndex) ||
          targetIndex < 0 ||
          targetIndex >= profiles.length
        ) {
          console.log("\nNomor profil tidak valid!");
        } else {
          const [removed] = profiles.splice(targetIndex, 1);
          const profilePath = path.join(BASE_PROFILES_DIR, removed);

          // Hapus folder profil fisik beserta falls/cachenya
          try {
            await fs.rm(profilePath, { recursive: true, force: true });
            console.log(
              `\nBerhasil menghapus ${removed} beserta folder datanya.`,
            );
          } catch (err) {
            console.log(
              `\nProfil ${removed} dihapus dari array, namun folder gagal dihapus: ${err.message}`,
            );
          }
        }
      }
    } else if (option === "3") {
      console.log("\n--- Daftar Profile Saat Ini ---");
      if (profiles.length === 0) {
        console.log("Belum ada profil.");
      } else {
        profiles.forEach((p, i) => {
          const profilePath = path.join(BASE_PROFILES_DIR, p);
          console.log(`${i + 1}. ${p} -> (${profilePath})`);
        });
      }
    }
  } catch (err) {
    console.error("\nTerjadi kesalahan:", err);
  } finally {
    rl.close();
  }
}
