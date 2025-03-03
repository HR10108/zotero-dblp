/**
 * CCF Column Display for Zotero
 * Adds a column to display CCF rankings
 */

Zotero.CCFColumnDisplay = {
    // Column ID for the CCF rank
    COLUMN_ID: "ccfRank",
    
    init: function() {
        // Register the column definition
        this.registerColumn();
        
        // Register event listeners to update the column when necessary
        this.registerEventListeners();
    },
    
    registerColumn: function() {
        try {
            // Register the column with Zotero
            const treeviewManager = Zotero.getMainWindow().ZoteroPane.itemsView;
            
            if (!treeviewManager) {
                Zotero.debug("CCF Column Display: TreeView not available yet, waiting...");
                // Wait and try again after a short delay
                setTimeout(() => this.registerColumn(), 1000);
                return;
            }
            
            // Check if our column is already registered
            const columns = treeviewManager.getColumns();
            if (columns.some(col => col.id === this.COLUMN_ID)) {
                Zotero.debug("CCF Column Display: Column already registered");
                return;
            }
            
            // Define our custom column
            const ccfColumn = {
                dataKey: this.COLUMN_ID,
                id: this.COLUMN_ID,
                label: "CCF Rank",
                width: 60,
                iconPath: "",
                sortKey: "",
                primaryField: "title",
                itemTypes: ["journalArticle", "conferencePaper", "book", "bookSection"],
                // Function to get the cell text for this column
                getCellText: (item) => this.getCCFRank(item)
            };
            
            // Register the column
            treeviewManager.registerColumn(ccfColumn);
            
            Zotero.debug("CCF Column Display: Column registered successfully");
        } catch (error) {
            Zotero.debug("CCF Column Display: Error registering column: " + error);
        }
    },
    
    registerEventListeners: function() {
        // Listen for library load events to re-register the column
        const notifierCallback = {
            notify: (event, type, ids, extraData) => {
                if (type === "collection" && event === "select") {
                    this.registerColumn();
                }
            }
        };
        
        // Register with Zotero's notifier system
        Zotero.Notifier.registerObserver(notifierCallback, ["collection"], "ccf-column");
    },
    
    getCCFRank: function(item) {
        if (!item) return "";
        
        // Check item tags for CCF rank
        const tags = item.getTags();
        for (const tag of tags) {
            if (tag.tag.startsWith("CCF-")) {
                return tag.tag.replace("CCF-", "");
            }
        }
        
        // If not found in tags, check the extra field
        const extraField = item.getField("extra") || "";
        const ccfRankMatch = extraField.match(/CCF-Rank:\s*([A-C])/i);
        
        if (ccfRankMatch && ccfRankMatch[1]) {
            return ccfRankMatch[1];
        }
        
        return "";
    }
};