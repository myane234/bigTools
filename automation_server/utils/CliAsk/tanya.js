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