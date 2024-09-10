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
  const query = 'site:linkedin.com/in Stealth Berlin';

  const url = `https://www.googleapis.com/customsearch/v1?q=${query}&key=${apiKey}&cx=${cx}`;

  try {
    const response = await axios.get(url);
    const data = response.data;
    await storeResultsInSupabase(data);
    console.log('Results stored successfully');
    return data;
  } catch (error) {
    console.error('Error fetching search results:', error);
    throw error;
  }
}

// Add this new endpoint to test if the API call is working
app.get('/test-search', async (req, res) => {
  try {
    const results = await fetchSearchResults();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'An error occurred while fetching search results' });
  }
});

// Function to insert data into Supabase
async function storeResultsInSupabase(data) {
  for (let item of data.items) {
    const { data: insertData, error } = await supabase
      .from('search_results')
      .insert([
        { title: item.title, link: item.link, snippet: item.snippet }
      ]);
    
    if (error) {
      console.error('Error inserting data:', error);
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