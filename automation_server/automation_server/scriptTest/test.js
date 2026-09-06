import Gemini from '../utils/gemini/geminiAi.js';

const hasil = await Gemini.testApi('Apa itu Gemini?');
console.log(hasil);