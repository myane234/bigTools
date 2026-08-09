export async function main(page) {
  try {
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
}

async function scroll(page) {
  try {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;

        const timer = setInterval(() => {
          // Ambil tinggi maksimal halaman saat ini
          const scrollHeight = document.body.scrollHeight;

          // Lakukan scroll ke bawah sejauh 'distance'
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  } catch (err) {
    console.error(`Error during scrolling: ${err.message}`);
  }
}
