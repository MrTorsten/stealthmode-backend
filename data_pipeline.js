const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 1000;

async function fetchSearchResults(from, to) {
    const { data, error } = await supabase
        .from('search_results')
        .select('link, profile_last_name, profile_first_name, og_image, og_description, title')
        .range(from, to);

    if (error) throw error;
    return data;
}

async function processSearchResults(searchResults, existingMap, currentTimestamp) {
    const upsertData = [];
    let unchangedCount = 0;
    const changedFields = new Set();

    searchResults.forEach(result => {
        const processedTitle = result.title.split(/[-–]/).slice(1).join('-').split('|')[0].trim();
        const processedOgDescription = result.og_description.split("Sehen Sie sich das Profil")[0].trim();
        
        const newData = {
            link: result.link,
            last_name: result.profile_last_name,
            first_name: result.profile_first_name,
            og_image: result.og_image,
            og_description: processedOgDescription,
            title: processedTitle,
            updated_at: currentTimestamp,
        };

        const existingData = existingMap.get(result.link);

        if (existingData) {
            newData.created_at = existingData.created_at;
            
            // Compare newData with existingData using JSON.stringify
            const newDataString = JSON.stringify(newData);
            const existingDataString = JSON.stringify({
                ...existingData,
                updated_at: currentTimestamp // Exclude updated_at from comparison
            });

            if (newDataString !== existingDataString) {
                upsertData.push(newData);
                for (const key in newData) {
                    if (newData[key] !== existingData[key] && key !== 'updated_at') {
                        changedFields.add(key);
                        console.log(`Change detected for link ${result.link} in field ${key}:`);
                        console.log(`  Old value: ${existingData[key]}`);
                        console.log(`  New value: ${newData[key]}`);
                    }
                }
            } else {
                unchangedCount++;
            }
        } else {
            newData.created_at = currentTimestamp;
            upsertData.push(newData);
        }
    });

    return { upsertData, unchangedCount, changedFields };
}

async function updateProcessedResults() {
    try {
        const currentTimestamp = new Date().toISOString();

        // Get existing processed results
        const { data: existingProcessedResults, error: existingError } = await supabase
            .from('processed_results')
            .select('*');

        if (existingError) throw existingError;

        const existingMap = new Map(existingProcessedResults.map(item => [item.link, item]));

        let totalUpsertData = [];
        let totalUnchangedCount = 0;
        const totalChangedFields = new Set();
        let totalProcessed = 0;

        let from = 0;
        let to = BATCH_SIZE - 1;
        
        while (true) {
            const searchResults = await fetchSearchResults(from, to);
            if (searchResults.length === 0) break;

            const { upsertData, unchangedCount, changedFields } = await processSearchResults(searchResults, existingMap, currentTimestamp);

            totalUpsertData = totalUpsertData.concat(upsertData);
            totalUnchangedCount += unchangedCount;
            changedFields.forEach(field => totalChangedFields.add(field));
            totalProcessed += searchResults.length;

            // Perform the upsert for this batch
            if (upsertData.length > 0) {
                const { error } = await supabase
                    .from('processed_results')
                    .upsert(upsertData, { 
                        onConflict: 'link',
                        ignoreDuplicates: false
                    });

                if (error) throw error;
            }

            console.log(`Processed batch: ${from} to ${to}`);
            from = to + 1;
            to = from + BATCH_SIZE - 1;
        }

        console.log(`Processing complete.`);
        console.log(`New insertions: ${totalUpsertData.filter(item => !existingMap.has(item.link)).length}`);
        console.log(`Updates to existing rows: ${totalUpsertData.filter(item => existingMap.has(item.link)).length}`);
        console.log(`Unchanged rows: ${totalUnchangedCount}`);
        console.log(`Total rows processed: ${totalProcessed}`);
        console.log(`Fields that changed: ${Array.from(totalChangedFields).join(', ')}`);

    } catch (error) {
        console.error('Error updating processed results:', error);
    }
}

updateProcessedResults();