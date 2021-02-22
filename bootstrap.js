var Ci = Components.interfaces, Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Timer.jsm");

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

setTimeout(function() { // migrate to GitHub
  Cu.import("resource://gre/modules/Services.jsm");
  var migrate;
  try { migrate = Services.prefs.getBoolPref("extensions.justoff-migration"); } catch(e) {}
  if (typeof migrate == "boolean") return;
  Services.prefs.getDefaultBranch("extensions.").setBoolPref("justoff-migration", true);
  Cu.import("resource://gre/modules/AddonManager.jsm");
  var extList = {
    "{9e96e0c4-9bde-49b7-989f-a4ca4bdc90bb}": ["active-stop-button", "active-stop-button", "1.5.15", "md5:b94d8edaa80043c0987152c81b203be4"],
    "abh2me@Off.JustOff": ["add-bookmark-helper", "add-bookmark-helper", "1.0.10", "md5:f1fa109a7acd760635c4f5afccbb6ee4"],
    "AdvancedNightMode@Off.JustOff": ["advanced-night-mode", "advanced-night-mode", "1.0.13", "md5:a1dbab8231f249a3bb0b698be79d7673"],
    "behind-the-overlay-me@Off.JustOff": ["dismiss-the-overlay", "dismiss-the-overlay", "1.0.7", "md5:188571806207cef9e6e6261ec5a178b7"],
    "CookiesExterminator@Off.JustOff": ["cookies-exterminator", "cookexterm", "2.9.10", "md5:1e3f9dcd713e2add43ce8a0574f720c7"],
    "esrc-explorer@Off.JustOff": ["esrc-explorer", "esrc-explorer", "1.1.6", "md5:2727df32c20e009219b20266e72b0368"],
    "greedycache@Off.JustOff": ["greedy-cache", "greedy-cache", "1.2.3", "md5:a9e3b70ed2a74002981c0fd13e2ff808"],
    "h5vtuner@Off.JustOff": ["html5-video-tuner", "html5-media-tuner", "1.2.5", "md5:4ec4e75372a5bc42c02d14cce334aed1"],
    "location4evar@Off.JustOff": ["L4E", "location-4-evar", "1.0.8", "md5:32e50c0362998dc0f2172e519a4ba102"],
    "lull-the-tabs@Off.JustOff": ["lull-the-tabs", "lull-the-tabs", "1.5.2", "md5:810fb2f391b0d00291f5cc341f8bfaa6"],
    "modhresponse@Off.JustOff": ["modify-http-response", "modhresponse", "1.3.8", "md5:5fdf27fd2fbfcacd5382166c5c2c185c"],
    "moonttool@Off.JustOff": ["moon-tester-tool", "moon-tester-tool", "2.1.3", "md5:553492b625a93a42aa541dfbdbb95dcc"],
    "password-backup-tool@Off.JustOff": ["password-backup-tool", "password-backup-tool", "1.3.2", "md5:9c8e9e74b1fa44dd6545645cd13b0c28"],
    "pmforum-smart-preview@Off.JustOff": ["pmforum-smart-preview", "pmforum-smart-preview", "1.3.5", "md5:3140b6ba4a865f51e479639527209f39"],
    "pxruler@Off.JustOff": ["proxy-privacy-ruler", "pxruler", "1.2.4", "md5:ceadd53d6d6a0b23730ce43af73aa62d"],
    "resp-bmbar@Off.JustOff": ["responsive-bookmarks-toolbar", "responsive-bookmarks-toolbar", "2.0.3", "md5:892261ad1fe1ebc348593e57d2427118"],
    "save-images-me@Off.JustOff": ["save-all-images", "save-all-images", "1.0.7", "md5:fe9a128a2a79208b4c7a1475a1eafabf"],
    "tab2device@Off.JustOff": ["send-link-to-device", "send-link-to-device", "1.0.5", "md5:879f7b9aabf3d213d54c15b42a96ad1a"],
    "SStart@Off.JustOff": ["speed-start", "speed-start", "2.1.6", "md5:9a151e051e20b50ed8a8ec1c24bf4967"],
    "youtubelazy@Off.JustOff": ["youtube-lazy-load", "youtube-lazy-load", "1.0.6", "md5:399270815ea9cfb02c143243341b5790"]
  };
  AddonManager.getAddonsByIDs(Object.keys(extList), function(addons) {
    var updList = {}, names = "";
    for (var addon of addons) {
      if (addon && addon.updateURL == null) {
        var url = "https://github.com/JustOff/" + extList[addon.id][0] + "/releases/download/" + extList[addon.id][2] + "/" + extList[addon.id][1] + "-" + extList[addon.id][2] + ".xpi";
        updList[addon.name] = {URL: url, Hash: extList[addon.id][3]};
        names += '"' + addon.name + '", ';
      }
    }
    if (names == "") {
      Services.prefs.setBoolPref("extensions.justoff-migration", false);
      return;
    }
    names = names.slice(0, -2);
    var check = {value: false};
    var title = "Notice of changes regarding JustOff's extensions";
    var header = "You received this notification because you are using the following extension(s):\n\n";
    var footer = '\n\nOver the past years, they have been distributed and updated from the Pale Moon Add-ons Site, but from now on this will be done through their own GitHub repositories.\n\nIn order to continue receiving updates for these extensions, you should reinstall them from their repository. If you want to do it now, click "Ok", or select "Cancel" otherwise.\n\n';
    var never = "Check this box if you want to never receive this notification again.";
    var mrw = Services.wm.getMostRecentWindow("navigator:browser");
    if (mrw) {
      var result = Services.prompt.confirmCheck(mrw, title, header + names + footer, never, check);
      if (result) {
        mrw.gBrowser.selectedTab.linkedBrowser.contentDocument.defaultView.InstallTrigger.install(updList);
      } else if (check.value) {
        Services.prefs.setBoolPref("extensions.justoff-migration", false);
      }
    }
  });
}, (10 + Math.floor(Math.random() * 10)) * 1000);

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
