const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// List of keywords to match
const keywords = [
  'Oxford', 'Cambridge', 'Imperial College', 'WHU', 'CDTM', 'Harvard', 'Stanford',
   'MIT', 'ETH', 'London School of Economics and Political Science', 'LSE', 'HEC',
    'UCL', 'Sciences Po', 'BCG', 'Boston Consulting Group', 'Bain', 'McKinsey',
     'McK', 'Palantir', 'Meta', 'Google', 'Microsoft', 'Revolut', 'Spotify',
      'AirBnb', 'Coinbase', 'Stripe', 'Snowflake', 'Uber', 'Apple', 'Serial Founder', 'Serial Entrepreneur'
];

async function processKeywordMatching() {
  try {
    // Fetch all rows from the table
    const { data: allResults, error } = await supabase
      .from('processed_results')
      .select('id, og_description');

    if (error) throw error;

    console.log(`Found ${allResults.length} profiles to process.`);

    for (const result of allResults) {
      const description = result.og_description.toLowerCase();
      const isPrime = keywords.some(keyword => description.includes(keyword.toLowerCase()));

      // Update the "prime" column
      const { error: updateError } = await supabase
        .from('processed_results')
        .update({ prime: isPrime })
        .eq('id', result.id);

      if (updateError) {
        console.error(`Error updating prime status for ID ${result.id}:`, updateError);
      } else {
        console.log(`Updated prime status for ID ${result.id} to ${isPrime}`);
      }
    }

    console.log('All profiles processed successfully');
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