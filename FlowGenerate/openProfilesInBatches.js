import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function createInterface() {
  return readline.createInterface({ input, output });
}

export async function openProfilesInBatches({
  profiles = [],
  batchSize = 5,
  delayMs = 5000,
  waitForEnter = true,
  onProfile,
} = {}) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    console.log('Tidak ada profil Chrome yang tersedia.');
    return [];
  }

  const safeBatchSize = Math.max(1, Number(batchSize) || 5);
  const totalBatches = Math.ceil(profiles.length / safeBatchSize);
  const results = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * safeBatchSize;
    const batch = profiles.slice(start, start + safeBatchSize);
    console.log(`\n📦 Batch ${batchIndex + 1}/${totalBatches} (${batch.length} profil)...`);

    for (let idx = 0; idx < batch.length; idx++) {
      const profile = batch[idx];
      const profileNumber = start + idx + 1;
      console.log(`🌐 Membuka ${profile} (${profileNumber}/${profiles.length})...`);

      const profileResult = await onProfile(profile, {
        profileNumber,
        totalProfiles: profiles.length,
        batchIndex,
        batchSize: safeBatchSize,
      });
      results.push(profileResult);

      const hasNextProfile = idx < batch.length - 1;
      const hasNextBatch = start + idx + 1 < profiles.length;
      if (hasNextProfile || hasNextBatch) {
        console.log(`⏳ Menunggu ${delayMs}ms sebelum profil berikutnya...`);
        await delay(delayMs);
      }
    }

    if (batchIndex < totalBatches - 1 && waitForEnter) {
      const rl = createInterface();
      await rl.question('Tekan Enter untuk membuka batch berikutnya...');
      rl.close();
    }
  }

  console.log(`✅ Selesai: ${results.length}/${profiles.length} profile diproses.`);
  return results;
}
