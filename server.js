const cors = require('cors');
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
const he = require('he');

const app = express();
const port = process.env.PORT || 3000;

// Supabase connection setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Enable CORS
app.use(cors());

// Function to clean text of HTML entities and tags
function cleanText(text) {
  if (!text) return ''; // Handle null or undefined input
  // Decode HTML entities
  let cleaned = he.decode(text);
  
  // Replace <br> tags with newlines
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  
  // Strip remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, '');
  
  // Trim whitespace and remove extra newlines
  cleaned = cleaned.trim().replace(/\n{3,}/g, '\n\n');
  
  return cleaned;
}

// Function to fetch search results from Google Custom Search API
async function fetchSearchResults() {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;
  const query = 'site:linkedin.com/in Stealth Copenhagen';
  const resultsPerPage = 10;
  const totalResults = 100;

  let allResults = [];

  for (let start = 1; start <= totalResults; start += resultsPerPage) {
    const url = `https://www.googleapis.com/customsearch/v1?q=${query}&key=${apiKey}&cx=${cx}&start=${start}&fields=items(title,link,snippet,pagemap)`;

    try {
      const response = await axios.get(url);
      const data = response.data;
      allResults = allResults.concat(data.items || []);
      console.log(`Fetched results ${start} to ${start + resultsPerPage - 1}`);
    } catch (error) {
      console.error(`Error fetching search results for start=${start}:`, error);
      // Continue with the next batch instead of throwing an error
    }
  }

  if (allResults.length > 0) {
    await storeResultsInSupabase({ items: allResults });
    console.log('Results stored successfully');
  } else {
    console.log('No results were fetched');
  }

  return { items: allResults };
}

// Function to extract metadata from pagemap
function extractMetadata(pagemap) {
  const metatags = pagemap?.metatags?.[0] || {};
  return {
    ogDescription: metatags['og:description'],
    ogImage: metatags['og:image'],
    profileFirstName: metatags['profile:first_name'],
    profileLastName: metatags['profile:last_name'],
  };
}

async function storeResultsInSupabase(data) {
  for (let item of data.items) {
    const metadata = extractMetadata(item.pagemap);
    const { data: upsertData, error } = await supabase
      .from('search_results')
      .upsert(
        {
          title: cleanText(item.title),
          link: item.link,
          snippet: cleanText(item.snippet),
          og_description: cleanText(metadata.ogDescription),
          og_image: metadata.ogImage,
          profile_first_name: cleanText(metadata.profileFirstName),
          profile_last_name: cleanText(metadata.profileLastName),
          updated_at: new Date().toISOString() // Set the updated_at time
        },
        { 
          onConflict: 'link',
          ignoreDuplicates: false,
          returning: 'minimal' // This improves performance for bulk upserts
        }
      );
    
    if (error) {
      console.error('Error upserting data:', error);
    } else {
      console.log('Data upserted successfully');
    }
  }
}

// Set up cron job to run once per day
cron.schedule('0 0 * * *', () => {
  console.log('Running daily job to fetch search results...');
  fetchSearchResults();
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Call it once on server start to test
fetchSearchResults();