const cors = require('cors');
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 3000;

// Supabase connection setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Enable CORS
app.use(cors());

// Function to fetch search results from Google Custom Search API
async function fetchSearchResults() {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;
  const query = 'site:linkedin.com/in Stealth Munich';
  const resultsPerPage = 10;
  const totalResults = 100;

  let allResults = [];

  for (let start = 1; start <= totalResults; start += resultsPerPage) {
    const url = `https://www.googleapis.com/customsearch/v1?q=${query}&key=${apiKey}&cx=${cx}&start=${start}`;

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

// Add this new endpoint to test if the API call is working
//app.get('/test-search', async (req, res) => {
  //try {
    //const results = await fetchSearchResults();
    //res.json(results);
  //} catch (error) {
    //res.status(500).json({ error: 'An error occurred while fetching search results' });
  //}
//});

// Function to upsert data into Supabase
async function storeResultsInSupabase(data) {
  for (let item of data.items) {
    const { data: upsertData, error } = await supabase
      .from('search_results')
      .upsert(
        { title: item.title, link: item.link, snippet: item.snippet },
        { onConflict: 'link', ignoreDuplicates: true }
      );
    
    if (error) {
      console.error('Error upserting data:', error);
    } else if (upsertData) {
      console.log('Data upserted successfully:', upsertData);
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