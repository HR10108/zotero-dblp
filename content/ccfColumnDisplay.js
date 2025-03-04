/**
 * CCF Column Display for Zotero
 * Adds a column to display CCF rankings using modern Zotero 7 API
 */

Zotero.CCFColumnDisplay = {
    // Column ID for the CCF rank
    COLUMN_ID: "ccfRank",

    init: function () {
        try {
            Zotero.debug("CCF Column Display: Initializing with modern API");

            // Register the column definition
            this.registerColumn();

            Zotero.debug("CCF Column Display: Initialization complete");
        } catch (error) {
            Zotero.debug("CCF Column Display: Error during initialization: " + error);
        }
    },

    registerColumn: async function () {
        try {
            // Check if the modern API is available
            if (typeof Zotero.ItemTreeManager !== 'undefined' &&
                typeof Zotero.ItemTreeManager.registerColumns === 'function') {

                Zotero.debug("CCF Column Display: Using modern API for column registration");

                // Register column using modern API
                await Zotero.ItemTreeManager.registerColumns([
                    {
                        dataKey: this.COLUMN_ID,
                        label: "CCF Rank",
                        pluginID: "metadata-updater@zotero.example.org", // Match your manifest ID
                        dataProvider: (item, dataKey) => {
                            // Extract CCF rank from the extra field
                            if (item && item.getField) {
                                const extraField = item.getField("extra") || "";
                                const ccfRankMatch = extraField.match(/CCF-Rank:\s*([A-C])/i);

                                if (ccfRankMatch && ccfRankMatch[1]) {
                                    return ccfRankMatch[1];
                                }
                            }
                            return "";
                        }
                    }
                ]);

                Zotero.debug("CCF Column Display: Modern column registration successful");

            } else {
                Zotero.debug("CCF Column Display: Modern API not available, falling back to legacy method");

                // Fall back to legacy method
                this.registerColumnLegacy();
            }
        } catch (error) {
            Zotero.debug("CCF Column Display: Error registering column with modern API: " + error);

            // Try the legacy method as fallback
            this.registerColumnLegacy();
        }
    },

    // Legacy method for column registration (fallback)
    registerColumnLegacy: function () {
        try {
            // Get the main Zotero window
            const mainWindow = Zotero.getMainWindow();
            if (!mainWindow) {
                Zotero.debug("CCF Column Display: Main window not available, retrying in 1 second");
                setTimeout(() => this.registerColumnLegacy(), 1000);
                return;
            }

            // Get the itemsView from the ZoteroPane
            const ZoteroPane = mainWindow.ZoteroPane;
            if (!ZoteroPane || !ZoteroPane.itemsView) {
                Zotero.debug("CCF Column Display: ZoteroPane or itemsView not available, retrying in 1 second");
                setTimeout(() => this.registerColumnLegacy(), 1000);
                return;
            }

            const itemsView = ZoteroPane.itemsView;

            // Check if our column is already registered
            const columns = itemsView.getColumns();
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
                fixedWidth: true,
                iconPath: "",
                sortKey: "",
                primaryField: "title",
                itemTypes: ["journalArticle", "conferencePaper", "book", "bookSection"],
                // Function to get the cell text for this column
                getCellText: (item) => this.getCCFRank(item)
            };

            // Register the column
            itemsView.registerColumn(ccfColumn);

            // Make the column visible by default if it's not already in the columns list
            const visibleColumns = itemsView.getVisibleColumns();
            if (!visibleColumns.includes(this.COLUMN_ID)) {
                visibleColumns.push(this.COLUMN_ID);
                itemsView.setVisibleColumns(visibleColumns);
            }

            Zotero.debug("CCF Column Display: Legacy column registration successful");
        } catch (error) {
            Zotero.debug("CCF Column Display: Error registering column with legacy method: " + error);
            // Retry after a delay in case of error
            setTimeout(() => this.registerColumnLegacy(), 2000);
        }
    },

    getCCFRank: function (item) {
        if (!item) return "";

        try {
            // Extract CCF rank from the extra field
            const extraField = item.getField("extra") || "";
            const ccfRankMatch = extraField.match(/CCF-Rank:\s*([A-C])/i);

            if (ccfRankMatch && ccfRankMatch[1]) {
                return ccfRankMatch[1];
            }
        } catch (error) {
            Zotero.debug("CCF Column Display: Error getting CCF rank for item: " + error);
        }

        return "";
    },

    // Helper method to refresh the column after updates
    refreshColumn: function () {
        try {
            const mainWindow = Zotero.getMainWindow();
            if (!mainWindow || !mainWindow.ZoteroPane || !mainWindow.ZoteroPane.itemsView) {
                return;
            }

            mainWindow.ZoteroPane.itemsView.refresh();
            Zotero.debug("CCF Column Display: Column refreshed");
        } catch (error) {
            Zotero.debug("CCF Column Display: Error refreshing column: " + error);
        }
    }
};