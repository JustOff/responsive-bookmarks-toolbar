var Ci = Components.interfaces, Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");

var branch = "extensions.resp-bmbar.";
var openDelay, closeDelay, approach, gWindowListener = null;

// Track timer callbacks.
var openTimers = [], closeTimers = [];

// Track mouse position.
var mouseY = 0, oldMouseY = 0;

function mouseMoveListener (e) {
	if (mouseY != e.screenY) {
		oldMouseY = mouseY;
		mouseY = e.screenY;
	}
}

// Even though the slowdown is probably minor, we might as well disable mouse tracking when it's not needed.
function approachSettingChanged (aWindow, disable = false) {
	// The user doesn't care where his mouse has been.
	if (disable || approach == 'A') {
		aWindow.removeEventListener('mousemove', mouseMoveListener, false);
	// The user cares about mouse approach; we must track where the cursor's been.
	} else {
		aWindow.addEventListener('mousemove', mouseMoveListener, false);
	}
}

var globalPrefsWatcher = {
	observe: function (subject, topic, data) {
		if (topic != "nsPref:changed") return;
		switch (data) {
			case "openDelay":
				openDelay = Services.prefs.getBranch(branch).getIntPref("openDelay");
			break;
			case "closeDelay":
				closeDelay = Services.prefs.getBranch(branch).getIntPref("closeDelay");
			break;
			case "approach":
				approach = Services.prefs.getBranch(branch).getCharPref("approach");
				var winenu = Services.wm.getEnumerator("navigator:browser");
				while (winenu.hasMoreElements()) {
					approachSettingChanged(winenu.getNext());
				}
			break;
		}
	},
	register: function () {
		this.prefBranch = Services.prefs.getBranch(branch);
		this.prefBranch.addObserver("", this, false);
	},
	unregister: function () {
		this.prefBranch.removeObserver("", this);
	}
}

function BrowserWindowObserver(handlers) {
	this.handlers = handlers;
}

BrowserWindowObserver.prototype = {
	observe: function (aSubject, aTopic, aData) {
		if (aTopic == "domwindowopened") {
			aSubject.QueryInterface(Ci.nsIDOMWindow).addEventListener("load", this, false);
		} else if (aTopic == "domwindowclosed") {
			if (aSubject.document.documentElement.getAttribute("windowtype") == "navigator:browser") {
				this.handlers.onShutdown(aSubject);
			}
		}
	},
	handleEvent: function (aEvent) {
		let aWindow = aEvent.currentTarget;
		aWindow.removeEventListener(aEvent.type, this, false);

		if (aWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser") {
			this.handlers.onStartup(aWindow);
		}
	}
};

function mouseOverListener (e) {
	// Open the menu upon mousing over.
	var bookmark = e.currentTarget;
	var win = e.view;

	// Make sure no context menus are open.
	if (win.document.getElementById('placesContext').state != 'open') {
		// Check approach direction.
		if (approach == 'A' || closeTimers.length > 0
							|| (approach == 'a' && mouseY > oldMouseY)
							|| (approach == 'b' && mouseY < oldMouseY)) {
			// First, cancel any timers trying to close the menu.
			for (var i = 0; i < closeTimers.length; i++) {
				win.clearTimeout(closeTimers[i]);
			}
			closeTimers = [];

			// Delay time is under 10; set a delay of 10ms to prevent bugs.
			if (openDelay < 10) {
				openTimers.push(win.setTimeout(function () {bookmark.open = true}, 10));
			// Delay time is set; set a timer.
			} else {
				openTimers.push(win.setTimeout(function () {bookmark.open = true}, openDelay));
			}
		}
	}
}

function mouseOutListener (e) {
	// Close the menu upon mousing out.
	var bookmark = e.currentTarget;
	var win = e.view;

	// Make sure no context menus are open.
	if (win.document.getElementById('placesContext').state != 'open') {
		// First, cancel any timers trying to open the menu.
		for (var i = 0; i < openTimers.length; i++) {
			win.clearTimeout(openTimers[i]);
		}
		openTimers = [];

		// Delay time is under 10; set a delay of 10ms to prevent bugs.
		if (closeDelay < 10) {
			closeTimers.push(win.setTimeout(function () {bookmark.open = false; closeTimers = [];}, 10));
		// Delay time is set; set a timer.
		} else {
			closeTimers.push(win.setTimeout(function () {bookmark.open = false; closeTimers = [];}, closeDelay));
		}
	}
};

function browserWindowStartup (aWindow) {
	// Initialize the approach setting.
	approachSettingChanged(aWindow);

	// Find the bookmarks bar.
	var bookmarksBar = aWindow.document.getElementById('PlacesToolbarItems');

	// Collect bookmarks.
	var bookmarks = bookmarksBar.getElementsByClassName('bookmark-item');

	// Iterate bookmarks.
	for (var bookmark of bookmarks) {
		if (bookmark.type == 'menu') {
			bookmark.addEventListener('mouseover', mouseOverListener, false);
			bookmark.addEventListener('mouseout', mouseOutListener, false);
		}
	}

	aWindow.respBmbarObserver = new aWindow.MutationObserver(function (mutations) {
		mutations.forEach(function (mutation) {
			for (var bookmark of mutation.addedNodes) {
				if (bookmark.type == 'menu') {
					bookmark.addEventListener('mouseover', mouseOverListener, false);
					bookmark.addEventListener('mouseout', mouseOutListener, false);
				}
			}
			for (var bookmark of mutation.removedNodes) {
				bookmark.removeEventListener('mouseover', mouseOverListener, false);
				bookmark.removeEventListener('mouseout', mouseOutListener, false);
			}
		});
	});
	aWindow.respBmbarObserver.observe(bookmarksBar, {childList: true});
}

function browserWindowShutdown (aWindow) {
	approachSettingChanged(aWindow, true);
	aWindow.respBmbarObserver.disconnect();
	delete aWindow.respBmbarObserver;

	var bookmarksBar = aWindow.document.getElementById('PlacesToolbarItems');
	var bookmarks = bookmarksBar.getElementsByClassName('bookmark-item');

	for (var bookmark of bookmarks) {
		bookmark.removeEventListener('mouseover', mouseOverListener, false);
		bookmark.removeEventListener('mouseout', mouseOutListener, false);
	}
}

function startup(data, reason) {
	Cu.import("chrome://resp-bmbar/content/prefloader.js");
	PrefLoader.loadDefaultPrefs(data.installPath, "resp-bmbar.js");

	var p = Services.prefs.getBranch(branch);
	openDelay = p.getIntPref("openDelay");
	closeDelay = p.getIntPref("closeDelay");
	approach = p.getCharPref("approach");

	globalPrefsWatcher.register();

	gWindowListener = new BrowserWindowObserver({
		onStartup: browserWindowStartup,
		onShutdown: browserWindowShutdown
	});
	Services.ww.registerNotification(gWindowListener);
	
	var winenu = Services.wm.getEnumerator("navigator:browser");
	while (winenu.hasMoreElements()) {
		browserWindowStartup(winenu.getNext());
	}
}

function shutdown(data, reason) {

	if (reason == APP_SHUTDOWN) return;

	Services.ww.unregisterNotification(gWindowListener);
	gWindowListener = null;

	var winenu = Services.wm.getEnumerator("navigator:browser");
	while (winenu.hasMoreElements()) {
		browserWindowShutdown(winenu.getNext());
	}

	globalPrefsWatcher.unregister();

	Cu.unload("chrome://resp-bmbar/content/prefloader.js");
}

function install(data, reason) {}
function uninstall(data, reason) {}
