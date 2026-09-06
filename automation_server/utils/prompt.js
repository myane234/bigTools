import chalk from "chalk";
import fs from "fs/promises";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptJson = path.join(__dirname, "..", "data", "prompt.json");

function createInterface() {
  return readline.createInterface({ input, output });
}

export async function CrudPrompt() {
  const rl = createInterface();

  try {
    let prompts = [];
    try {
      const rawData = await fs.readFile(promptJson, "utf-8");
      prompts = JSON.parse(rawData);
      if (!Array.isArray(prompts)) prompts = [];
    } catch (e) {
      await fs.writeFile(promptJson, JSON.stringify([], null, 2));
    }

    console.log(chalk.cyan("\n--- Menu CRUD Prompt ---"));
    console.log("1. Lihat Daftar Prompt");
    console.log("2. Tambah Prompt Baru");
    console.log("3. Hapus Prompt");
    console.log("4. Kembali ke Menu Utama");

    const action = (await rl.question("\nPilih opsi (1-4): ")).trim();

    if (action === "1") {
      console.log(chalk.cyan("\n--- Daftar Prompt Saat Ini ---"));
      if (prompts.length === 0) {
        console.log(chalk.yellow("Belum ada prompt tersedia."));
      } else {
        console.table(
          prompts.map((p, index) => ({
            No: index + 1,
            Nama: p.name,
            Prompt:
              p.prompt.length > 50
                ? p.prompt.substring(0, 50) + "..."
                : p.prompt,
          })),
        );
      }
    } else if (action === "2") {
      const name = await rl.question("Masukkan Nama Prompt: ");
      const promptText = await rl.question("Tuliskan isi prompt: ");

      prompts.push({
        id: Date.now().toString(),
        name: name.trim(),
        prompt: promptText.trim(),
      });

      await fs.writeFile(promptJson, JSON.stringify(prompts, null, 2));
      console.log(
        chalk.green("\nBerhasil menambahkan prompt baru secara otomatis!"),
      );
    } else if (action === "3") {
      if (prompts.length === 0) {
        console.log(chalk.yellow("Belum ada prompt untuk dihapus."));
      } else {
        console.log(chalk.cyan("\n--- Pilih Prompt yang Ingin Dihapus ---"));
        prompts.forEach((p, index) => {
          console.log(`${index + 1}. ${p.name}`);
        });

        const selectedIndexStr = await rl.question(
          `Pilih nomor (1-${prompts.length}): `,
        );
        const selectedIndex = parseInt(selectedIndexStr, 10) - 1;

        if (
          isNaN(selectedIndex) ||
          selectedIndex < 0 ||
          selectedIndex >= prompts.length
        ) {
          console.log(chalk.red("Pilihan tidak valid."));
        } else {
          prompts.splice(selectedIndex, 1);
          await fs.writeFile(promptJson, JSON.stringify(prompts, null, 2));
          console.log(chalk.red("Prompt berhasil dihapus!"));
        }
      }
    }
  } catch (err) {
    console.error(chalk.red("Terjadi kesalahan:"), err);
  } finally {
    rl.close();
  }
}

export async function promptGroqSelector() {
  try {
    const rawData = await fs.readFile(promptJson, "utf-8");
    const prompts = JSON.parse(rawData);

    if (!Array.isArray(prompts) || prompts.length === 0) {
      console.log(
        chalk.red("Prompt kosong! Silakan buat dulu via menu CRUD Prompt."),
      );
      return null;
    }

    prompts.forEach((prompt, index) => {
      console.log(`${index + 1}. ${prompt.name}`);
    });

    const rl = createInterface();
    const choice = await rl.question(`Pilih prompt (1-${prompts.length}): `);
    rl.close();
    const selectedIndex = parseInt(choice, 10) - 1;

    if (
      Number.isNaN(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= prompts.length
    ) {
      console.log(chalk.red("Pilihan prompt tidak valid."));
      return null;
    }

    return prompts[selectedIndex].prompt;
  } catch (err) {
    console.error(chalk.red("Gagal memilih prompt:"), err.message);
    return null;
  }
}
