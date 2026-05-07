// utils/queue.js
export const imageQueue = [];
let downloaderFinished = false;

export function setDownloaderFinished(value) {
    downloaderFinished = value;
}

export function getDownloaderFinished() {
    return downloaderFinished;
}