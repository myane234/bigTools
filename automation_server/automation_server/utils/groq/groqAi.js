import { getPrompt } from "../groq/getPromptvalue.js";
import { env } from "../CliAsk/inputEnv.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

// Konfigurasi host Ollama
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://100.65.224.93:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5vl:latest";

const testPrompt = `
Analyze the provided image. Your task is to generate metadata for a new Vectors artwork inspired by the image.
The output MUST be a valid JSON object with: "prompt".

1.  **prompt**: A highly detailed and descriptive prompt for generating the new Vector. This prompt should be inspired by the subject and composition of the provided image, but reimagined in a vector style. The prompt must describe a vector/illustration, not a photo. It should cover the main subject, background elements, composition, color palette, lighting, and overall mood. Aim for a rich, multi-sentence description. Example: "A detailed flat vector illustration of a joyful golden retriever puppy sitting on a lush green lawn. The puppy has a friendly expression, with its tongue slightly out. The background features a clear blue sky with a few fluffy white clouds. The style is clean and modern, with bold outlines and a vibrant color palette."

Example output for a photo of a real dog:
{
  "prompt": "A detailed flat vector illustration of a joyful golden retriever puppy sitting on a lush green lawn. The puppy has a friendly expression, with its tongue slightly out. The background features a clear blue sky with a few fluffy white clouds. The style is clean and modern, with bold outlines and a vibrant color palette.",
}

Do not include any other text, comments, or markdown formatting like \`\`\`json. The output must be ONLY the JSON object.`

class GroqAi {
  static currentKeyIndex = 0;

  /**
   * Menguji koneksi ke server Ollama
   */
static async testApi() {
  console.log("\n[TEST API] Memulai testing koneksi & Vision Ollama...\n");

  try {
    // 1. Cek koneksi server & daftar model
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) {
      throw new Error(`HTTP Error Status: ${response.status}`);
    }

    const data = await response.json();
    const availableModels = data.models.map((m) => m.name).join(", ");
    console.log(`[Ollama Server] ✅ Status: 200 OK | Models: ${availableModels || "Kosong"}`);

    // 2. Cari semua gambar di folder /TestingImage/backup
    const dirPath = path.resolve("./TestingImage/backup");
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Folder tidak ditemukan: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath);
    const imageFiles = files.filter((file) =>
      /\.(jpg|jpeg|png|webp)$/i.test(file)
    );

    if (imageFiles.length === 0) {
      throw new Error(`Tidak ada berkas gambar (.jpg, .jpeg, .png, .webp) di ${dirPath}`);
    }

    // 3. Pilih satu gambar secara acak (random)
    const randomIndex = Math.floor(Math.random() * imageFiles.length);
    const selectedImage = imageFiles[randomIndex];
    const imagePath = path.join(dirPath, selectedImage);

    console.log(
      `[Test Vision] Memilih gambar acak (${randomIndex + 1}/${imageFiles.length}): ${selectedImage}`
    );

    // 4. Baca gambar & ubah ke Base64
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString("base64");

    // 5. Kirim request test vision ke Ollama
    console.log(`[Test Vision] Mengirim request ke model: ${OLLAMA_MODEL}...`);
    const visionStartTime = Date.now();

    const visionRes = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: testPrompt,
        images: [imageBase64],
        stream: false,
      }),
    });

    if (!visionRes.ok) {
      const errText = await visionRes.text();
      throw new Error(`Vision Test Failed (${visionRes.status}): ${errText}`);
    }

    const visionData = await visionRes.json();
    const elapsed = Date.now() - visionStartTime;

    console.log(`[Test Vision] ✅ Berhasil dalam ${elapsed}ms`);
    console.log(`[Hasil Respon]: ${visionData.response.trim()}`);

  } catch (err) {
    console.log(`[Ollama Test] ❌ Status: ERROR | Msg: ${err.message}`);
  }

  console.log("\n[TEST API] Selesai.\n");
}

  /**
   * Mengirim request analisis/generasi gambar ke Ollama API
   * @param {string} imageBase64 - String gambar berbasis base64 (tanpa prefix data:image/...)
   */
  static async generateImage(imageBase64) {
    const prompt = getPrompt();

    // Membersihkan prefix base64 jika ada
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    try {
      const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: prompt,
          images: [cleanBase64], // Ollama menerima array string base64 murni
          stream: false,
          options: {
            temperature: 1,
            top_p: 1,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama API Error (${response.status}): ${errorText}`,
        );
      }

      const data = await response.json();

      if (!data || !data.response) {
        throw new Error("Invalid response format from Ollama API");
      }

      return data.response;
    } catch (err) {
      console.error(`[Ollama Error]: ${err.message}`);
      throw err;
    }
  }
}

export default GroqAi;