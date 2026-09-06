import path from 'path'
import fs from 'fs'

const NETWORK_PATH = "\\\\Desktop-omlcp1v\\d\\tokens.txt";
const LOCAL_PATH = "D:\\tokens.txt";

function log(msg) {
    const time = new Date().toLocaleString();
    console.log(`[${time}] ${msg}`);
}

function syncTokens() {
    try {
        if (!fs.existsSync(NETWORK_PATH)) {
            throw new Error("Network file not found");
        }

        const data = fs.readFileSync(NETWORK_PATH, "utf-8");

        if (!data || data.length < 5) {
            throw new Error("Token kosong / invalid");
        }

        fs.writeFileSync(LOCAL_PATH, data);
        log("Token berhasil di-sync ke local");
    } catch (err) {
        log("Gagal sync: " + err.message);

        // fallback: tetap pakai local kalau ada
        if (fs.existsSync(LOCAL_PATH)) {
            log("Pakai token local (fallback)");
        } else {
            log("Tidak ada token sama sekali!");
        }
    }
}

// jalan tiap 10 menit
setInterval(syncTokens, 180000);

// run pertama langsung
syncTokens();