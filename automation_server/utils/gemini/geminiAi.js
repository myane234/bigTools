import dotenv from 'dotenv';
import { getPrompt } from './getPromptvalue.js';

dotenv.config();

const apiKey = process.env.GEMINI_API;
const model = 'gemini-2.5-flash-lite';



// const prompt = await promptGeminiSelector();

// if(!prompt) {
//     console.log(`Pilih prompt yang bener`)
// }

// //Prompt normal no force silhouette
// const prompt = `
// Analyze the provided image. Your task is to generate metadata for a new Vectors artwork inspired by the image.
// The output MUST be a valid JSON object with: "prompt".

// 1. prompt: A highly detailed prompt for generating a new vector silhouette illustration inspired by the subject and composition of the image but creatively reimagined. Use solid black silhouette shapes with minimal detail and strong contrast. Describe the subject, background elements, composition, color palette, lighting, and overall mood.

// Example output:
// {
//   "prompt": "A clean flat vector silhouette of a playful dog sitting, shown as a solid black shape with minimal detail. with a white background, creating a modern minimal vector composition with strong contrast."
// }

// Do not include any other text. Output ONLY the JSON object. Avoid making it identical to the original image; keep similarity around 80% while creatively reimagining the scene.
// `

// const promptForce = `
// Analyze the provided image. Your task is to generate metadata for a new Vectors artwork inspired by the image.
// The output MUST be a valid JSON object with: "prompt".

// 1. prompt: A highly detailed prompt for generating a **vector silhouette illustration** inspired by the main subject of the image but creatively reimagined. The design must include **ONLY the main subject as a solid black silhouette**. Remove all decorative elements, props, and background objects from the original image. Use **pure black silhouette shapes with no internal details, shading, or textures**, placed on a **plain white background**. Focus only on the primary object and describe its pose or shape clearly in a clean minimal vector style.

// Example output:
// {
//   "prompt": "A minimal flat vector silhouette of a sitting dog, shown as a solid pure black shape with no internal details or textures. The dog is centered in the composition with a clean and balanced pose. The design uses strong contrast with a pure white background, creating a simple modern black and white silhouette vector style."
// }

// Do not include any other text. Output ONLY the JSON object. Avoid making it identical to the original image; keep similarity around 80% while creatively reimagining the subject.
// `

// import fs from 'fs';
// import { Groq } from 'groq-sdk';

// const groq = new Groq({
//     apiKey: '' // Pastikan API Key terisi
// });

// async function main() {
//     // 1. Tentukan path gambar lokal
//     const imagePath = './TestingImage/backup/test.jpg';

//     try {
//         // 2. Baca file secara sinkron/asinkron dan ubah ke base64
//         const imageBuffer = fs.readFileSync(imagePath);
//         const base64Image = imageBuffer.toString('base64');

//         // 3. Hit API Groq
//         const chatCompletion = await groq.chat.completions.create({
//             "messages": [
//                 {
//                     "role": "user",
//                     "content": [
//                         {
//                             "type": "text",
//                             "text": "What's in this image?"
//                         },
//                         {
//                             "type": "image_url",
//                             "image_url": {
//                                 // Gabungkan format data URL dengan string base64
//                                 "url": `data:image/jpeg;base64,${base64Image}`
//                             }
//                         }
//                     ]
//                 }
//             ],
//             // Pastikan model yang kamu pilih mendukung Vision (seperti Llama-3.2-11b-Vision-Preview)
//             "model": "meta-llama/llama-4-scout-17b-16e-instruct", 
//             "temperature": 1,
//             "max_completion_tokens": 1024,
//             "top_p": 1,
//             "stream": false,
//             "stop": null
//         });

//         console.log(chatCompletion.choices[0].message.content);
//     } catch (error) {
//         console.error("Terjadi kesalahan:", error.message);
//     }
// }

// main();

class Gemini {
    static async generateImage(image) {
        const prompt = getPrompt();
        try {
            const res = await groq.chat.completions.create({
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    // Gabungkan format data URL dengan string base64
                                    "url": `data:image/jpeg;base64,${image}`
                                }
                            }
                        ]
                    }
                ],
                // Pastikan model yang kamu pilih mendukung Vision (seperti Llama-3.2-11b-Vision-Preview)
                "model": "meta-llama/llama-4-scout-17b-16e-instruct",
                "temperature": 1,
                "max_completion_tokens": 1024,
                "top_p": 1,
                "stream": false,
                "stop": null
            });
            if (!res.ok) {
                throw new Error(`API error: ${res.status} ${res.statusText}`);
            }
            console.log(chatCompletion.choices[0].message.content);
            if (!chatCompletion.choices[0] || !chatCompletion.choices[0].message.content) {
                throw new Error('Invalid response format from Gemini API');
            }

            const imageData = chatCompletion.choices[0].message.content;
            return imageData;
        } catch (err) {
            console.error('Error generating image:', err);
            throw err;
        }
    }
}

export default Gemini;