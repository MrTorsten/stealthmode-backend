const OpenAI = require("openai");
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function truncateDescription(description, maxLength = 1250) {
  return description.length > maxLength ? description.slice(0, maxLength) + '...' : description;
}

async function processSearchResults() {
  try {
    const { data: allResults, error } = await supabase
      .from('processed_results')
      .select('id, og_description, region, country')
      .is('total_score', null)
      .eq('region', 'Europe')
      .eq('country', 'Germany')
      .limit(50);  // Reduced to 10 profiles and filtered for Europe and Germany

    if (error) throw error;
    if (allResults.length === 0) {
      console.log('No unscored profiles found in Germany. All German profiles have been processed.');
      return;
    }

    console.log(`Found ${allResults.length} unscored profiles in Germany to process.`);

    const batchedProfiles = allResults.map(result => ({
      id: result.id,
      description: truncateDescription(result.og_description)
    }));

    const prompt = `
Analyze the following LinkedIn profiles and score likelihood of startup success (0-100) in the categories:
1. Previous Entrepreneurial Success (co-founder of a startup, exits, acquisitions, sold companies)
3. Elite Educational Background (e.g. Standford, Harvard or other elite unis, overindex on STEM degrees, applied science unis score lower)
4. Previous high profile job (e.g. Goldman Sachs, McKinsey, BCG, Palantir, BigTech; if no high profile job, score lower, don't consider stealth mode jobs)

Provide brief reasons for scores. Format your response as a valid JSON array of objects:

[
  {
    "id": "profile_id",
    "scores": {
      "previous_entrepreneurial_success": 0,
      "educational_background": 0,
      "work_experience": 0
    },
    "reasons": {
      "previous_entrepreneurial_success": "",
      "educational_background": "",
      "work_experience": ""
    }
  }
]

Profiles to evaluate:
${JSON.stringify(batchedProfiles)}
`;

console.log("Sending request to OpenAI API...");
const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "user", content: prompt }
  ],
  max_tokens: 9999,
  temperature: 0.3,
});

console.log("Received response from OpenAI API.");
console.log(`Token usage: ${completion.usage.total_tokens} tokens consumed.`);

let scoringResults;
try {
  let content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No content returned from the model.");
  }

  // Remove possible markdown backticks (```json ... ```) from the response
  content = content.replace(/```json|```/g, '').trim();

  // Parse the cleaned content as JSON
  scoringResults = JSON.parse(content);
  console.log("Successfully parsed API response.");
} catch (parseError) {
  console.error("Error parsing JSON:", parseError);
  console.log("Attempted to parse:", completion.choices[0]?.message?.content);
  return;
}

if (!Array.isArray(scoringResults) || scoringResults.length === 0) {
  console.error("Unexpected response format or empty results.");
  return;
}

console.log(`Parsed ${scoringResults.length} results from API response.`);

    const weights = {
      previous_entrepreneurial_success: 0.4,
      educational_background: 0.3,
      work_experience: 0.3
    };

    // Fetch all existing scores for normalization
    const { data: existingScores, error: fetchError } = await supabase
      .from('processed_results')
      .select('id, total_score')
      .not('total_score', 'is', null);

    if (fetchError) {
      console.error('Error fetching existing scores:', fetchError);
      return;
    }

    // Calculate percentiles for normalization
    const allScores = existingScores.map(score => score.total_score);
    const getPercentile = (score) => {
      const count = allScores.filter(s => s <= score).length;
      return (count / allScores.length) * 100;
    };

    for (const result of scoringResults) {
      if (!result.id || !result.scores || !result.reasons) {
        console.error("Malformed result object:", result);
        continue;
      }

      let rawTotalScore = 0;
      for (const [category, weight] of Object.entries(weights)) {
        rawTotalScore += (result.scores[category] || 0) * weight;
      }
      rawTotalScore = parseFloat(rawTotalScore.toFixed(2));

      // Normalize the score
      const normalizedScore = getPercentile(rawTotalScore);

      const scoringReason = Object.entries(result.scores).map(([category, score]) => 
        `${category.replace(/_/g, ' ')}: ${score}/100 - ${result.reasons[category] || 'No reason provided'}`
      ).join('\n');

      console.log(`Updating database for ID ${result.id}...`);
      const { data, error: updateError } = await supabase
        .from('processed_results')
        .update({
          scoring_reason: scoringReason,
          raw_total_score: rawTotalScore,
          total_score: normalizedScore
        })
        .eq('id', result.id);

      if (updateError) {
        console.error(`Error updating database for ID ${result.id}:`, updateError);
      } else {
        console.log(`Successfully updated scoring for ID ${result.id} with normalized score: ${normalizedScore}`);
        console.log(`Update result:`, data);
      }
    }

    console.log('All unscored search results in Germany processed successfully');
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