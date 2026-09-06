import { createImageWhiskBatch } from '../utils/whisk/createImageWhisk.js';
import { hapusFileAll } from './hapus.js';

const API = process.env.GEMINI_API
const model = 'gemini-2.5-flash-lite'

async function APiTest() {
  try {
    console.log(`Testing API`);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            "parts": [
              { "text": "Testing Gemini API"}
            ]
          }
        ]
      })
    })

    if(!res.ok) {
      throw new Error(`API ERROR: ${res.status} n ${res.statusText}`)
    }

    const data = await res.json();

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts[0]) {
            throw new Error('Invalid response format from blabalbla token');
    }

    const hasil = data.candidates[0].content.parts[0].text;
    
    if(!hasil) {
      throw new Error(`Response blablaToken Error`)
    }

    console.log(`HTTP Code: ${res.status}`)

    return true;

  } catch(err) {
    console.error(`APi Test Bermasalah`, err.message);
    return false;
  }
}

async function test(numWorkers = 1) {
  try {
    console.log(`Testing bearer`)

    const hasilData = 
      [
        {
          "filename": "gambar_1.jpg",
          "geminiResult": "{\n  \"prompt\": \"A collection of diverse vector speech bubbles and thought bubbles rendered in a clean, minimalist style. The collection showcases a variety of shapes, including rounded rectangles, circles, ovals, cloud-like forms, and one with a serrated edge, all outlined with thick, consistent black lines on a stark white background. A few cloud-shaped bubbles feature small circles emanating from them, indicating thought processes. The composition is a grid-like arrangement, presenting a comprehensive set of visual communication elements. The lighting is even and flat, emphasizing the graphic nature of the icons. The overall mood is neutral, functional, and modern, suitable for UI design, comics, or informational graphics.\"\n}"
        },
        {
          "filename": "gambar_10.jpg",
          "geminiResult": "{\n  \"prompt\": \"A collection of stylized vector speech bubbles, each containing a single word like \\\"HI,\\\" \\\"HELLO,\\\" \\\"WELCOME,\\\" \\\"BYE!,\\\" \\\"YES,\\\" and \\\"NO.\\\" The speech bubbles are primarily a bright, energetic yellow with thick black outlines and subtle, hatched shading on their sides to create a sense of depth. The text within each bubble is bold, black, and has a slightly distressed or textured appearance, mimicking a stamped effect. The composition features the bubbles arranged dynamically across a clean white background, with various shapes including rounded rectangles and a circle. The overall style is graphic, modern, and communicative, conveying simple, direct messages with a playful yet clear aesthetic. The lighting is even and bright, casting minimal shadows due to the flat vector nature of the artwork.\"\n}"
        },
        {
          "filename": "gambar_10.jpg",
          "geminiResult": "{\n  \"prompt\": \"A collection of stylized vector speech bubbles, each containing a single word like \\\"HI,\\\" \\\"HELLO,\\\" \\\"WELCOME,\\\" \\\"BYE!,\\\" \\\"YES,\\\" and \\\"NO.\\\" The speech bubbles are primarily a bright, energetic yellow with thick black outlines and subtle, hatched shading on their sides to create a sense of depth. The text within each bubble is bold, black, and has a slightly distressed or textured appearance, mimicking a stamped effect. The composition features the bubbles arranged dynamically across a clean white background, with various shapes including rounded rectangles and a circle. The overall style is graphic, modern, and communicative, conveying simple, direct messages with a playful yet clear aesthetic. The lighting is even and bright, casting minimal shadows due to the flat vector nature of the artwork.\"\n}"
        },
        {
          "filename": "gambar_10.jpg",
          "geminiResult": "{\n  \"prompt\": \"A collection of stylized vector speech bubbles, each containing a single word like \\\"HI,\\\" \\\"HELLO,\\\" \\\"WELCOME,\\\" \\\"BYE!,\\\" \\\"YES,\\\" and \\\"NO.\\\" The speech bubbles are primarily a bright, energetic yellow with thick black outlines and subtle, hatched shading on their sides to create a sense of depth. The text within each bubble is bold, black, and has a slightly distressed or textured appearance, mimicking a stamped effect. The composition features the bubbles arranged dynamically across a clean white background, with various shapes including rounded rectangles and a circle. The overall style is graphic, modern, and communicative, conveying simple, direct messages with a playful yet clear aesthetic. The lighting is even and bright, casting minimal shadows due to the flat vector nature of the artwork.\"\n}"
        },
        {
          "filename": "gambar_10.jpg",
          "geminiResult": "{\n  \"prompt\": \"A collection of stylized vector speech bubbles, each containing a single word like \\\"HI,\\\" \\\"HELLO,\\\" \\\"WELCOME,\\\" \\\"BYE!,\\\" \\\"YES,\\\" and \\\"NO.\\\" The speech bubbles are primarily a bright, energetic yellow with thick black outlines and subtle, hatched shading on their sides to create a sense of depth. The text within each bubble is bold, black, and has a slightly distressed or textured appearance, mimicking a stamped effect. The composition features the bubbles arranged dynamically across a clean white background, with various shapes including rounded rectangles and a circle. The overall style is graphic, modern, and communicative, conveying simple, direct messages with a playful yet clear aesthetic. The lighting is even and bright, casting minimal shadows due to the flat vector nature of the artwork.\"\n}"
        },
    ]
    const hasil = hasilData

    const validResults = hasil.filter(item => !item.error);
    if (validResults.length === 0) {
      console.log(' Tidak ada hasil valid untuk di-generate');
      return;
    }

    console.log(`Di temukan ${validResults.length}`)

    const prompts = validResults.map(item => {
            let promptText = item.geminiResult;
            if (typeof promptText === 'string') {
                try {
                    const parsed = JSON.parse(promptText);
                    promptText = parsed.prompt;
                } catch(e) {
                }
            }
            return promptText;
        });

    await createImageWhiskBatch(prompts, numWorkers)
    
    
      console.log(' Hasil generate gambar:');
        hapusFileAll();
      console.log(' Semua file di folder di hapus');

      console.log(` Test Berhasil ✅`)
    

  } catch(err) {
    console.error(`Bermasalah ${err}`)
  }
}

async function main() {
  try {

    await APiTest();
    console.log(`Testing TOKEN`)
    

    await test(5)
    

    console.log(`Testing Berhasil`)

  } catch(err) {
    console.error(`Error at main ${err}`)
  }
}

main();