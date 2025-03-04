/**
 * CCF Rank Detector Module for Zotero Metadata Updater
 * Detects if a publication venue is in the CCF recommended list and its rank
 */

var ccf = ccf || {};

Zotero.CCFRankDetector = {
    init: async function () {
        try {
            // Load CCF data if not already loaded
            if (!ccf.rankFullName || !ccf.rankAbbrName || !ccf.fullUrl || !ccf.rankUrl || !ccf.abbrFull) {
                await this.loadCCFData();
            }

            Zotero.debug("CCF Rank Detector: Initialized successfully");
        } catch (error) {
            Zotero.debug("CCF Rank Detector: Initialization error: " + error);
            throw new Error("Failed to initialize CCF ranking data: " + error.message);
        }
    },

    loadCCFData: async function () {
        try {
            // Load the CCF data files
            const scriptLoader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                .getService(Components.interfaces.mozIJSSubScriptLoader);

            // Load all the CCF data JavaScript files
            scriptLoader.loadSubScript(Zotero.MetadataUpdater.rootURI + "content/ccfRankFull.js");
            scriptLoader.loadSubScript(Zotero.MetadataUpdater.rootURI + "content/ccfRankAbbr.js");
            scriptLoader.loadSubScript(Zotero.MetadataUpdater.rootURI + "content/ccfRankUrl.js");
            scriptLoader.loadSubScript(Zotero.MetadataUpdater.rootURI + "content/ccfFullUrl.js");
            scriptLoader.loadSubScript(Zotero.MetadataUpdater.rootURI + "content/ccfAbbrFull.js");
            scriptLoader.loadSubScript(Zotero.MetadataUpdater.rootURI + "content/ccfRankDb.js");

            Zotero.debug("CCF Rank Detector: Data loaded successfully");
        } catch (error) {
            Zotero.debug("CCF Rank Detector: Error loading CCF data: " + error);
            throw new Error("Failed to load CCF ranking data: " + error.message);
        }
    },

    detectRank: function (item) {
        let rank = null;
        let publicationName = null;

        try {
            // Initialize if not already initialized
            if (!ccf.rankFullName) {
                this.init();
            }

            // Try to get publication venue information
            // First check if it's a conference paper
            const itemType = Zotero.ItemTypes.getName(item.itemTypeID);

            if (itemType === "conferencePaper") {
                publicationName = item.getField("conferenceName");
                // Also check for proceedingsTitle as a fallback
                if (!publicationName) {
                    publicationName = item.getField("proceedingsTitle");
                }
            } else if (itemType === "journalArticle") {
                publicationName = item.getField("publicationTitle");
            }

            if (!publicationName) {
                Zotero.debug("CCF Rank Detector: No publication venue found for item: " + item.getField("title"));
                return null;
            }

            // Try to match with CCF data
            rank = this.findRankByName(publicationName);

            // If we couldn't find by full name, try to parse for abbreviations
            if (!rank) {
                rank = this.findRankByAbbreviation(publicationName);
            }

            if (rank) {
                Zotero.debug(`CCF Rank Detector: Found rank ${rank.rank} for ${publicationName}`);
            } else {
                Zotero.debug(`CCF Rank Detector: No rank found for ${publicationName}`);
            }

            return rank;
        } catch (error) {
            Zotero.debug("CCF Rank Detector: Error detecting rank: " + error);
            return null;
        }
    },

    findRankByName: function (publicationName) {
        // Normalize the name to uppercase for comparison
        const normalizedName = publicationName.toUpperCase();

        // Try exact match first
        if (ccf.fullUrl[normalizedName]) {
            const url = ccf.fullUrl[normalizedName];
            return {
                rank: ccf.rankUrl[url],
                name: publicationName,
                url: url
            };
        }

        // Try partial matching for conference names which may include year or location
        for (const fullName in ccf.fullUrl) {
            if (normalizedName.includes(fullName) || fullName.includes(normalizedName)) {
                const url = ccf.fullUrl[fullName];
                return {
                    rank: ccf.rankUrl[url],
                    name: fullName,
                    url: url
                };
            }
        }

        return null;
    },

    findRankByAbbreviation: function (publicationName) {
        // Try to extract possible abbreviations from the publication name
        const possibleAbbrs = this.extractAbbreviations(publicationName);

        for (const abbr of possibleAbbrs) {
            if (ccf.abbrFull[abbr]) {
                const fullName = ccf.abbrFull[abbr];
                const url = ccf.fullUrl[fullName];
                if (url && ccf.rankUrl[url]) {
                    return {
                        rank: ccf.rankUrl[url],
                        name: fullName,
                        abbreviation: abbr,
                        url: url
                    };
                }
            }
        }

        return null;
    },

    extractAbbreviations: function (text) {
        // Extract potential abbreviations from the text
        // This is a simple implementation that looks for uppercase words or words in parentheses
        const abbreviations = [];

        // Match standalone uppercase words (potential abbreviations)
        const upperCaseMatches = text.match(/\b[A-Z]{2,}(?:\s*\d{4})?\b/g);
        if (upperCaseMatches) {
            abbreviations.push(...upperCaseMatches);
        }

        // Match text in parentheses that could be abbreviations
        const parenthesesMatches = text.match(/\(([^)]+)\)/g);
        if (parenthesesMatches) {
            parenthesesMatches.forEach(match => {
                // Remove the parentheses
                const content = match.slice(1, -1);
                // Check if it looks like an abbreviation (all caps, or contains caps with spaces/hyphens)
                if (/^[A-Z0-9\s\-]+$/.test(content)) {
                    abbreviations.push(content);
                }
            });
        }

        return abbreviations;
    },

    // Add CCF rank information to the item (only in Extra field, no tag)
    addRankToItem: function (item, rankInfo) {
        if (!rankInfo) return item;

        try {
            // Store CCF data in extra field for column display
            let extraField = item.getField("extra") || "";

            // Check if we already have CCF info in the extra field
            if (!extraField.includes("CCF-Rank:")) {
                if (extraField && !extraField.endsWith("\n")) {
                    extraField += "\n";
                }
                extraField += "CCF-Rank: " + rankInfo.rank + "\n";
                extraField += "CCF-Venue: " + rankInfo.name + "\n";

                if (rankInfo.abbreviation) {
                    extraField += "CCF-Abbreviation: " + rankInfo.abbreviation + "\n";
                }

                item.setField("extra", extraField);
                Zotero.debug(`CCF Rank Detector: Added rank ${rankInfo.rank} to item "${item.getField('title')}"`);
            }
        } catch (error) {
            Zotero.debug("CCF Rank Detector: Error adding CCF rank to item: " + error);
        }

        return item;
    }
};