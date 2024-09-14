const OpenAI = require("openai");
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function processSearchResults() {
  try {
    // Fetch unprocessed results
    const { data: unprocessedResults, error } = await supabase
      .from('processed_results')
      .select('id, og_description')
      .is('processed', false);

    if (error) throw error;

    for (const result of unprocessedResults) {
      console.log(`Processing result ID: ${result.id}`);
      console.log(`OG Description: ${result.og_description}`);

      const prompt = `
        Given the LinkedIn information, extract & structure data into the categories:
        Education, Former Employers, Location, previous professional experiences or jobs & important facts. If you don't find data, please return empty string. Format location always: "City, Country". Please only provide university name (no sub-degrees or sub schools).
        
        Profile information:
          ${result.og_description}
        
        Please format your response as a JSON object with the following structure:
        {
          "education": "",
          "employer": "",
          "location": "",
          "otherExperiences": ""
        }
      `;

      const chatCompletion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-0125",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
      });

      const structuredData = JSON.parse(chatCompletion.choices[0].message.content.trim());

      // Update processed data in processed_results table
      const { data, error: updateError } = await supabase
        .from('processed_results')
        .update({
          education: structuredData.education,
          employer: structuredData.employer,
          location: structuredData.location,
          other_experiences: structuredData.otherExperiences,
          processed: true
        })
        .eq('id', result.id);

      if (updateError) throw updateError;

      console.log(`Processed and updated data for ID ${result.id}`);
    }

    console.log('All unprocessed search results processed successfully');
  } catch (error) {
    console.error('Error processing search results:', error);
  }
}

// Export the function
module.exports = { processSearchResults };

// If you want to run this script directly
if (require.main === module) {
  processSearchResults()
    .then(() => console.log('Processing completed'))
    .catch(error => console.error('Error:', error));
}
