import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ask } from './tanya.js';

function createEnvFile(envPath) {
    const defaultContent = `# Auto Generated .env
GEMINI_API=
BEARER_TOKEN=
`;
    fs.writeFileSync(envPath, defaultContent);
}

function showEnv(envPath) {
    if (!fs.existsSync(envPath)) {
        console.log(" .env belum ada.");
        return;
    }
    const content = fs.readFileSync(envPath, 'utf-8');
    console.log("\nIsi .env:");
    console.log(content);
}

function updateEnvFile(envPath, newValues) {
    if (!fs.existsSync(envPath)) {
        throw new Error(`File .env tidak ditemukan di ${envPath}`);
    }

    // baca isi file
    let content = fs.readFileSync(envPath, 'utf-8');

    for (const [key, value] of Object.entries(newValues)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (content.match(regex)) {
            // update kalau key udah ada
            content = content.replace(regex, `${key}=${value}`);
        } else {
            // append kalau key belum ada
            content += `\n${key}=${value}`;
        }
    }

    fs.writeFileSync(envPath, content, 'utf-8');
    console.log(`.env berhasil diupdate: ${Object.keys(newValues).join(', ')}`);
}


function parseTxt(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error("File TXT tidak ditemukan!");
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split("\n");

    const config = {};

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const [key, ...val] = trimmed.split("=");
        config[key.trim()] = val.join("=").trim();
    }

    if (!config.GEMINI_API || !config.BEARER_TOKEN) {
        throw new Error("Format TXT salah. Harus ada API dan BEARER_TOKEN");
    }

    return config;
}

export async function env() {
    try {
        const envPath = path.join(process.cwd(), '.env');
        console.log(" Path:", envPath);

        if (!fs.existsSync(envPath)) {
            console.log(" .env belum ada, membuat baru...");
            createEnvFile(envPath);
        }

        dotenv.config({ path: envPath });

        let gemini = process.env.GEMINI_API;
        let tokensRaw = process.env.BEARER_TOKEN;

        // 🔥 Kalau ENV belum lengkap
        if (!gemini?.trim() || !tokensRaw?.trim()) {

            console.log("\nENV belum lengkap.");
            console.log("[1] Input manual");
            console.log("[2] Load dari file TXT\n");

            const mode = await ask("Pilih metode (1/2): ");

            let newContent;

            if (mode.trim() === "2") {

                const txtPath = await ask("Masukkan absolute path file TXT: ");
                const config = parseTxt(txtPath.trim());

                newContent = `# Auto Generated .env
GEMINI_API=${config.GEMINI_API}
BEARER_TOKEN=${config.BEARER_TOKEN}
`;

                console.log(" Berhasil load dari TXT ✅");

            } else {

                gemini = await ask("Masukkan codeA: ");

                newContent = `# Auto Generated .env
GEMINI_API=${gemini}
BEARER_TOKEN=
`;

                console.log(" ENV berhasil diisi manual ✅");
            }

            fs.writeFileSync(envPath, newContent);
            dotenv.config({ path: envPath, override: true });

            tokensRaw = process.env.BEARER_TOKEN;
        }

        const tokenList = tokensRaw
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);

        console.log(` Total token ditemukan: ${tokenList.length}`);

        showEnv(envPath);

        const askEditEnv = await ask(`Apakah ingin edit API & Token? (y/n): `);
        if(askEditEnv.trim().toLowerCase() === 'y') {
            const newGemini = await ask("Masukkan GEMINI_API baru (biarkan kosong untuk tidak mengubah): ");
            const newTokens = await ask("Masukkan BEARER_TOKEN baru (pisahkan koma, biarkan kosong untuk tidak mengubah): ");
            updateEnvFile(envPath, {
                ...(newGemini.trim() && { GEMINI_API: newGemini.trim() }),
                ...(newTokens.trim() && { BEARER_TOKEN: newTokens.trim() })
            });
        }

        return {
            geminiApi: process.env.GEMINI_API,
            bearerTokens: tokenList
        };

    } catch (err) {
        console.error(" inputenv:", err.message);
        throw err;
    }
}
