export function saveHistory(profile, finalUrl, successCount, saveDir) {
  const historyFile = `${saveDir}/history.json`;
  let historyData = [];

  try {
    if (fs.existsSync(historyFile)) {
      const fileContent = fs.readFileSync(historyFile, "utf-8");
      historyData = JSON.parse(fileContent);
    }
  } catch (err) {
    console.warn("⚠️ Gagal membaca history.json lama, membuat baru...");
  }

  const existingIndex = historyData.findIndex((h) => h.profile === profile);

  const entry = {
    profile: profile,
    finalUrl: finalUrl || "Gagal mendapatkan URL",
    successCount: successCount,
    lastUpdate: new Date().toLocaleString("id-ID"),
  };

  if (existingIndex >= 0) {
    historyData[existingIndex] = entry;
  } else {
    historyData.push(entry);
  }

  fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2));
}
