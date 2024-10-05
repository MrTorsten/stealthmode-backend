const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// List of keywords to match
const keywords = [
  'Oxford', 'Cambridge', 'Imperial College', 'WHU', 'St. Gallen', 'CDTM', 'Harvard', 'Stanford',
   'MIT', 'ETH', 'London School of Economics and Political Science', 'HEC',
    'UCL', 'Sciences Po', 'BCG', 'Boston Consulting Group', 'Bain', 'McKinsey',
     'McK', 'Palantir', 'Meta', 'Google', 'Microsoft', 'Revolut', 'Spotify',
      'AirBnb', 'Coinbase', 'Stripe', 'Snowflake', 'Uber', 'Apple', 'Serial Founder', 'Serial Entrepreneur'
];

function countKeywordMatches(text, keywordList) {
  const normalizedText = text.toLowerCase();
  let matchCount = 0;
  
  for (const keyword of keywordList) {
    const keywordPattern = keyword
      .toLowerCase()
      .split(' ')
      .map(word => `\\b${word}\\b`)
      .join('\\s+');
      
    const regex = new RegExp(keywordPattern);
    
    if (regex.test(normalizedText)) {
      matchCount++;
      if (matchCount >= 2) {
        return matchCount;
      }
    }
  }
  
  return matchCount;
}

async function processKeywordMatching() {
  try {
    // Fetch only rows where prime is NULL
    const { data: nullResults, error } = await supabase
      .from('processed_results')
      .select('id, og_description')
      .is('prime', null);

    if (error) throw error;

    console.log(`Found ${nullResults.length} profiles with NULL prime status to process.`);

    for (const result of nullResults) {
      const keywordMatchCount = countKeywordMatches(result.og_description, keywords);
      const isPrime = keywordMatchCount >= 2;

      // Update the "prime" column
      const { error: updateError } = await supabase
        .from('processed_results')
        .update({ prime: isPrime })
        .eq('id', result.id);

      if (updateError) {
        console.error(`Error updating prime status for ID ${result.id}:`, updateError);
      } else {
        console.log(`Updated prime status for ID ${result.id} to ${isPrime} (${keywordMatchCount} keywords matched)`);
      }
    }

    console.log('All NULL profiles processed successfully');
  } catch (error) {
    console.error('Error processing profiles:', error);
  }
}

module.exports = { processKeywordMatching };

if (require.main === module) {
  processKeywordMatching()
    .then(() => console.log('Processing completed'))
    .catch(error => console.error('Error:', error));
}