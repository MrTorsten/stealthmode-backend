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

async function processSearchResults(deactivateOpenAI = true) {
  try {
    // First, fetch all processed links
    const { data: processedLinks, error: processedError } = await supabase
      .from('processed_results')
      .select('link');

    if (processedError) throw processedError;

    const processedLinkSet = new Set(processedLinks.map(item => item.link));

    // Now fetch all search results
    const { data: allSearchResults, error } = await supabase
      .from('search_results')
      .select('og_description, title');

    if (error) throw error;
    // Filter out the processed links
    const searchResults = allSearchResults.filter(result => !processedLinkSet.has(result.link));

    for (const result of searchResults) {
      if (!deactivateOpenAI) {
        const prompt = `
          Given the LinkedIn information, extract & structure data into the categories:
          Education, Former Employers, Location, previous professional experiences & important facts, Number of LinkedIn connections. If you don't find data, please return empty string. Format location always: "City, Country". Please only provide university name (no sub-degrees or sub schools).
          
          Profile information:
          ${result.title}
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

        console.log(chatCompletion.choices[0].message.content.trim());
        console.log(chatCompletion);
      }

      // Insert processed data into processed_results table
      const { data, error: insertError } = await supabase
        .from('processed_results')
        .insert({
          link: result.link,
          education: structuredData.education,
          employer: structuredData.employer,
          location: structuredData.location,
          other_experiences: structuredData.otherExperiences
        });

      if (insertError) throw insertError;

      console.log(`Processed and inserted data for ${result.link}`);
    }

    console.log('All search results processed successfully');
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
