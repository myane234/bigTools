import fs from 'fs';
import path from 'path';

/**
 * Parse data dari waitForGetChat dan format menjadi JSON objects
 * @param {Object} data - Data dari getResponseStructured
 * @returns {Array} Array of parsed prompt objects
 */
function parsePrompts(data) {
    // Ambil paragraphs atau raw
    let rawString = '';
    
    if (data.paragraphs && data.paragraphs.length > 0) {
        rawString = data.paragraphs[0];
        console.log('✓ Using paragraphs data');
    } else if (data.raw) {
        rawString = data.raw;
        console.log('✓ Using raw data');
    } else {
        console.warn('✗ No paragraphs or raw data found');
        return [];
    }

    const prompts = [];
    
    // Data berupa string dengan multiple JSON objects
    // Split pattern bisa }\n{ atau }{ atau bahkan newline literal
    let objectStrings = [];
    
    // Coba pattern dengan \n terlebih dahulu
    if (rawString.includes('}\n{')) {
        objectStrings = rawString.split('}\n{');
    } else if (rawString.includes('}{')) {
        objectStrings = rawString.split('}{');
    } else {
        objectStrings = [rawString];
    }
    
    console.log(`  Splitting found ${objectStrings.length} segments`);
    
    for (let i = 0; i < objectStrings.length; i++) {
        let objStr = objectStrings[i].trim();
        
        if (!objStr) continue;
        
        // Reconstruct valid JSON object
        if (i > 0 && !objStr.startsWith('{')) {
            objStr = '{' + objStr;
        }
        if (i < objectStrings.length - 1 && !objStr.endsWith('}')) {
            objStr = objStr + '}';
        }
        
        // Ensure proper format
        if (!objStr.startsWith('{')) objStr = '{' + objStr;
        if (!objStr.endsWith('}')) objStr = objStr + '}';
        
        try {
            const parsed = JSON.parse(objStr);
            
            if (parsed.prompt && typeof parsed.prompt === 'string') {
                prompts.push({
                    prompt: parsed.prompt
                });
            }
        } catch (err) {
            // Skip invalid JSON
        }
    }
    
    console.log(`  ✓ Extracted ${prompts.length} prompts\n`);
    return prompts;
}

/**
 * Parse hasil.txt file yang berisi multiple JSON entries
 * @param {string} filePath - Path to hasil.txt
 * @returns {Array} Array of all parsed prompts from all entries
 */
function parseResultsFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Split file into individual JSON objects
    // Pattern: setiap object dimulai dengan { dan berakhir dengan }
    const entries = [];
    let currentObject = '';
    let braceCount = 0;
    
    for (const char of content) {
        if (char === '{') {
            braceCount++;
        } else if (char === '}') {
            braceCount--;
        }
        
        currentObject += char;
        
        if (braceCount === 0 && currentObject.trim().length > 0) {
            try {
                const parsed = JSON.parse(currentObject);
                entries.push(parsed);
            } catch (err) {
                // Skip invalid JSON
            }
            currentObject = '';
        }
    }
    
    return entries;
}

/**
 * Simpan parsed prompts ke hasil.json
 * @param {Array} prompts - Array of prompt objects
 * @param {String} outputDir - Directory untuk output file (default: './Hasil')
 */
async function saveResultsToJSON(prompts, outputDir = './Hasil') {
    try {
        // Buat directory jika belum ada
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputPath = path.join(outputDir, 'hasil.json');
        let existingPrompts = [];

        if (fs.existsSync(outputPath)) {
            try {
                const existingContent = await fs.promises.readFile(outputPath, 'utf-8');
                existingPrompts = JSON.parse(existingContent);
                if (!Array.isArray(existingPrompts)) {
                    existingPrompts = [];
                }
            } catch (err) {
                console.warn(`Warning: failed to read existing ${outputPath}, overwriting with new data.`);
                existingPrompts = [];
            }
        }
        
        const allPrompts = existingPrompts.concat(prompts);
        let jsonContent = '';
        
        for (let i = 0; i < allPrompts.length; i++) {
            jsonContent += JSON.stringify(allPrompts[i]);
            if (i < allPrompts.length - 1) {
                jsonContent += ',\n';
            }
        }
        
        const finalContent = '[\n' + jsonContent + '\n]';
        
        await fs.promises.writeFile(outputPath, finalContent, 'utf-8');
        console.log(`Results saved to ${outputPath}`);
        console.log(`Total prompts: ${allPrompts.length} (added ${prompts.length})`);
        
        return outputPath;
    } catch (err) {
        console.error('Error saving results:', err);
        throw err;
    }
}

/**
 * Combined function: parse data dan save ke JSON
 * @param {Object} data - Data dari getResponseStructured
 * @param {String} outputDir - Directory untuk output file
 */
async function createResultJSON(data, outputDir = './Hasil') {
    const prompts = parsePrompts(data);
    return await saveResultsToJSON(prompts, outputDir);
}

/**
 * Process semua entries dari hasil.txt dan buat hasil.json
 * @param {String} resultsFile - Path ke hasil.txt
 * @param {String} outputDir - Directory untuk output file
 */
async function processAllResults(resultsFile = './hasil.txt', outputDir = './Hasil') {
    console.log(`\nProcessing all entries from ${resultsFile}...\n`);
    
    const entries = parseResultsFile(resultsFile);
    console.log(`✓ Loaded ${entries.length} entries\n`);
    
    let allPrompts = [];
    
    // Process each entry
    for (let i = 0; i < entries.length; i++) {
        console.log(`Processing entry ${i + 1}/${entries.length}...`);
        const prompts = parsePrompts(entries[i]);
        allPrompts = allPrompts.concat(prompts);
    }
    
    console.log(`\n✓ Total prompts from all entries: ${allPrompts.length}`);
    
    // Save all prompts to single file
    return await saveResultsToJSON(allPrompts, outputDir);
}

export { parsePrompts, saveResultsToJSON, createResultJSON, parseResultsFile, processAllResults };
