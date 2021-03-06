var windowId = 0;
var openTabs = [];
var port = null;

var options = {
  shouldSort: true,
  includeMatches: true,
  threshold: 0.6,
  location: 0,
  distance: 100,
  maxPatternLength: 32,
  minMatchCharLength: 1,
  keys: [
    "title",
    "url"
]
};


function initialize(_) {
	chrome.windows.getCurrent(function (window) {
		// windowId = chrome.windows.WINDOW_ID_CURRENT;
		windowId = window.id;
		console.log(`Loading window #${windowId} tabs...`);
		chrome.tabs.query({'windowId': windowId}, function(tabs) {
			if (tabs.length > 0) {
				console.log(`Restored ${tabs.length} tabs!`);
			}
			openTabs = tabs;
		});

	});
}


function handleContentScriptMessage(msg) {
	console.log("New message received.")
	switch (msg.command) {

		case "open":
			chrome.tabs.update(msg.tabId, {active: true})
			port.postMessage({command: "hide"});
			break;
		case "search":
			var fuse = new Fuse(openTabs, options);
			var results = fuse.search(msg.query);
			port.postMessage({command: "show", "data": JSON.stringify(results)});
			break;

		default: break;
	}
}


function onTabCreated(tab) {
	console.log(`Tab ${tab.id} created.`);
	openTabs.push(tab);
}


function onTabAttached(tabId, attachInfo) {
	console.log(`Tab ${tabId} attached.`);
	if (attachInfo.windowId == windowId) {
		chrome.tabs.get(tabId, function(tab) {
			openTabs.splice(attachInfo.newPosition, 0, tab);
		});
	}
}


function onTabMoved(tabId, moveInfo) {
	console.log(`Moving tab ${tabId} from ${moveInfo.fromIndex} to ${moveInfo.toIndex}.`);
	if (moveInfo.windowId == windowId) {
		console.log("windowcheck ok");

		var removed = openTabs.splice(moveInfo.fromIndex, 1);
		openTabs.splice(moveInfo.toIndex, 0, removed[0]);
			console.log(`Tab ${tabId} moved.`);
	}
}


function onTabUpdated(tabId, changeInfo, tab) {
	console.log(`Updating tab ${tabId} - windowId: ${tab.windowId}...`);
	if (tab.windowId == windowId) {
		openTabs[tab.index] = tab;
		console.log(`Tab ${tabId} updated.`);
	}
}


function onTabDetached(tabId, detachInfo) {
	console.log(`Tab ${tabId} detached.`);
	if (detachInfo.oldWindowId == windowId) {
		openTabs.splice(detachInfo.ldPosition, 1);
	}
}


function onTabRemoved(tabId, removeInfo) {
	console.log(`Tab ${tabId} removed.`);
	if (removeInfo.windowId == windowId) {
		chrome.tabs.get(tabId, function(tab) {
			let index = openTabs.indexOf(tab);
			if (index != -1) {
				openTabs.splice(index, 1);
			}
		});
	}
}


function onChromeCommand(command) {
	console.log('Command:', command);
	if (command == "toggle") {
		chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
			let activeTab = tabs[0];

			chrome.tabs.executeScript(activeTab.id, {file: "content-script/bin/app.js"}, function() {
				chrome.tabs.insertCSS(activeTab.id, {file: "content-script/styles.css"}, function() {

					port = chrome.tabs.connect(activeTab.id, {name: "swoop"});
					port.onMessage.addListener(handleContentScriptMessage);
					port.onDisconnect.addListener(function() {
						console.log("Port disconnected.");
						port = null;
					});

					/*
					** Convert to common JSON format as fuzzy search results to keep
					** content script's display logic simple.
					*/
					port.postMessage({command: "show", "data": JSON.stringify(openTabs.map(function(tab){ return {item: tab}}))});

				});
			});

		});
	}
}


console.log("Starting up...");
if (chrome.runtime && chrome.runtime.onStartup) {
	chrome.runtime.onInstalled.addListener(initialize);
	chrome.runtime.onStartup.addListener(initialize);

	chrome.tabs.onCreated.addListener(onTabCreated);
	chrome.tabs.onAttached.addListener(onTabAttached);
	chrome.tabs.onUpdated.addListener(onTabUpdated);
	chrome.tabs.onMoved.addListener(onTabMoved);
	chrome.tabs.onDetached.addListener(onTabDetached);
	chrome.tabs.onRemoved.addListener(onTabRemoved);

	chrome.commands.onCommand.addListener(onChromeCommand);
}
else {
	console.log("This extension requires Chrome 23 or above. Please update Chrome and retry.");
}
