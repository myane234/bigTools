import { GeminiClient } from "./Gemini/index.js";
import { generateImageFlow } from "./FlowGenerate/index.js";

const outputDir = 'D:\\BigTools\\TestingImage'; //Base

async function main() {
    try {
        await GeminiClient(outputDir);
        console.log(`Selesai prompt`)

        await generateImageFlow(outputDir)

        console.log(`Selesai`)
    } catch(err) {
        console.error(err.message)
    }
}

main();