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
      .select('link, profile_last_name, profile_first_name, og_image, og_description'); // Added og_image and og_description to the selection

    if (searchError) throw searchError;

    for (const result of searchResults) {
      // Check if a processed result already exists for this link
      const { data: existingResult, error: existingError } = await supabase
        .from('processed_results')
        .select('link')
        .eq('link', result.link);

      if (existingError) throw existingError;

      if (existingResult.length > 0) {
        // Update existing processed result
        const { data: updateData, error: updateError } = await supabase
          .from('processed_results')
          .update({
            last_name: result.profile_last_name,
            first_name: result.profile_first_name,
            og_image: result.og_image, // Added og_image to the update
            og_description: result.og_description, // Added og_description to the update
            updated_at: new Date().toISOString() // Add updated_at column
          })
          .eq('link', result.link);

        if (updateError) throw updateError;
      } else {
        // Insert new processed result
        const { data: insertData, error: insertError } = await supabase
          .from('processed_results')
          .insert({
            link: result.link,
            last_name: result.profile_last_name,
            first_name: result.profile_first_name,
            og_image: result.og_image, // Added og_image to the insert
            og_description: result.og_description, // Added og_description to the insert
            updated_at: new Date().toISOString() // Add updated_at column
          });

        if (insertError) throw insertError;
      }
    }

    console.log('Processed results updated successfully');
  } catch (error) {
    console.error('Error updating processed results:', error);
  }
}

// Call the function to update processed results
updateProcessedResults();

