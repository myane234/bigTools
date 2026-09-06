import fs from 'fs';
import path from 'path';

const statusFile = path.join(process.cwd(), 'profile-final-url-status.json');

function readProfileStatus() {
  try {
    if (fs.existsSync(statusFile)) {
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      return status && typeof status === 'object' ? status : {};
    }
  } catch (err) {
    console.warn('⚠️ Gagal membaca status final URL profile:', err.message);
  }
  return {};
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function updateProfileStatus(profile, finalUrl) {
  const status = readProfileStatus();
  // Validasi URL Flow: mendukung labs.google/fx maupun flow.google.com
  const isValidFlowUrl =
    typeof finalUrl === 'string' &&
    (finalUrl.startsWith('https://labs.google/fx') || finalUrl.startsWith('https://flow.google.com'));

  if (finalUrl && !isValidFlowUrl) {
    status[profile] = {
      finalUrl,
      lastUpdate: new Date().toLocaleString('id-ID'),
    };
    console.warn(`⚠️ Profile '${profile}' memiliki finalUrl tidak valid: ${finalUrl}`);
  } else {
    delete status[profile];
  }

  fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
}

export function getNonLabsProfiles() {
  return readProfileStatus();
}

export function isProfileQuotaBlocked(profile) {
  const entry = readProfileStatus()[profile];
  return Boolean(entry?.quotaBlockedOn && entry.quotaBlockedOn === today());
}

export function markProfileQuotaBlocked(profile) {
  const status = readProfileStatus();
  const previous = status[profile] || {};
  status[profile] = {
    ...previous,
    quotaBlockedOn: today(),
    lastUpdate: new Date().toLocaleString('id-ID'),
  };
  fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
  console.warn(`🚫 Profile '${profile}' diblokir hari ini karena kuota Agen Alat habis.`);
}

export function saveHistory(profile, finalUrl, successCount, saveDir) {
  const historyFile = `${saveDir}/history.json`;
  let historyData = [];

  fs.mkdirSync(saveDir, { recursive: true });

  try {
    if (fs.existsSync(historyFile)) {
      const fileContent = fs.readFileSync(historyFile, 'utf-8');
      historyData = JSON.parse(fileContent);
    }
  } catch (err) {
    console.warn('⚠️ Gagal membaca history.json lama, membuat baru...');
  }

  const existingIndex = historyData.findIndex(h => h.profile === profile);

  const entry = {
    profile,
    finalUrl: finalUrl || 'Gagal mendapatkan URL',
    successCount,
    lastUpdate: new Date().toLocaleString('id-ID'),
  };

  if (existingIndex >= 0) {
    historyData[existingIndex] = entry;
  } else {
    historyData.push(entry);
  }

  fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2));
  updateProfileStatus(profile, finalUrl);
}
