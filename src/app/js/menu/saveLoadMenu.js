/**
 * Contains the logic for the save and load button.
 *
 * @param graph the associated webvowl graph
 * @returns {{}}
 */
module.exports = function (graph) {

	var saveLoadMenu = {},
		saveButton,filename;


	/**
	 * Adds the pause button to the website.
	 */
	saveLoadMenu.setup = function () {
		var menuEntry = d3.select("#saveMenu");
		menuEntry.on("mouseover", function () {
			var searchMenu = graph.options().searchMenu();
			searchMenu.hideSearchEntries();
		});
		loadButton = d3.select("#loadPositions")
		.on("click", loadPositions);
		loadButton = d3.select("#savePositions")
		.on("click", savePositions);	

	}
	
	saveLoadMenu.setFilename = function(_filename) {
		filename = _filename;
	}

	function savePositions() {
		if (typeof(Storage) !== "undefined") {
			var nodePositions = graph.nodePositions();
			localStorage.setItem(filename, JSON.stringify(nodePositions));
		} else {
		    // Sorry! No Web Storage support..
		}
	}
	
	function loadPositions() {
		if (typeof(Storage) !== "undefined") {
			var nodePositionsText = localStorage.getItem(filename);
			if(nodePositionsText) {
			var nodePositions = JSON.parse(nodePositionsText);
			if(nodePositions) {
				graph.updateNodePositions(nodePositions);
			}
			}
			
		} else {
		    // Sorry! No Web Storage support..
		}
	}


	


	return saveLoadMenu;
};
