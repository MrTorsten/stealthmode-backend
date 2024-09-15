const OpenAI = require("openai");
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function extractPreviousEmployers() {
  // Fetch profiles from the database
  const { data: profiles, error } = await supabase
    .from('processed_results')
    .select('id, og_description')
    .is('employer', null);

  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }

  for (const profile of profiles) {
    if (!profile.og_description) continue;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that extracts previous employers and jobs from LinkedIn profile descriptions. " +
                   "Return the results as a comma-separated list, keeping job/employer names as short as possible. " +
                   "If you don't find any, return an empty string. Do not include 'Stealth Mode' jobs in your result. Only include real company names in the result" +
                   "Don't include adacdemic institutions. Don't include job titles (e.g. product manager, engineer)"
        },
        {
          role: "user",
          content: `Extract previous employers and jobs from this LinkedIn profile description: "${profile.og_description}"`
        }
      ],
      max_tokens: 250,
      temperature: 0.3,
    });

    const previousEmployers = completion.choices[0].message.content.trim();

    // Update the database with the extracted information
    const { error: updateError } = await supabase
      .from('processed_results')
      .update({ employer: previousEmployers })
      .eq('id', profile.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
    } else {
      console.log(`Updated profile ${profile.id} with employer: ${previousEmployers}`);
    }
  }
}

extractPreviousEmployers().catch(console.error);
