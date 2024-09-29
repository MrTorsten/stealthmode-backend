const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function updateProcessedResults() {
    try {
        const { data: searchResults, error: searchError } = await supabase
            .from('search_results')
            .select('link, profile_last_name, profile_first_name, og_image, og_description, title');

        if (searchError) throw searchError;

        const currentTimestamp = new Date().toISOString();

        // Get existing processed results
        const { data: existingProcessedResults, error: existingError } = await supabase
            .from('processed_results')
            .select('*');

        if (existingError) throw existingError;

        const existingMap = new Map(existingProcessedResults.map(item => [item.link, item]));

        const upsertData = [];
        let unchangedCount = 0;  // Changed to let
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
                let isChanged = false;
                
                for (const [key, value] of Object.entries(newData)) {
                    if (key !== 'updated_at' && value !== existingData[key]) {
                        isChanged = true;
                        changedFields.add(key);
                        console.log(`Change detected for link ${result.link} in field ${key}:`);
                        console.log(`  Old value: ${existingData[key]}`);
                        console.log(`  New value: ${value}`);
                    }
                }

                if (isChanged) {
                    upsertData.push(newData);
                } else {
                    unchangedCount++;
                }
            } else {
                newData.created_at = currentTimestamp;
                upsertData.push(newData);
            }
        });

        // Perform the upsert only if there are changes
        if (upsertData.length > 0) {
            const { data, error } = await supabase
                .from('processed_results')
                .upsert(upsertData, { 
                    onConflict: 'link',
                    ignoreDuplicates: false
                });

            if (error) throw error;
        }

        console.log(`Processing complete.`);
        console.log(`New insertions: ${upsertData.filter(item => !existingMap.has(item.link)).length}`);
        console.log(`Updates to existing rows: ${upsertData.filter(item => existingMap.has(item.link)).length}`);
        console.log(`Unchanged rows: ${unchangedCount}`);
        console.log(`Total rows processed: ${searchResults.length}`);
        console.log(`Fields that changed: ${Array.from(changedFields).join(', ')}`);

    } catch (error) {
        console.error('Error updating processed results:', error);
    }
}

updateProcessedResults();