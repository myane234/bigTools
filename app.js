import chalk from 'chalk';
import { spawn } from 'child_process';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { env } from './automation_server/utils/CliAsk/inputEnv.js';
import {
  main,
  startGroqNFlowGenerate,
  GenerateJustFlow,
} from './automation_server/index.js';
import { setPrompt } from './automation_server/utils/groq/getPromptvalue.js';
import GroqAi from './automation_server/utils/groq/groqAi.js';
import { openSharedFlowInAllProfiles } from './FlowGenerate/index.js';
import { CrudPrompt, promptGroqSelector } from './utils/prompt.js';
import { manageProfiles } from './utils/BuatChrome.js';
import { getNonLabsProfiles } from './FlowGenerate/utils/historyJson.js';

const APP_PASSWORD = 'faruqganteng';

function createInterface() {
  return readline.createInterface({ input, output });
}

// ─── Authentication ───────────────────────────────────────────────────────────

async function authenticate() {
  console.clear();
  console.log(chalk.cyan.bold('\n============================='));
  console.log(chalk.cyan.bold('   SECURITY AUTHENTICATION   '));
  console.log(chalk.cyan.bold('=============================\n'));

  const rl = createInterface();
  const password = await rl.question('Masukkan Password CLI: ');
  rl.close();

  if (password === APP_PASSWORD) {
    console.log(chalk.green('\nAccess Granted! Membuka menu...\n'));
    showNonLabsProfiles();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  } else {
    console.log(chalk.red('\nPassword salah! Akses ditolak.\n'));
    process.exit(1);
  }
}

// Tampilkan profile yang URL-nya bukan URL Flow yang valid
function showNonLabsProfiles() {
  const nonLabsProfiles = getNonLabsProfiles();
  const entries = Object.entries(nonLabsProfiles);

  if (entries.length === 0) {
    console.log(chalk.green('Semua profile memiliki URL Flow (labs.google / flow.google) yang valid.\n'));
    return;
  }

  console.log(chalk.yellow('⚠️  Profile dengan finalUrl tidak valid (bukan labs.google / flow.google):'));
  for (const [profile, details] of entries) {
    console.log(`  - ${profile}: ${details.finalUrl}`);
  }
  console.log();
}

// ─── Main Menu ────────────────────────────────────────────────────────────────

async function mainMenu() {
  console.clear();
  checkEnv();
  console.log(
    chalk.cyan.bold(`
 Automation Tool Faruq 06
=============================
`),
  );
  console.log('[1] Input API');
  console.log('[2] Start Automation');
  console.log('[3] Start Groq + FlowGenerate');
  console.log('[4] Test API Keys');
  console.log('[5] Generate Just Flow');
  console.log('[6] Edit isi Prompt');
  console.log('[7] Manajemen Chrome Profiles');
  console.log('[8] Buka Shared Flow di Semua Profile');
  console.log('[0] Exit\n');

  const rl = createInterface();
  const choice = (await rl.question('Pilih mode: ')).trim();
  rl.close();

  switch (choice) {
    case '1':
      await env();
      break;

    case '2': {
      const prompt1 = await promptGroqSelector();
      if (prompt1) {
        setPrompt(prompt1);
        await main();
      }
      break;
    }

    case '3': {
      const prompt2 = await promptGroqSelector();
      if (prompt2) {
        setPrompt(prompt2);
        await startGroqNFlowGenerate();
      }
      break;
    }

    case '4':
      await GroqAi.testApi();
      break;

    case '5': {
      const pathHasilJson = await askGenerateJustFlow();
      await GenerateJustFlow(pathHasilJson);
      break;
    }

    case '6':
      await CrudPrompt();
      break;

    case '7':
      await manageProfiles();
      break;

    case '8':
      await openSharedFlowInAllProfiles();
      break;

    case '0':
      console.log(chalk.red('\nBye bro 👋\n'));
      process.exit(0);

    default:
      console.log(chalk.red('\nPilihan tidak valid!\n'));
  }

  await pause();
  await mainMenu();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function askGenerateJustFlow() {
  console.log(
    chalk.yellow(
      '\n⚠️  Generate Just Flow menghasilkan flow tanpa gambar.\n',
    ),
  );
  const rl = createInterface();
  try {
    while (true) {
      const pathJson = await rl.question(
        'Masukkan path folder output yang berisi hasil.json (contoh: ./output): ',
      );
      if (pathJson.trim()) return pathJson.trim();
      console.log('Path tidak boleh kosong!');
    }
  } finally {
    rl.close();
  }
}

async function pause() {
  const rl = createInterface();
  await rl.question('Tekan Enter untuk kembali ke menu...');
  rl.close();
}

function checkEnv() {
  const apiKey = process.env.API_KEY;
  if (!apiKey?.trim()) {
    console.log(chalk.red('\nENV belum lengkap!'));
    console.log(chalk.red('Input API terlebih dahulu melalui menu [1]'));
    return false;
  }
}

function runScript(command, args = []) {
  return new Promise(resolve => {
    console.log(chalk.gray(`\nMenjalankan: ${command} ${args.join(' ')}\n`));
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('close', resolve);
  });
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function init() {
  await authenticate();
  await mainMenu();
}

init();
