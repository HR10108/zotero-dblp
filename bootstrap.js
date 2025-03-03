// Main bootstrap.js file for the Zotero 7 Metadata Updater plugin

var chromeHandle;

// Plugin lifecycle hooks
function startup({ id, version, rootURI }, reason) {
    // Make sure Zotero is loaded
    if (typeof Zotero === 'undefined') {
        if (Services.appinfo.ID === "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}") {
            // Firefox
            const { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");
            setTimeout(function() { startup({ id, version, rootURI }, reason); }, 500);
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
            setTimeout(function() { startup({ id, version, rootURI }, reason); }, 500);
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
    
    // Load main script
    Services.scriptloader.loadSubScript(rootURI + "content/metadata-updater.js");
    
    // Store rootURI for later use
    Zotero.MetadataUpdater = Zotero.MetadataUpdater || {};
    Zotero.MetadataUpdater.rootURI = rootURI;
    
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
            addRightClickMenuItem();
        }, "zotero-window-loaded");
    } else {
        addRightClickMenuItem();
    }
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
}

function install(data, reason) {
    // Nothing specific needed for install
}

function uninstall(data, reason) {
    // Nothing specific needed for uninstall
}

// Window hooks
function onMainWindowLoad({ window }) {
    // Ensure the menu item is added when a new window is created
    addRightClickMenuItem(window);
}

function onMainWindowUnload({ window }) {
    // Clean up any window-specific references
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
            menuitem.setAttribute('label', 'Update Metadata Online');
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