// Main functionality for the Metadata Updater plugin

Zotero.MetadataUpdater = {
    updateSelectedItems: function(window) {
        // Show a progress window while updating
        let progressWindow = new Zotero.ProgressWindow();
        progressWindow.changeHeadline("Updating Metadata");
        progressWindow.addDescription("Searching online sources...");
        progressWindow.show();
        
        // Implementation of the update function
        this.updateItems(window).then(message => {
            // Show completion message
            progressWindow.close();
            
            let resultWindow = new Zotero.ProgressWindow();
            resultWindow.changeHeadline("Metadata Update Complete");
            resultWindow.addDescription(message);
            resultWindow.show();
            resultWindow.startCloseTimer(10000);
        }).catch(error => {
            Zotero.debug("Metadata Update error: " + error);
            
            progressWindow.close();
            
            let errorWindow = new Zotero.ProgressWindow();
            errorWindow.changeHeadline("Metadata Update Error");
            errorWindow.addDescription(error.toString());
            errorWindow.show();
            errorWindow.startCloseTimer(10000);
        });
    },
    
    updateItems: async function(window) {
        var zoteroPane = Zotero.getActiveZoteroPane();
        var items = zoteroPane.getSelectedItems();
        var library = zoteroPane.getSelectedLibraryID();
        
        if (items.length == 0) {
            return "No items selected";
        }
        
        var unavailableItems = [];
        var availableItems = [];
        
        const searchUrlBases = {
            dblp: {
                bibtex_route: [
                    {
                        url: "https://dblp.org/search?q=@@",
                        dom: 'li.entry .drop-down .body a[href*="?view=bibtex"]',
                        keyword_regex: { ".html?view=bibtex": ".bib" },
                    },
                ],
            },
            google_scholar: {
                bibtex_route: [
                    {
                        url: "https://scholar.google.com/scholar?q=@@/&output=cite",
                        dom: "a.gs_citi",
                        keyword_regex: {},
                    },
                ],
            },
        };
        
        // Main processing
        for (let item of items) {
            var title = String(item.getField("title"));
            if (Zotero.ItemTypes.getName(item.itemTypeID) == "computerProgram") {
                // Skip if the literature type is software
                continue;
            }
            
            for (let searchUrlBaseName in searchUrlBases) {
                try {
                    let searchUrlBase = searchUrlBases[searchUrlBaseName];
                    // Support deep search of web pages to get BibTeX links
                    let keyword = title;
                    let findError = false;
                    for (let bibtex_route of searchUrlBase.bibtex_route) {
                        let searchUrl = bibtex_route.url.replace(
                            "@@",
                            encodeURIComponent(keyword)
                        );
                        keyword = await this.findDomFromUrl(searchUrl, bibtex_route.dom);
                        if (!keyword) {
                            this.addUnavailableItem(
                                unavailableItems,
                                item,
                                "Link for " + bibtex_route.dom + " not found in " + searchUrl + "!",
                                searchUrlBaseName
                            );
                            findError = true;
                            break;
                        }
                        // Process keywords
                        let keyword_regex = bibtex_route.keyword_regex;
                        for (let regex in keyword_regex) {
                            keyword = keyword.replace(regex, keyword_regex[regex]);
                        }
                    }
                    
                    if (!keyword || findError) {
                        this.addUnavailableItem(unavailableItems, item, "BibTeX link not found!", searchUrlBaseName);
                        continue;
                    }
                    
                    // Access the BibTeX link and get the BibTeX content
                    let bibtexLink = keyword;
                    const bibtexContent = await this.getBibtexContent(bibtexLink);
                    
                    // Parse the BibTeX content using the 'BibTeX' Translator
                    var translate = new Zotero.Translate.Import();
                    translate.setString(bibtexContent);
                    translate.setTranslator("9cb70025-a888-4a29-a210-93ec52da40d4"); // BibTeX translator ID
                    let newItems = await translate.translate();
                    let parsedBibtexItem = newItems[0];
                    
                    // Check if the Zotero item's type and title match the BibTeX type
                    if ((parsedBibtexItem.getType() == item.getType()) && 
                        (parsedBibtexItem.getField("title") == item.getField("title"))) {
                        item = this.updateItem(item, parsedBibtexItem, false);
                    } else {
                        // Create a new item
                        let newItem = this.createNewItem(item, parsedBibtexItem.getType());
                        // Associate the new item with the old item
                        newItem.addRelatedItem(item);
                        // Update new item information
                        newItem = this.updateItem(newItem, parsedBibtexItem, true);
                        // Update the new item with the old item's information
                        newItem = this.updateItem(newItem, item, false);
                        // Save the new item and move attachments
                        newItem = await this.copyAttachments(newItem, item);
                        // Also associate the old item with the new item
                        item.addRelatedItem(newItem);
                        // Don't delete the old item to avoid losing other types of information
                    }
                    // Save the old item (to save updates or establish associations)
                    await item.saveTx();
                    
                    // Delete the BibTeX imported item to avoid duplication
                    await parsedBibtexItem.eraseTx();
                    
                    // Update successful
                    this.addAvailableItem(availableItems, item, searchUrlBaseName);
                } catch (error) {
                    Zotero.debug("Error updating item: " + error);
                    this.addUnavailableItem(unavailableItems, item, error, searchUrlBaseName);
                }
            }
        }
        
        // Create a response message
        let message = "";
        let availableItemsName = [];
        
        if (availableItems.length > 0) {
            message += "The following items have been successfully updated:\n";
            for (let item of availableItems) {
                message += "Source " + item[1] + " => " + item[0].getField("title") + "\n";
                availableItemsName.push(item[0].getField("title"));
            }
        }
        
        let newUnavailableItems = [];
        for (let item of unavailableItems) {
            if (availableItemsName.indexOf(item[0].getField("title")) != -1) {
                continue;
            } else {
                newUnavailableItems.push(item);
            }
        }
        
        if (newUnavailableItems.length > 0) {
            message += "\n";
            message += "The following items could not be updated, possibly due to network issues or because they are not included in the online sources:\n";
            for (let item of newUnavailableItems) {
                message +=
                    "Source " +
                    item[2] +
                    " => [ERROR " +
                    item[1].toString() +
                    "] " +
                    item[0].getField("title") +
                    "\n";
            }
        }
        
        return message;
    },
    
    // Helper functions
    fetchWithTimeout: function(url, timeout = 5000) {
        return Promise.race([
            fetch(url),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out")), timeout)
            ),
        ]);
    },
    
    getBibtexContent: async function(bibtexLink) {
        const response = await this.fetchWithTimeout(bibtexLink)
            .then(async (bibtexResponse) => {
                // Process response
                return await bibtexResponse.text();
            })
            .catch((error) => {
                // Handle error
                throw new Error("BibTeX link request failed: " + error.message);
            });
        return response;
    },
    
    findDomFromUrl: async function(url, domSelector) {
        const response = await this.fetchWithTimeout(url)
            .then(async (searchResponse) => {
                // Process response
                const searchHtml = await searchResponse.text();
                
                // Use DOMParser to parse HTML string
                const parser = new DOMParser();
                const doc = parser.parseFromString(searchHtml, "text/html");
                
                // Find the first entry's DOM link
                const firstEntryBibtexLink = doc.querySelector(domSelector);
                
                if (firstEntryBibtexLink && firstEntryBibtexLink.href) {
                    return firstEntryBibtexLink.href;
                } else {
                    return null;
                }
            })
            .catch((error) => {
                // Handle error (including timeout)
                throw new Error("Search request failed: " + error.message);
            });
        return response;
    },
    
    createNewItem: function(item, newItemTypeID) {
        let newItem = new Zotero.Item(newItemTypeID);
        // Set the new item in the same library as the old item
        newItem.setField("libraryID", item.libraryID);
        // Move the new item to the same collections as the old item
        newItem.setCollections(item.getCollections());
        return newItem;
    },
    
    updateItem: function(item, newItem, newPrior=false) {
        // if newPrior is true, then newItem's value will be prioritized
        let itemTypeID = item.getType();
        
        // Get all fields supported by this item type
        let itemTypeFields = Zotero.ItemFields.getItemTypeFields(itemTypeID);
        let fieldName, newvalue, oldvalue;
        
        for (let fieldID of itemTypeFields) {
            fieldName = Zotero.ItemFields.getName(fieldID);
            
            // Check if the new item has this field
            if (newItem.getField(fieldName)) {
                newvalue = newItem.getField(fieldName);
                if (newvalue) {
                    oldvalue = item.getField(fieldName);
                    // If the old item's value is not empty and newPrior is true, update; 
                    // if the old item's value is empty, also update.
                    if ((oldvalue && newPrior) || !oldvalue) {
                        item.setField(fieldName, newvalue);
                    }
                }
            }
        }
        
        // Special handling for author and editor fields (creators)
        let oldCreators = item.getCreators();
        let newCreators = newItem.getCreators();
        if (newPrior) {
            oldCreators = newItem.getCreators();
            newCreators = item.getCreators();
        }
        let needAddAuthor = true;
        let needAddEditor = true;
        let finalCreators = [];
        
        // Only add authors or editors from the new item to the old item if the old item doesn't have them
        for (let c of oldCreators) {
            let creatorType = Zotero.CreatorTypes.getName(c.creatorTypeID);
            if (creatorType == "author")
                needAddAuthor = false;
            else if (creatorType == "editor")
                needAddEditor = false;
            finalCreators.push(c);
        }
        
        for (let c of newCreators) {
            let creatorType = Zotero.CreatorTypes.getName(c.creatorTypeID);
            if ((creatorType == "author" && needAddAuthor) || 
                (creatorType == "editor" && needAddEditor))
                finalCreators.push(c);
        }
        
        item.setCreators(finalCreators);
        
        return item;
    },
    
    copyAttachments: async function(newItem, item) {
        // Save the new item
        let newItemID = await newItem.saveTx();
        
        // Get and move attachments
        let attachmentIDs = item.getAttachments();
        try {
            for (let attachmentID of attachmentIDs) {
                let attachment = Zotero.Items.get(attachmentID);
                // Change the attachment's parent item
                attachment.parentID = newItemID;
                await attachment.saveTx();
            }
        } catch (error) {
            throw new Error("Failed to move attachments: " + error.message);
        }
        
        await newItem.saveTx();
        
        return newItem;
    },
    
    addUnavailableItem: function(unavailableItems, item, message, searchUrlBaseName) {
        unavailableItems.push([item, message, searchUrlBaseName]);
    },
    
    addAvailableItem: function(availableItems, item, searchUrlBaseName) {
        availableItems.push([item, searchUrlBaseName]);
    }
};