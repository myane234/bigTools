import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import fs from "fs/promises";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { profiles } from "../FlowGenerate/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Menentukan folder penyimpan profil Chrome
const BASE_PROFILES_DIR = "D:\\chrome-profiles";
const CHROME_PATH = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`;

// Helper untuk membuat delay (ms)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createInterface() {
  return readline.createInterface({ input, output });
}

// Helper untuk mengeksekusi Chrome berdasarkan nama profil
function openChrome(profileName) {
  const profilePath = path.join(BASE_PROFILES_DIR, profileName);
  const command = `${CHROME_PATH} --user-data-dir="${profilePath}"`;

  exec(command, (error) => {
    if (error) {
      console.error(`Gagal membuka Chrome (${profileName}): ${error.message}`);
    }
  });
}

async function BukaProfileChrome(rl) {
  const delayChrome = 2000; // Delay 2 detik antar browser

  try {
    if (profiles.length === 0) {
      console.log("\nTidak ada profil yang tersedia untuk dibuka.");
      return;
    }

    console.log("\n--- BUKA PROFILE CHROME ---");
    console.log("1. Buka 1 Chrome");
    console.log(`2. Buka Semua Chrome (Delay ${delayChrome}ms)`);
    console.log("3. Kembali");

    const option = (await rl.question("\nPilih opsi (1-3): ")).trim();

    if (option === "1") {
      let stayInMenu = true;

      while (stayInMenu) {
        console.log("\n--- Daftar Profile ---");
        profiles.forEach((p, index) => {
          console.log(`${index + 1}. ${p}`);
        });

        const inputIndex = await rl.question(
          `\nPilih nomor profil yang ingin dibuka (1-${profiles.length}): `
        );
        const targetIndex = parseInt(inputIndex, 10) - 1;

        if (
          isNaN(targetIndex) ||
          targetIndex < 0 ||
          targetIndex >= profiles.length
        ) {
          console.log("\nNomor profil tidak valid. Ulangi lagi.");
          continue;
        }

        const selectedProfile = profiles[targetIndex];
        console.log(`\nMembuka Chrome untuk profil: ${selectedProfile}...`);
        openChrome(selectedProfile);

        // Tanya apakah ingin membuka profil lainnya lagi
        const repeat = await rl.question(
          "\nApakah Anda ingin membuka profil lainnya lagi? (y/n): "
        );
        if (repeat.trim().toLowerCase() !== "y") {
          stayInMenu = false;
        }
      }
    } else if (option === "2") {
      console.log(
        `\nMembuka semua profil (${profiles.length} profil) dengan delay ${delayChrome}ms...\n`
      );

      for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        console.log(`[${i + 1}/${profiles.length}] Membuka ${p}...`);
        openChrome(p);

        // Berikan delay jika bukan profil terakhir
        if (i < profiles.length - 1) {
          await sleep(delayChrome);
        }
      }

      console.log("\nSelesai membuka semua profil Chrome.");
    } else if (option === "3") {
      return;
    } else {
      console.log("\nPilihan tidak valid!");
    }
  } catch (err) {
    console.error(`Error at BukaProfileChrome: ${err.message}`);
  }
}

export async function manageProfiles() {
  const rl = createInterface();

  try {
    // Pastikan folder induk profil sudah dibuat
    await fs.mkdir(BASE_PROFILES_DIR, { recursive: true });

    let running = true;

    while (running) {
      console.log("\n--- MANAJEMEN CHROME PROFILE ---");
      console.log("1. Buat Chrome Profile Baru & Buka Browser");
      console.log("2. Hapus Chrome Profile");
      console.log("3. Lihat Daftar Profile");
      console.log("4. Buka Profile Chrome");
      console.log("5. Kembali ke Menu Utama");

      const option = (await rl.question("\nPilih opsi (1-5): ")).trim();

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

        const profilePath = path.join(BASE_PROFILES_DIR, newProfileName);
        await fs.mkdir(profilePath, { recursive: true });

        profiles.push(newProfileName);

        console.log(`\nBerhasil membuat profil baru: ${newProfileName}`);
        console.log(`Path Profil: ${profilePath}`);

        console.log(`\nMembuka Chrome...`);
        openChrome(newProfileName);
      } else if (option === "2") {
        if (profiles.length === 0) {
          console.log("\nTidak ada profil yang tersedia untuk dihapus.");
        } else {
          console.log("\n--- Daftar Profile ---");
          profiles.forEach((p, index) => {
            console.log(`${index + 1}. ${p}`);
          });

          const inputIndex = await rl.question(
            `\nPilih nomor profil yang ingin dihapus (1-${profiles.length}): `
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

            try {
              await fs.rm(profilePath, { recursive: true, force: true });
              console.log(
                `\nBerhasil menghapus ${removed} beserta folder datanya.`
              );
            } catch (err) {
              console.log(
                `\nProfil ${removed} dihapus dari array, namun folder gagal dihapus: ${err.message}`
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
      } else if (option === "4") {
        await BukaProfileChrome(rl);
      } else if (option === "5") {
        running = false;
      } else {
        console.log("\nPilihan tidak valid!");
      }
    }
  } catch (err) {
    console.error("\nTerjadi kesalahan:", err);
  } finally {
    rl.close();
  }
}