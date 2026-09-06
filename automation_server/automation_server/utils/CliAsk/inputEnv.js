import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ask } from './tanya.js';

function createEnvFile(envPath) {
    const defaultContent = `# Auto Generated .env
GROQ_API_KEYS=
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

    if (!config.GROQ_API_KEYS) {
        throw new Error("Format TXT salah. Harus ada GROQ_API_KEYS");
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

        let groqKeys = process.env.GROQ_API_KEYS;

        // 🔥 Kalau ENV belum lengkap
        if (!groqKeys?.trim()) {

            console.log("\nENV belum lengkap.");
            console.log("[1] Input manual");
            console.log("[2] Load dari file TXT\n");

            const mode = await ask("Pilih metode (1/2): ");

            let newContent;

            if (mode.trim() === "2") {

                const txtPath = await ask("Masukkan absolute path file TXT: ");
                const config = parseTxt(txtPath.trim());

                newContent = `# Auto Generated .env
GROQ_API_KEYS=${config.GROQ_API_KEYS}
`;

                console.log(" Berhasil load dari TXT ✅");

            } else {

                groqKeys = await ask("Masukkan GROQ_API_KEYS (pisahkan dengan koma jika lebih dari satu): ");

                newContent = `# Auto Generated .env
GROQ_API_KEYS=${groqKeys}
`;

                console.log(" ENV berhasil diisi manual ✅");
            }

            fs.writeFileSync(envPath, newContent);
            dotenv.config({ path: envPath, override: true });

            // Tokens dihapus
        }

        showEnv(envPath);

        const askEditEnv = await ask(`Apakah ingin edit API? (y/n): `);
        if (askEditEnv.trim().toLowerCase() === 'y') {
            const newGroq = await ask("Masukkan GROQ_API_KEYS baru (pisahkan koma, biarkan kosong untuk tidak mengubah): ");
            updateEnvFile(envPath, {
                ...(newGroq.trim() && { GROQ_API_KEYS: newGroq.trim() })
            });
        }

        return {
            groqApiKeys: process.env.GROQ_API_KEYS
        };

    } catch (err) {
        console.error(" inputenv:", err.message);
        throw err;
    }
}

