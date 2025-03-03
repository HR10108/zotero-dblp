/**
 * Script to generate CCF ranking data files from dataGen.js
 * 
 * This creates the necessary JavaScript files for CCF rank detection:
 * - ccfRankAbbr.js
 * - ccfRankFull.js
 * - ccfRankDb.js
 * - ccfRankUrl.js
 * - ccfFullUrl.js
 * - ccfAbbrFull.js
 *
 * Run this script with Node.js after installing the plugin to generate the data files.
 */

// Run the dataGen.js script to generate the files
// Make sure to place the generated files in the content directory of your plugin

console.log("Generating CCF data files...");
console.log("Please make sure dataGen.js is in the same directory.");

// Load and run dataGen.js
try {
    require('./dataGen.js');
    console.log("CCF data files generated successfully!");
    console.log("Please move the following files to your plugin's content directory:");
    console.log("- ccfRankAbbr.js");
    console.log("- ccfRankFull.js");
    console.log("- ccfRankDb.js");
    console.log("- ccfRankUrl.js");
    console.log("- ccfFullUrl.js");
    console.log("- ccfAbbrFull.js");
} catch (error) {
    console.error("Error generating CCF data files:", error);
}