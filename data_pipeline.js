// Add this import at the top of your file
const { createClient } = require('@supabase/supabase-js'); // Ensure you have the correct package installed

require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL; // Ensure this line is declared only once
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function updateProcessedResults() {
    try {
      // Fetch all search results
      const { data: searchResults, error: searchError } = await supabase
        .from('search_results')
        .select('link, profile_last_name, profile_first_name, og_image, og_description'); 
  
      if (searchError) throw searchError;
  
      const upsertData = searchResults.map(result => ({
        link: result.link,
        last_name: result.profile_last_name,
        first_name: result.profile_first_name,
        og_image: result.og_image, 
        og_description: result.og_description, 
        updated_at: new Date().toISOString(),
        processed: true // Set the "processed" column to "TRUE"
      }));
  
      // Use upsert instead of checking manually
      const { data, error } = await supabase
        .from('processed_results')
        .upsert(upsertData, { onConflict: 'link' }); // Ensure 'link' is a unique constraint in your table
  
      if (error) throw error;
  
      console.log('Processed results updated successfully');
    } catch (error) {
      console.error('Error updating processed results:', error);
    }
  }

// Call the function to update processed results
updateProcessedResults();

