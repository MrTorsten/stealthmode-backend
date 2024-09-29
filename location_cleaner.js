const OpenAI = require("openai");
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function extractRegionFromLocation() {
  // Fetch profiles from the database where region and country are null
  const { data: profiles, error } = await supabase
    .from('processed_results')
    .select('id, location')
    .is('region', null)
    .is('country', null);

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  for (const profile of profiles) {
    if (!profile.location) continue;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a system that returns the region and country of a given location in valid JSON format. " +
                     "The possible regions are: North America, Europe, Asia, Africa, LATAM, Australia. " +
                     "Only respond in this format: {\"region\": \"<region>\", \"country\": \"<country>\"}."
          },
          {
            role: "user",
            content: `Determine the region and country for this location: "${profile.location}"`
          }
        ],
        max_tokens: 100,
        temperature: 0.3,
      });

      let responseText = completion.choices[0].message.content.trim();

      // Try parsing the response as JSON
      let response;
      try {
        response = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`Failed to parse JSON for profile ${profile.id}. Response: ${responseText}`);
        continue; // Skip this profile and move to the next
      }

      const { region, country } = response;

      // Update the database with the extracted region and country
      const { error: updateError } = await supabase
        .from('processed_results')
        .update({ region, country })
        .eq('id', profile.id);

      if (updateError) {
        console.error('Error updating profile:', updateError);
      } else {
        console.log(`Updated profile ${profile.id} with region: ${region} and country: ${country}`);
      }
    } catch (err) {
      console.error(`Error processing profile ${profile.id}:`, err);
      continue;
    }
  }
}

extractRegionFromLocation().catch(console.error);