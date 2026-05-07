import { ask } from "./tanya.js";

export async function testingMode() {
    console.log(`
Pilih Mode Testing:
1. Hanya scrape
2. Scrape + Gemini + Whisk

`);

    const jawabanMode = await ask('Pilih mode pake angka: ');
    return jawabanMode; 
}

export function stopTesting(testPoint, userChoice) {
    if (!userChoice) return; // kalau nggak testing, skip
    if (userChoice === testPoint) {
        console.log(`Testing mode aktif, berhenti di titik ${testPoint}`);
    }
}