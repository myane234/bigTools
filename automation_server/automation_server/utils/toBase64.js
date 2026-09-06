import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const folderImage = path.join(__dirname, '..', 'downloads');

async function image64() {
    try {
        const images = await getImage();
        if(images.length === 0) {
            throw new Error('Gak ada gambar di folderImage');
        }

        const image64 = images.map(file => Base64(path.join(folderImage, file)));
        const image64Results = await Promise.all(image64);


        const hasil = images.map((file, index) => ({
            filename: file,
            base64: image64Results[index]
        }));

        return hasil;

    } catch(err) {
        console.error('error in image64 function:', err);
        throw err;
    }
}

async function Base64(imagePath) {
    try {
        const imageBuffer = await fs.readFile(imagePath);
        return imageBuffer.toString('base64');
    } catch(err) {
        console.error('error converting file to base64:', err);
        throw err;
    }
}

async function getImage() {
    try {
        const files = await fs.readdir(folderImage);

        if(files.length === 0) {
            throw new Error('Gak ada gambar di folderImage');
        }

        const imageFiles = files.filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));

        return imageFiles;
    } catch(err) {
        console.error('error getting image:', err);
        throw err;
    }
}

image64()