import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { main } from "./readAllOfImage.js";
import { candidatePaths } from "./readAllOfImage.js";

export async function ask(message, type = "input", extra = {}) {
  try {
    const answer = await inquirer.prompt([
      {
        type,
        name: "value",
        message,
        ...extra,
      },
    ]);

    return answer.value;
  } catch (err) {
    console.error(`Ask: ${err}`);
    throw err;
  }
}

export async function askAwal() {
  try {
    const URL = await ask("Masukkan URL Adobe untuk:");

    const pageCustom = await ask(
      "Masukkan Page yang diinginkan (default 1):",
      "input",
      {
        default: 1,
        validate: (val) => (isNaN(val) ? "Harus angka woii" : true),
        filter: (val) => Number(val),
      },
    );

    const { folderList, outputDir } = await main();

    console.log(folderList);

    return { URL, pageCustom, outputDir };
  } catch (err) {
    console.error(`askAwal: ${err}`);
  }
}

export async function askGroqNFlowGenerate() {
  console.log("DEBUG candidatePaths:", candidatePaths);
  try {
    // 1. ambil folder tanggal
    let folders = await fs.promises.readdir(candidatePaths);

    // 2. hanya folder format tanggal
    folders = folders.filter((f) => f.includes(";"));

    // 3. sort terbaru
    folders.sort((a, b) => {
      const parse = (n) => {
        const [d, m, y] = n.split(";").map(Number);
        return new Date(y, m - 1, d);
      };
      return parse(b) - parse(a);
    });

    // 4. ambil 20 terakhir
    const latest20 = folders.slice(0, 20);

    // 5. TAMPILKAN KE USER
    latest20.forEach((f, i) => {
      console.log(`${i + 1}. ${f}`);
    });

    // 6. user pilih tanggal
    const userInput = await ask(`Pilih folder (1-${latest20.length}):`);

    const index = parseInt(userInput, 10) - 1;

    if (index < 0 || index >= latest20.length) {
      throw new Error("Input user di luar range");
    }

    const selected = latest20[index];

    if (!selected) {
      throw new Error("Folder tidak ditemukan (selected undefined)");
    }

    // 7. masuk folder tanggal
    const pathTanggal = path.join(candidatePaths, selected);
    const isiTanggal = await fs.promises.readdir(pathTanggal);

    // 8. STRICT FILTER: hanya folder yang punya downloads
    const hasil = [];

    for (const folder of isiTanggal) {
      const fullPath = path.join(pathTanggal, folder);

      const stat = await fs.promises.stat(fullPath);
      if (!stat.isDirectory()) continue;

      const sub = await fs.promises.readdir(fullPath);

      // 🔥 RULE KETAT: harus ada downloads DAN tidak boleh ada requirement lain
      if (sub.length === 1 && sub.includes("downloads")) {
        hasil.push(path.join(fullPath, "downloads"));
      }
    }

    return hasil;
  } catch (err) {
    console.error(`askGeminiNWhisk: ${err}`);
  }
}
