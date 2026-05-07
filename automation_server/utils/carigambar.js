export async function imageSearch(page) {
  try {
    const urls = await page.evaluate(() => {
      const urlsSet = new Set();

      const selectors = [
        'img[data-testid="asset-card-image"]',
        'a[data-testid="asset-card-link"] img',
        '#mosaic-container img',
        'a[data-testid="asset-core-card"] img'
      ];

      let images = [];

      for (const selector of selectors) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
          images = found;
          break;
        }
      }

      if (images.length === 0) {
        images = document.querySelectorAll('img');
      }

      images.forEach(img => {
        const possibleSources = [
          img.src,
          img.getAttribute && img.getAttribute('data-src'),
          img.getAttribute && img.getAttribute('data-lazy-src'),
          img.getAttribute && img.getAttribute('data-original'),
          img.dataset && img.dataset.src,
          img.dataset && img.dataset.original,
          img.currentSrc
        ];

        for (const src of possibleSources) {
          if (!src) continue;
          const s = String(src);
          if (!s.includes('http')) continue;

          // Accept common image extensions or 'convert' variants
          if (!(/\.(jpg|jpeg|png|gif|webp|bmp|svg)(?:\?|$)/i.test(s) || s.includes('convert'))) continue;

          const cleanUrl = s.split('?')[0];

          if (/t_|thumb|preview/i.test(cleanUrl)) continue;

          urlsSet.add(cleanUrl);
          break;
        }
      });

      return Array.from(urlsSet);
    });

    return urls || [];
  } catch (err) {
    console.error('carigambar.imageUrls error:', err && err.message ? err.message : err);
    return [];
  }
}