const OpenAI = require("openai");
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function truncateDescription(description, maxLength = 500) {
  return description.length > maxLength ? description.slice(0, maxLength) + '...' : description;
}

async function processSearchResults() {
  try {
    const { data: allResults, error } = await supabase
      .from('processed_results')
      .select('id, og_description')
      .is('total_score', null)
      .limit(20);  // Process 3 profiles at a time

    if (error) throw error;
    if (allResults.length === 0) {
      console.log('No unscored profiles found. All profiles have been processed.');
      return;
    }

    console.log(`Found ${allResults.length} unscored profiles to process.`);

    const batchedProfiles = allResults.map(result => ({
      id: result.id,
      description: truncateDescription(result.og_description)
    }));

    const prompt = `
Analyze the following LinkedIn profiles and score the likelihood of startup success (0-100) in these categories:
1. Previous Entrepreneurial Success
2. Championships Won
3. Educational Background
4. Work Experience

Provide brief reasons for scores. Format your response as a valid JSON array of objects:

[
  {
    "id": "profile_id",
    "scores": {
      "previous_entrepreneurial_success": 0,
      "championships_won": 0,
      "educational_background": 0,
      "work_experience": 0
    },
    "reasons": {
      "previous_entrepreneurial_success": "",
      "championships_won": "",
      "educational_background": "",
      "work_experience": ""
    }
  }
]

Profiles to evaluate:
${JSON.stringify(batchedProfiles)}
`;

    console.log("Sending request to OpenAI API...");
    const completion = await openai.completions.create({
      model: "gpt-3.5-turbo-instruct",
      prompt: prompt,
      max_tokens: 1500,
      temperature: 0.7,
    });

    console.log("Received response from OpenAI API.");
    console.log("Token usage:", JSON.stringify(completion.usage, null, 2));

    let scoringResults;
    try {
      scoringResults = JSON.parse(completion.choices[0].text);
      console.log("Successfully parsed API response.");
    } catch (parseError) {
      console.error("Error parsing JSON:", parseError);
      console.log("Attempted to parse:", completion.choices[0].text);
      return;
    }

    if (!Array.isArray(scoringResults) || scoringResults.length === 0) {
      console.error("Unexpected response format or empty results.");
      return;
    }

    console.log(`Parsed ${scoringResults.length} results from API response.`);

    const weights = {
      previous_entrepreneurial_success: 0.4,
      championships_won: 0.3,
      educational_background: 0.2,
      work_experience: 0.1
    };

    for (const result of scoringResults) {
      if (!result.id || !result.scores || !result.reasons) {
        console.error("Malformed result object:", result);
        continue;
      }

      let totalScore = 0;
      for (const [category, weight] of Object.entries(weights)) {
        totalScore += (result.scores[category] || 0) * weight;
      }
      totalScore = parseFloat(totalScore.toFixed(2));

      const scoringReason = Object.entries(result.scores).map(([category, score]) => 
        `${category.replace(/_/g, ' ')}: ${score}/100 - ${result.reasons[category] || 'No reason provided'}`
      ).join('\n');

      console.log(`Updating database for ID ${result.id}...`);
      const { data, error: updateError } = await supabase
        .from('processed_results')
        .update({
          scoring_reason: scoringReason,
          total_score: totalScore
        })
        .eq('id', result.id);

      if (updateError) {
        console.error(`Error updating database for ID ${result.id}:`, updateError);
      } else {
        console.log(`Successfully updated scoring for ID ${result.id} with total score: ${totalScore}`);
        console.log(`Update result:`, data);
      }
    }

    console.log('All unscored search results processed successfully');
  } catch (error) {
    console.error('Error processing search results:', error);
  }
}

module.exports = { processSearchResults };

if (require.main === module) {
  processSearchResults()
    .then(() => console.log('Processing completed'))
    .catch(error => console.error('Error:', error));
}