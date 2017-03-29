// Import modules
var data = require('sdk/self').data;
var {Cc, Ci} = require('chrome');
var mediator = Cc['@mozilla.org/appshell/window-mediator;1'].getService(Ci.nsIWindowMediator);
var timer = require('sdk/timers');
var settings = require('sdk/simple-prefs');

// Track timer callbacks.
var openTimers = new Array();
var closeTimers = new Array();

// Track mouse position.
var oldMouseY = 0;
var mouseY = 0;

// Called on extension load.
exports.main = function(options, callbacks)
{
	// Initialize the approach setting.
	settings.on('approach', approachSettingChanged);
	approachSettingChanged();
	
	// Find the bookmarks bar.
	var document = mediator.getMostRecentWindow('navigator:browser').document;		
	var bookmarksBar = document.getElementById('PlacesToolbarItems');
	
	// Collect bookmarks.
	var bookmarks = bookmarksBar.getElementsByClassName('bookmark-item');
	
	// Iterate bookmarks.
	for (var i = 0; i < bookmarks.length; i++)
	{
		if (bookmarks[i].type == 'menu')	// If it's a menu...
		{
			// Open the menu upon mousing over.
			bookmarks[i].onmouseover = function()
			{
				var bookmark = this;

				// Make sure no context menus are open.
				if (mediator.getMostRecentWindow('navigator:browser').document.getElementById('placesContext').state != 'open')
				{
					// Check approach direction.
					if (settings.prefs['approach'] == 'A'
						|| closeTimers.length > 0
						|| (settings.prefs['approach'] == 'a' && mouseY > oldMouseY)
						|| (settings.prefs['approach'] == 'b' && mouseY < oldMouseY))
					{
						// First, cancel any timers trying to close the menu.
						for (var j = 0; j < closeTimers.length; j++)
							timer.clearTimeout(closeTimers[j]);
						closeTimers = new Array();
						
						// Delay time is under 10; set a delay of 10ms to prevent bugs.
						if (settings.prefs['openDelay'] < 10)
							openTimers.push(timer.setTimeout(function(){bookmark.open = true}, 10));
						
						// Delay time is set; set a timer.
						else
							openTimers.push(timer.setTimeout(function(){bookmark.open = true}, settings.prefs['openDelay']));
					}
				}
			};
			
			// Close menu upon mousing out.
			bookmarks[i].onmouseout = function()
			{
				var bookmark = this;
				
				// Make sure no context menus are open.
				if (mediator.getMostRecentWindow('navigator:browser').document.getElementById('placesContext').state != 'open')
				{
					// First, cancel any timers trying to open the menu.
					for (var j = 0; j < openTimers.length; j++)
						timer.clearTimeout(openTimers[j]);
					openTimers = new Array();
					
					// Delay time is under 10; set a delay of 10ms to prevent bugs.
					if (settings.prefs['closeDelay'] < 10)
						closeTimers.push(timer.setTimeout(function(){bookmark.open = false; closeTimers = new Array();}, 10));
					
					// Delay time is set; set a timer.
					else
						closeTimers.push(timer.setTimeout(function(){bookmark.open = false; closeTimers = new Array();}, settings.prefs['closeDelay']));
				}
			};
		}
	}
};

// Even though the slowdown is probably minor, we might as well disable mouse tracking when it's not needed.
function approachSettingChanged()
{
	// The user doesn't care where his mouse has been.
	if (settings.prefs['approach'] == 'A')
	{
		mediator.getMostRecentWindow('navigator:browser').onmousemove = null;
	}
	
	// The user cares about mouse approach; we must track where the cursor's been.
	else
	{
		mediator.getMostRecentWindow('navigator:browser').onmousemove = function(e)
		{
			if (mouseY != e.screenY)
			{
				oldMouseY = mouseY;
				mouseY = e.screenY;
			}
		}
	}
}