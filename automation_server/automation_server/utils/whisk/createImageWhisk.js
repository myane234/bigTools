import axios from 'axios';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootProject = path.resolve(__dirname, '../../');

const tokenFile = path.join('D:', 'tokens.txt')


if (!existsSync(tokenFile)) {
  throw new Error("tokens.txt tidak ditemukan");
}


let tokens = (await fs.readFile(tokenFile, 'utf8'))
  .split(',')
  .map(t => t.trim())
  .filter(Boolean);

if (tokens.length === 0) throw new Error('tokens.txt kosong');
console.log(`✅ Ada ${tokens.length} bearer token(s)`);




const endpoint = 'https://aisandbox-pa.googleapis.com/v1/whisk:generateImage';



function getRandomSeed() {
  return Math.floor(Math.random() * 1000000);
}

async function createFolder(outputDir) {
  try {
    const hasilFolder = path.join(outputDir || rootProject, 'Hasil');
    if (!existsSync(hasilFolder)) {
      await fs.mkdir(hasilFolder, { recursive: true })
      console.log(`Folder dibuat:  ${hasilFolder}`)
    } else {
      console.log(`Sudah ada folder: ${hasilFolder}`)
    }
    return hasilFolder;
  } catch (err) {
    console.error('Gagal membuat Folder: ', err)
    throw err;
  }
}

function getSessionId() {
  return `;${Date.now()}`;
}

function getRandomToken() {
  return tokens[Math.floor(Math.random() * tokens.length)];
}

async function createImageWhisk(promptText, token, outputDir = rootProject) {
  const payload = {
    clientContext: {
      workflowId: uuidv4(),
      tool: "BACKBONE",
      sessionId: getSessionId()
    },
    imageModelSettings: {
      imageModel: "IMAGEN_3_5",
      aspectRatio: "IMAGE_ASPECT_RATIO_LANDSCAPE"
    },
    seed: getRandomSeed(),
    prompt: promptText,
    mediaCategory: "MEDIA_CATEGORY_BOARD"
  };


  try {
    const response = await axios.post(endpoint,
      JSON.stringify(payload),
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain;charset=UTF-8',
          'Origin': 'https://labs.google',
          'Referer': 'https://labs.google/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000 //15 detik timeout
      }
    );

    console.log('Response:', response.data);

    const encodedImage = response.data?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;

    if (encodedImage) {
      const cleanBase64 = encodedImage.replace(/^data:image\/\w+;base64,/, '');
      const timestamp = Date.now();
      const safePrompt = promptText.slice(0, 30).replace(/[^a-z0-9]/gi, '_');

      const hasilFolder = await createFolder(outputDir);
      const fileName = path.join(hasilFolder, `${timestamp}_${safePrompt}.jpg`);

      await fs.writeFile(fileName, cleanBase64, 'base64');

      console.log(`Gambar disimpan di ${fileName}`);
      console.log(` Lokasi: ${path.resolve(fileName)}`);
      console.log(` Seed: ${response.data?.imagePanels?.[0]?.generatedImages?.[0]?.seed}`);

      return {
        success: true,
        fileName,
        prompt: promptText
      };
    }

  } catch (err) {
    console.error('Gagal: ', err.response?.status);
    console.error('Gagal: ', err.response?.data);
    throw err;
  }
}

async function createImageWhiskWithRetry(promptText, retries = 3, outputDir = rootProject) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const currentToken = getRandomToken();
    try {
      return await createImageWhisk(promptText, currentToken, outputDir);
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        tokens = tokens.filter(t => t !== currentToken);
        console.warn(`⚠️ [401 Unauthorized] Token invalid dihapus. (Format: "${currentToken.substring(0, 15)}..."). Sisa: ${tokens.length}`);
        if (tokens.length === 0) throw new Error('Semua token habis');
        continue;
      }
      if (status === 429) {
        let delayMs;
        if (attempt <= 10) delayMs = 10000;
        else if (attempt <= 30) delayMs = 30000;
        else delayMs = 50000;
        console.log(`[Retry ${attempt}] 429 Rate limit, delay ${delayMs}ms...`);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
      }
      if ((status === 503 || err.code === 'ECONNABORTED') && attempt < retries) {
        console.log(`[Retry ${attempt}] Server Bermasalah Retry...`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      } else {
        throw err;
      }
    }
  }
}

// Batch processing worker
export async function createImageWhiskBatch(prompts, numWorkers = 1, outputDir) {
  const limit = pLimit(numWorkers);

  console.log(`\n Starting batch processing with ${numWorkers} workers for ${prompts.length} prompts\n`);

  const workerIds = Array.from({ length: numWorkers }, (_, i) => i + 1);
  let currentWorker = 0;

  const tasks = prompts.map((prompt, index) =>
    limit(async () => {
      const workerId = workerIds[currentWorker % numWorkers];
      currentWorker++;

      try {
        console.log(`[Worker ${workerId}] Processing ${index + 1}/${prompts.length}...`);
        const delay = Math.floor(Math.random() * 2000) + 500
        await new Promise(r => setTimeout(r, delay));
        const result = await createImageWhiskWithRetry(prompt, 10, outputDir);
        return {
          ...result,
          index,
          workerId,
          status: 'done'
        };
      } catch (err) {
        console.error(`[Worker ${workerId}] Failed ${index + 1}: ${err.message}`);
        return {
          index,
          workerId,
          prompt,
          status: 'error',
          error: err.message
        };
      }
    })
  );

  const results = await Promise.all(tasks);

  try {
    const hasilFolder = path.join(outputDir || rootProject, 'Hasil');
    if (!existsSync(hasilFolder)) {
      await fs.mkdir(hasilFolder, { recursive: true });
    }
    const resultPath = path.join(hasilFolder, '..','result.json');
    await fs.writeFile(resultPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n📝 Status output dicatat di: ${resultPath}`);
  } catch (logErr) {
    console.error('Gagal menyimpan file result.json:', logErr.message);
  }

  // Summary
  const successful = results.filter(r => r.status === 'done').length;
  const failed = results.filter(r => r.status === 'error').length;

  console.log('\n' + '='.repeat(60));
  console.log('📊 BATCH PROCESSING REPORT');
  console.log('='.repeat(60));
  console.log(`Total prompts: ${prompts.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Workers used: ${numWorkers}`);
  console.log('='.repeat(60) + '\n');

  return results;
}

export default createImageWhisk;