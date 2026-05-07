import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const tanya = (text) => {
  return new Promise((resolve) => {
    rl.question(text, (jawaban) => {
      resolve(jawaban)
    })
  })
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const Testing = path.join(__dirname, '../Testing');
const downloads = path.join(__dirname, '../downloads');
const Hasil = path.join(__dirname, '../Hasil');
const hasilJson = path.join(__dirname, '../hasil.json');

class CheckFolder {
  //folder
  static checkTesting = false;
  static checkDownloads = false;
  static checkHasil = false;
  //isi folder
  static checkTestingIsi = false;
  static checkDownloadsIsi = false;
  static checkHasilIsi = false;
  static checkHasilJson = false;


  static Update () {
    this.checkTesting = fs.existsSync(Testing);
    this.checkDownloads = fs.existsSync(downloads);
    this.checkHasil = fs.existsSync(Hasil);

    this.checkTestingIsi = this.checkTesting ? cekIsiFolder(Testing) > 0 : false;
    this.checkDownloadsIsi = this.checkDownloads ? cekIsiFolder(downloads) > 0 : false;
    this.checkHasilIsi = this.checkHasil ? cekIsiFolder(Hasil) > 0 : false;
    this.checkHasilJson = fs.existsSync(hasilJson);
  }
}

function cekIsiFolder(folderPath) {
  try {
    const files = fs.readdirSync(folderPath);
    return files.length;
  } catch(err) {
    throw err;
  }
}

function hapusFileSatu(folderPath) {
  try {
     const files = fs.readdirSync(folderPath);

      for (const file of files) {
        const filePath = path.join(folderPath, file);

        if(fs.statSync(filePath).isFile()) {
          console.log(`File: ${filePath}`)
          if(path.extname(filePath).toLowerCase() === ".json") {
            console.log(`File ${filePath} Tidak di hapus`)
            continue;
          }

          fs.unlinkSync(filePath);
          
        }
      }
      console.log(`File dihapus dari folder: ${folderPath}`);
  } catch(err) {
    throw err;
  }
}


export function hapusFileAll() {
  CheckFolder.Update();

  try {
    if (CheckFolder.checkTesting) {
      const files = fs.readdirSync(Testing);

      for (const file of files) {
        const filePath = path.join(Testing, file);

        if(fs.statSync(filePath).isFile()) {

          if(path.extname(filePath).toLowerCase() === ".json") {
            console.log(`File ${filePath} Tidak di hapus`)
            continue;
          }

          fs.unlinkSync(filePath);
          
        }
      }
      console.log(`File dihapus dari folder: ${Testing}`);
    }

    if(CheckFolder.checkDownloads) {
      const files = fs.readdirSync(downloads);
      for (const file of files) {
        const filePath = path.join(downloads, file);

        if(fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          console.log(`File dihapus dari folder: ${downloads}`);
        }
      }
    }

    if(CheckFolder.checkHasil) {
      const files = fs.readdirSync(Hasil);
      
      for (const file of files) {
        const filePath = path.join(Hasil, file);

        if(fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
          console.log(`File dihapus dari folder: ${Hasil}`);
        }
      }
    }
  } catch(err) {
    throw err;
  }
}



async function main() {
  CheckFolder.Update();

  console.log(`List Folder:
    ${CheckFolder.checkTesting ? '✓' : '✗'} Testing ${CheckFolder.checkTestingIsi ? '(ada file)' : '(kosong)'}
    ${CheckFolder.checkDownloads ? '✓' : '✗'} downloads ${CheckFolder.checkDownloadsIsi ? '(ada file)' : '(kosong)'}
    ${CheckFolder.checkHasil ? '✓' : '✗'} Hasil ${CheckFolder.checkHasilIsi ? '(ada file)' : '(kosong)'}
    ${CheckFolder.checkHasilJson ? '✓' : '✗'} hasil.json ${CheckFolder.checkHasilJson ? '(ada Isi)' : '(kosong)'}
  `) 
  console.log(`
    1. Hapus semua file di folder Testing
    2. Hapus semua file di folder downloads
    3. Hapus semua file di folder Hasil
    4. Hapus isi Hasil.Json
    all. Hapus semua file di semua folder
  `)

  if(!CheckFolder.checkTestingIsi && !CheckFolder.checkDownloadsIsi && !CheckFolder.checkHasilIsi && !CheckFolder.checkHasilJson) {
    console.log('Semua File kosong. Keluar dari program.');
    rl.close();
    return;
  }

  const jawaban = await tanya('Pilih folder yang ingin dihapus (1, 2, 3, 4) atau all untuk semua folder: ');

  switch(jawaban) {
    case '1':
      if(CheckFolder.checkTesting) {
        hapusFileSatu(Testing);
      }
      break;
    case '2':
      if(CheckFolder.checkDownloads) {
        hapusFileSatu(downloads);
      }
      break;
    case '3':
      if(CheckFolder.checkHasil) {
        hapusFileSatu(Hasil);
      }
      break;
    case '4':
      if(CheckFolder.checkHasilJson) {
        fs.writeFileSync(hasilJson, `[]`, 'utf-8');
        console.log('Isi hasil.json telah dihapus.');

        
      }
      break;
    case 'all':
      hapusFileAll();
      break;
    default:
      console.log('Pilihan tidak valid. Silakan pilih 1, 2, 3, 4 atau all.');
      break;
  }

  rl.close();
}

main();
