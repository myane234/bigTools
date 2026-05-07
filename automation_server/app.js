import inquirer from "inquirer";
import chalk from "chalk";
import { spawn } from "child_process";
import { env } from "./utils/CliAsk/inputEnv.js";
import { main } from "./index.js";
import { setPrompt } from "./utils/gemini/getPromptvalue.js";
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

export async function promptGeminiSelector() {
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

async function mainMenu() {
  console.clear();
  checkEnv();
  console.log(
    chalk.cyan.bold(`
 Automation Tool Faruq 06
=============================
`),
  );
  console.log("[1] Input API & Token");
  console.log("[2] Test Token");
  console.log("[3] Start Automation");
  console.log("[4] Start Gemini NWhisk");
  console.log("[0] Exit\n");
  const { choice } = await inquirer.prompt([
    {
      type: "list",
      name: "choice",
      message: "Pilih mode:",
      choices: [
        { name: "Input API & Token", value: "1" },
        { name: "Test Token", value: "2" },
        { name: "Start Automation", value: "3" },
        { name: "Exit", value: "0" },
      ],
    },
  ]);

  switch (choice) {
    case "1":
      await env();
      break;
    case "2":
      await runScript("node", ["scriptTest/testBearer.js"]);
      break;
    case "3":
      const prompt1 = await promptGeminiSelector(); // ambil 1x
      setPrompt(prompt1);
      await main();
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
  const gemini = process.env.GEMINI_API;
  const tokensRaw = process.env.BEARER_TOKEN;

  if (!gemini?.trim() || !tokensRaw?.trim()) {
    console.log(chalk.red("\nENV belum lengkap!"));
    console.log(
      chalk.red(`Input Blabla & Token terlebih dahulu melalui menu [1]`),
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
