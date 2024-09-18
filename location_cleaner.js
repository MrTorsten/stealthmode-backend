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
            content: "Determines the region and country of a given location. " +
                     "The possible regions are: North America, Europe, Asia, Africa, LATAM, Australia. " +
                     "Return the region and the country separately in JSON format."
          },
          {
            role: "user",
            content: `Determine the region and country for this location: "${profile.location}"`
          }
        ],
        max_tokens: 50,
        temperature: 0.3,
      });

      const response = JSON.parse(completion.choices[0].message.content.trim());
      const region = response.region;
      const country = response.country;

      // Update the database with the extracted region and country
      const { error: updateError } = await supabase
        .from('processed_results')
        .update({ region: region, country: country })
        .eq('id', profile.id);

      if (updateError) {
        console.error('Error updating profile:', updateError);
      } else {
        console.log(`Updated profile ${profile.id} with region: ${region} and country: ${country}`);
      }
    } catch (err) {
      console.error('Error processing profile:', err);
      continue;
    }
  }
}

extractRegionFromLocation().catch(console.error);
