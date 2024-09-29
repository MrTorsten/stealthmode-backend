const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function runScript(scriptName) {
    console.log(`Running ${scriptName}...`);
    try {
        const { stdout, stderr } = await execPromise(`node ${scriptName}`);
        console.log(stdout);
        if (stderr) console.error(stderr);
    } catch (error) {
        console.error(`Error running ${scriptName}:`, error);
        throw error;
    }
}

async function runPipeline() {
    try {
        await runScript('server.js');
        console.log('Waiting 10 minutes...');
        await new Promise(resolve => setTimeout(resolve, 600000));
        
        await runScript('data_pipeline.js');
        console.log('Waiting 10 minutes...');
        await new Promise(resolve => setTimeout(resolve, 600000));
        
        await runScript('process_search_results.js');
        console.log('Waiting 10 minutes...');
        await new Promise(resolve => setTimeout(resolve, 600000));
        
        await runScript('location_cleaner.js');
        
        console.log('Pipeline completed successfully');
    } catch (error) {
        console.error('Pipeline failed:', error);
        process.exit(1);
    }
}

runPipeline();