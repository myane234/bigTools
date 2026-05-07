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


class Gemini {
    static async generateImage(image) {
        const prompt = getPrompt();
        try {
        
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        "parts": [
                            { "text": prompt},
                            {
                                inline_data: {
                                    mime_type: 'image/jpeg',
                                    data: image
                                }
                            }
                        ]
                    }
                ]
            })
        })

        if (!res.ok) {
            throw new Error(`API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
            throw new Error('Invalid response format from Gemini API');
        }

        const imageData = data.candidates[0].content.parts[0].text;
        return imageData;
    } catch(err) {
        console.error('Error generating image:', err);
        throw err;
    }
    }
}

export default Gemini;