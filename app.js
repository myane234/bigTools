import inquirer from "inquirer";
import chalk from "chalk";
import { spawn } from "child_process";
import { env } from "./automation_server/utils/CliAsk/inputEnv.js";
import { main, startGroqNFlowGenerate, GenerateJustFlow } from "./automation_server/index.js";
import { setPrompt } from "./automation_server/utils/groq/getPromptvalue.js";
import GroqAi from "./automation_server/utils/groq/groqAi.js";
import { start } from "repl";

const promptMap = {
  1: `
Analyze the provided image. Your task is to generate metadata for a new Vectors artwork inspired by the image.
The output MUST be a valid JSON object with: "prompt".

1.  **prompt**: A highly detailed and descriptive prompt for generating the new Vector. This prompt should be inspired by the subject and composition of the provided image, but reimagined in a vector style. The prompt must describe a vector/illustration, not a photo. It should cover the main subject, background elements, composition, color palette, lighting, and overall mood. Aim for a rich, multi-sentence description. Example: "A detailed flat vector illustration of a joyful golden retriever puppy sitting on a lush green lawn. The puppy has a friendly expression, with its tongue slightly out. The background features a clear blue sky with a few fluffy white clouds. The style is clean and modern, with bold outlines and a vibrant color palette."

Example output for a photo of a real dog:
{
  "prompt": "A detailed flat vector illustration of a joyful golden retriever puppy sitting on a lush green lawn. The puppy has a friendly expression, with its tongue slightly out. The background features a clear blue sky with a few fluffy white clouds. The style is clean and modern, with bold outlines and a vibrant color palette.",
}

Do not include any other text, comments, or markdown formatting like \`\`\`json. The output must be ONLY the JSON object.
  `,
  2: `
Analyze the provided image. Your task is to generate metadata for a new Vectors artwork inspired by the image.
The output MUST be a valid JSON object with: "prompt".

1. prompt: A highly detailed prompt for generating a **vector silhouette illustration** inspired by the main subject of the image but creatively reimagined. The design must include **ONLY the main subject as a solid black silhouette**. Remove all decorative elements, props, and background objects from the original image. Use **pure black silhouette shapes with no internal details, shading, or textures**, placed on a **plain white background**. Focus only on the primary object and describe its pose or shape clearly in a clean minimal vector style.

Example output:
{
  "prompt": "A minimal flat vector silhouette of a sitting dog, shown as a solid pure black shape with no internal details or textures. The dog is centered in the composition with a clean and balanced pose. The design uses strong contrast with a pure white background, creating a simple modern black and white silhouette vector style."
}

Do not include any other text. Output ONLY the JSON object. Avoid making it identical to the original image; keep similarity around 80% while creatively reimagining the subject.`,
};

export async function promptGroqSelector() {
  console.log(`
        1.Normal prompt
        2.Force Siluet
        `);
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "Pilih prompt:",
      choices: [
        { name: "Normal", value: "1" },
        { name: "Force Silhouette", value: "2" },
      ],
    },
  ]);

  return promptMap[choice];
}

async function askGeneratejustFlow() {
  console.log(chalk.yellow("\n⚠️  Generate Just Flow akan menghasilkan flow tanpa gambar. Pastikan untuk menggunakan prompt yang sesuai untuk hasil terbaik.\n"));
  const PathJson = await inquirer.prompt([
    {
      type: "input",
      name: "path",
      message: "Masukkan path folder output yang berisi hasil.json (contoh: ./output):",
      validate: function (input) {
        if (!input.trim()) {
          return "Path tidak boleh kosong!";
        }
        return true;
      },
    },
  ]);

  return PathJson.path;
}

async function mainMenu() {
  console.clear();
  checkEnv();
  console.log(
    chalk.cyan.bold(`
 Automation Tool Faruq 06
=============================
`),
  );
  console.log("[1] Input API");
  console.log("[2] Start Automation");
  console.log("[3] Start Groq NFlowGenerate");
  console.log("[4] Test API Keys");
  console.log("[5] Generate Just Flow");
  console.log("[0] Exit\n");
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "Pilih mode:",
      choices: [
        { name: "Input API", value: "1" },
        { name: "Start Automation", value: "2" },
        { name: "Start Groq NFlowGenerate", value: "3" },
        { name: "Test API Keys", value: "4" },
        { name: "Generate Just Flow", value: "5" },
        { name: "Exit", value: "0" },
      ],
    },
  ]);

  switch (choice) {
    case "1":
      await env();
      break;
    case "2":
      const prompt1 = await promptGroqSelector(); // ambil 1x
      setPrompt(prompt1);
      await main();
      break;
    case "3":
      const prompt2 = await promptGroqSelector();
      setPrompt(prompt2);
      await startGroqNFlowGenerate();
      break;
    case "4":
      await GroqAi.testApi();
      break;
    case "5":
        const pathHasilJson = await askGeneratejustFlow();
      await GenerateJustFlow(pathHasilJson);
      break;
    case "0":
      console.log(chalk.red("\nBye bro 👋\n"));
      process.exit(0);
    default:
      console.log(chalk.red("\nPilihan tidak valid!\n"));
  }

  await pause();
  await mainMenu();
}

async function pause() {
  await inquirer.prompt([
    {
      type: "input",
      name: "enter",
      message: "Tekan Enter untuk kembali ke menu...",
    },
  ]);
}

function checkEnv() {
  const groqKeys = process.env.GROQ_API_KEYS;

  if (!groqKeys?.trim()) {
    console.log(chalk.red("\nENV belum lengkap!"));
    console.log(
      chalk.red(`Input API terlebih dahulu melalui menu [1]`),
    );
    return false;
  }
}

function runScript(command, args = []) {
  return new Promise((resolve) => {
    console.log(chalk.gray(`\nMenjalankan: ${command} ${args.join(" ")}\n`));
    const child = spawn(command, args, { stdio: "inherit", shell: true });
    child.on("close", resolve);
  });
}

mainMenu();
