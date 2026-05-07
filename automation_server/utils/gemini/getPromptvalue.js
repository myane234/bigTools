// GlobalPrompt.js
let promptValue = null;

export function setPrompt(value) {
    promptValue = value;
}

export function getPrompt() {
    if (!promptValue) throw new Error("Prompt belum di-set!");
    return promptValue;
}