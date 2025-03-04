// Main bootstrap.js file for the Zotero 7 Metadata Updater plugin

var chromeHandle;

// Plugin lifecycle hooks
function startup({ id, version, rootURI }, reason) {
    // Make sure Zotero is loaded
    if (typeof Zotero === 'undefined') {
        if (Services.appinfo.ID === "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}") {
            // Firefox
            const { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");
            setTimeout(function () { startup({ id, version, rootURI }, reason); }, 500);
            return;
        }
        const { Services: cServices } = ChromeUtils.import("resource://gre/modules/Services.jsm");
        let windows = cServices.wm.getEnumerator('navigator:browser');
        let found = false;
        while (windows.hasMoreElements()) {
            let win = windows.getNext();
            if (win.Zotero) {
                Zotero = win.Zotero;
                found = true;
                break;
            }
        }
        if (!found) {
            const { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");
            setTimeout(function () { startup({ id, version, rootURI }, reason); }, 500);
            return;
        }
    }

    // Import required modules
    Components.utils.import("resource://gre/modules/Services.jsm");

    // Register the resource URI
    var aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
        .getService(Components.interfaces.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
        ["content", "metadata-updater", "content/"]
    ]);

    // Store rootURI for later use
    Zotero.MetadataUpdater = Zotero.MetadataUpdater || {};
    Zotero.MetadataUpdater.rootURI = rootURI;

    // Load main scripts
    try {
        Services.scriptloader.loadSubScript(rootURI + "content/metadata-updater.js");
        Zotero.debug("Metadata Updater: main script loaded");
    } catch (error) {
        Zotero.debug("Metadata Updater: Error loading main script: " + error);
    }

    // Load CCF related scripts
    try {
        Services.scriptloader.loadSubScript(rootURI + "content/ccfRankDetector.js");
        Zotero.debug("Metadata Updater: CCF Rank Detector script loaded");
    } catch (error) {
        Zotero.debug("Metadata Updater: Error loading CCF Rank Detector script: " + error);
    }

    try {
        Services.scriptloader.loadSubScript(rootURI + "content/ccfColumnDisplay.js");
        Zotero.debug("Metadata Updater: CCF Column Display script loaded");
    } catch (error) {
        Zotero.debug("Metadata Updater: Error loading CCF Column Display script: " + error);
    }

    // Wait for Zotero to be fully initialized before adding menu items
    if (reason === Components.interfaces.amIAddonManagerStartup.APP_STARTUP) {
        Services.obs.addObserver(function observer(subject, topic, data) {
            Services.obs.removeObserver(observer, topic);
            onZoteroReady();
        }, "zotero-loaded");
    } else {
        onZoteroReady();
    }
}

function onZoteroReady() {
    // Wait for a window to be available
    let windows = Zotero.getMainWindows();
    if (!windows.length) {
        // Wait for a window to open
        Services.obs.addObserver(function observer(subject, topic, data) {
            Services.obs.removeObserver(observer, topic);
            initializePlugin();
        }, "zotero-window-loaded");
    } else {
        initializePlugin();
    }
}

function initializePlugin() {
    // Add the right-click menu item
    addRightClickMenuItem();

    // Initialize CCF Column Display
    try {
        Zotero.debug("Initializing CCF Column Display");
        if (Zotero.CCFColumnDisplay && typeof Zotero.CCFColumnDisplay.init === 'function') {
            Zotero.CCFColumnDisplay.init();
        } else {
            Zotero.debug("CCF Column Display not available or init method missing");
        }
    } catch (error) {
        Zotero.debug("Error initializing CCF Column Display: " + error);
    }

    // Initialize CCF Rank Detector at startup
    try {
        Zotero.debug("Initializing CCF Rank Detector");
        if (Zotero.CCFRankDetector && typeof Zotero.CCFRankDetector.init === 'function') {
            Zotero.CCFRankDetector.init();
        } else {
            Zotero.debug("CCF Rank Detector not available or init method missing");
        }
    } catch (error) {
        Zotero.debug("Error initializing CCF Rank Detector: " + error);
    }

    // Register a notifier to handle window changes
    registerWindowNotifier();
}

function shutdown({ id, version, rootURI }, reason) {
    // Remove the right-click menu item
    removeRightClickMenuItem();

    // Clean up
    if (chromeHandle) {
        chromeHandle.destruct();
        chromeHandle = null;
    }

    // Clear any references
    Zotero.MetadataUpdater = null;
    Zotero.CCFColumnDisplay = null;
    Zotero.CCFRankDetector = null;
}

function install(data, reason) {
    // Nothing specific needed for install
}

function uninstall(data, reason) {
    // Nothing specific needed for uninstall
}

// Register notifier for window changes
function registerWindowNotifier() {
    // Listen for window load events
    Services.obs.addObserver({
        observe: function (subject, topic, data) {
            if (topic === "zotero-window-loaded") {
                onMainWindowLoad({ window: subject });
            }
        }
    }, "zotero-window-loaded");
}

// Window hooks
function onMainWindowLoad({ window }) {
    // Ensure the menu item is added when a new window is created
    addRightClickMenuItem(window);

    // Initialize CCF Column Display in new window
    if (Zotero.CCFColumnDisplay && typeof Zotero.CCFColumnDisplay.init === 'function') {
        Zotero.CCFColumnDisplay.init();
    }
}

// Helper function to add the menu item to the right-click context menu
function addRightClickMenuItem(targetWindow) {
    var windows = targetWindow ? [targetWindow] : Zotero.getMainWindows();

    for (let win of windows) {
        // Get the item context menu
        let doc = win.document;
        let itemContextMenu = doc.getElementById('zotero-itemmenu');

        if (!itemContextMenu) continue;

        // Add our menu item if it doesn't exist yet
        if (!doc.getElementById('zotero-itemmenu-metadata-updater')) {
            let menuitem = doc.createXULElement('menuitem');
            menuitem.id = 'zotero-itemmenu-metadata-updater';
            menuitem.setAttribute('label', '更新元数据和CCF等级');
            menuitem.addEventListener('command', () => {
                Zotero.MetadataUpdater.updateSelectedItems(win);
            });

            // Add the menu item to the context menu
            itemContextMenu.appendChild(menuitem);
        }
    }
}

// Helper function to remove the menu item from the right-click context menu
function removeRightClickMenuItem() {
    var windows = Zotero.getMainWindows();

    for (let win of windows) {
        let doc = win.document;
        let menuitem = doc.getElementById('zotero-itemmenu-metadata-updater');

        if (menuitem) {
            menuitem.remove();
        }
    }
}