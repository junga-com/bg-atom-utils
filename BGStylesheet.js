
export class BGStylesheet {
	constructor() {
		var styleEl = document.createElement("style");
		document.head.appendChild(styleEl);
		this.dynStyles = styleEl.sheet;
		this.freeIDs = [];
		// consume the '0' index b/c 0 is not a valid ruleID
		this.dynStyles.insertRule('#NOTHING {border: none}', 0);
		r=this; // for console inspection
	}

	isEmpty() { return this.dynStyles.cssRules.length == 0}

	addRule(cssText) {
		if (this.freeIDs.length > 0) {
			var ruleID = this.freeIDs.pop();
			return this.updateRule(ruleID, cssText)
		} else {
			var ruleID = this.dynStyles.cssRules.length;
			this.dynStyles.insertRule(cssText, ruleID);
			return ruleID;
		}
	}
	updateRule(ruleID, cssText) {
		if (!ruleID)
			return this.addRule(cssText)
		this.dynStyles.deleteRule(ruleID);
		this.dynStyles.insertRule(cssText, ruleID);
		return ruleID;
	}
	deleteRule(ruleID) {
		this.updateRule(ruleID, '#NOTHING {}')
		this.freeIDs.push(ruleID);
		return 0;
	}
	deleteAllRules() {
		while (this.dynStyles.cssRules.length > 0) {
			this.dynStyles.deleteRule(this.dynStyles.cssRules.length -1);
		}
		this.freeIDs = [];
	}
	addAllRules(ruleArray) {
		this.deleteAllRules();
		for (var i=0; i< ruleArray.length; i++) {
			this.dynStyles.insertRule(ruleArray[i], i);
		}
	}
}



// This class facilitates adjusting the size of List Items in Atom (namely the tree-view and tabs)
// It allows changing the fontSize and line-height separately
// atom has a weird style rule that sets the line-height of list items and their hightlight bars to a fixed 25px with very specific
// selectors that can not be overrided at the container level. This class overrides that by 
//    1) creating a dynamic style sheet with more specific rules to override the Atom selectors
//    2) setting the fontSize at container so that it will apply to all the items within.
export class BGAtomTreeItemFontSizer {
	constructor(treeViewEl,state) {
		this.treeViewEl = treeViewEl;
		this.dynStyles = new BGStylesheet();
		this.fontSizeToLineHeightPercent = 230;   // this is about the equivalent % to the atom hardcoded 11px/25px font/lineHeight

		// handle incoming serialized state from the last run
		if (state && state.active) {
			this.fontSizeToLineHeightPercent = state.lineHeight;
			this.setFontSize(state.fontSize, true);
		}
	}

	// set the new font size by adjusting the existing fontSize by a number of pixels. Nagative numbers make the font smaller
	adjustFontSize(delta) {
		this.setFontSize(this.getFontSize() + delta);
	}

	// resetting returns to the default Atom styling
	resetFontSize() {
		if (this.dynStyles && this.cssListItemRule) {
			this.cssListItemRule = this.dynStyles.deleteRule(this.cssListItemRule);
			this.cssListHighlightRule = this.dynStyles.deleteRule(this.cssListHighlightRule);
			this.cssListHighlightRuleRoot = this.dynStyles.deleteRule(this.cssListHighlightRuleRoot);
		}
		if (this.treeViewEl)
			this.treeViewEl.style.fontSize = '';
	}

	// set the new size in pixels
	async setFontSize(fontSize, fromCtor) {
		// if not yet set or if the fontSizeToLineHeightPercent has changed, set a dynamic rule to override the line-height
		if (!this.cssListItemRule || this.fontSizeToLineHeightPercent != this.lastFontSizeToLineHeightPercent) {
			this.cssListItemRule = this.dynStyles.updateRule(this.cssListItemRule, `
				.tool-panel.tree-view .list-item {
					line-height: ${this.fontSizeToLineHeightPercent}% !important;
				}
			`);
			this.lastFontSizeToLineHeightPercent = this.fontSizeToLineHeightPercent;
		}

		// set the font size at the top of the tree-view and it will affect all the item text
		this.treeViewEl.style.fontSize = fontSize+'px';

		// the highlight bar is also hardcoded to 25px so create a dynamic rule to set it
		// to determine the height, we query the height of a list-item. The root is not a good choice because themes can style it
		// differently. If the root node is collapsed, expand it so that we have a regular list-item to query
		if (this.treeViewEl.getElementsByClassName('list-item').length <= 1) {
			atom.commands.dispatch(this.treeViewEl, 'core:move-to-top');
			atom.commands.dispatch(this.treeViewEl, 'tree-view:expand-item');
			for (var i=0; i<10 && this.treeViewEl.getElementsByClassName('list-item').length <= 1; i++)
				await bgAsyncSleep(100);
		}
		var lineBoxHeight = 0;
		if (this.treeViewEl.getElementsByClassName('list-item').length > 1)
			lineBoxHeight = this.treeViewEl.getElementsByClassName('list-item')[1].getBoundingClientRect().height;
		else
			lineBoxHeight = Math.trunc(fontSize * this.fontSizeToLineHeightPercent /100);
		this.cssListHighlightRule = this.dynStyles.updateRule(this.cssListHighlightRule, `
			.tool-panel.tree-view .list-item.selected::before, .tool-panel.tree-view .list-nested-item.selected::before  {
				height:${lineBoxHeight}px !important;
			}
		`);

		// only for the intial call from th constructor to restore the previous state, do we yeild. This is only because the root
		// tree item does not have its actual size until later. Appearently some Atom code changes something that affects its height
		(fromCtor) ? await bgAsyncSleep(1) : null;
		var rootLineBoxHeight = 0;
		if (this.treeViewEl.getElementsByClassName('list-item').length > 0) {
			rootLineBoxHeight = this.treeViewEl.getElementsByClassName('list-item')[0].getBoundingClientRect().height;
		} else {
			rootLineBoxHeight = lineBoxHeight;
		}
		this.cssListHighlightRuleRoot = this.dynStyles.updateRule(this.cssListHighlightRuleRoot, `
			.tool-panel.tree-view .project-root.selected::before {
				height:${rootLineBoxHeight}px !important;}
		`);

		// this.cssListItemRule = this.dynStyles.updateRule(this.cssListItemRule, [
		// 	`
		// 	.tool-panel.tree-view .list-item {
		// 		line-height: ${this.fontSizeToLineHeightPercent}% !important;
		// 	}`,
		// 	`
		// 	.tool-panel.tree-view .list-item.selected::before, .tool-panel.tree-view .list-nested-item.selected::before  {
		// 		height:"+lineBoxHeight+"px !important;
		// 	}`,
		// 	`
		// 	.tool-panel.tree-view .project-root.selected::before {
		// 		height:${rootLineBoxHeight}px !important;}
		// `]);
	}

	// return the existing size in pixels
	getFontSize() {
		if (!this.treeViewEl)
			return 11;
		var currentFontSize = parseInt(this.treeViewEl.style.fontSize);
		if (!currentFontSize) {
			currentFontSize = parseInt(window.getComputedStyle(this.treeViewEl, null).fontSize);
		}
		return currentFontSize;
	}

	setItemLineHightPercentage(lineHeightPercent) {
		this.fontSizeToLineHeightPercent = lineHeightPercent;
		this.setFontSize(this.getFontSize());
	}

	adjustItemLineHightPercentage(delta) {
		this.fontSizeToLineHeightPercent += delta;
		this.setFontSize(this.getFontSize());
	}

	serialize() {
		return {
			active: (this.cssListItemRule ? true:false),
			fontSize: this.getFontSize(),
			lineHeight: this.fontSizeToLineHeightPercent
		}
	}

	dispose() {
		this.resetFontSize()
	}
}


export class BGAtomTabFontSizer {
	constructor(dockSelector, state) {
		this.dockSelector = dockSelector;
		this.dynStyles = new BGStylesheet();

		// temp hard code
		this.currentFontSize     = 11;
		this.currentTabBarHeight = 36;

		// handle incoming serialized state from the last run
		if (state && state.active) {
			this.setFontSize(state.fontSize, state.tabBarHeight);
		}
	}

	// set the new font size by adjusting the existing fontSize by a number of pixels. Nagative numbers make the font smaller
	adjustFontSize(delta) {
		var {fontSize, tabBarHeight} = this.getTabBarSizes();
		this.setFontSize(fontSize + delta, tabBarHeight + 1*delta);
	}

	// set the new font size by adjusting the existing fontSize by a number of pixels. Nagative numbers make the font smaller
	adjustBarHeight(delta) {
		var {fontSize, tabBarHeight} = this.getTabBarSizes();
		this.setFontSize(fontSize, tabBarHeight + delta);
	}

	// resetting returns to the default Atom styling
	resetFontSize() {
		this.dynStyles.deleteAllRules();
		var {fontSize, tabBarHeight} = this.getTabBarSizes();
	}

	// set the new size in pixels
	async setFontSize(fontSize, tabBarHeight) {
		// .tab-bar  {changed height 36 to 72}
		// .tab-bar .tab, .tab-bar .tab::before {changed height 26 to inherit, but 62 was better}
		// .tab-bar .tab   {-> height 26 to inherit (top justified -- needs font-size)}
		// .tab-bar .tab .close-icon {line-height 26 to inherit (not right yet)}
		// .tab-bar .tab:before, .tab-bar .tab:after {-> height 26 to inherit }
		// .tab-bar .tab {font-size 11px to 35px}

		// atom-workspace-axis.vertical > atom-panel-container.pane
		this.cssListItemRule = this.dynStyles.addAllRules([`
				${this.dockSelector} .tab-bar {height: ${tabBarHeight}px !important;}
			`, `
				${this.dockSelector} .tab-bar .tab, .tab-bar .tab::before {height: inherit !important;}
			`, `
				${this.dockSelector} .tab-bar .tab   {height: inherit !important;}
			`, `
				${this.dockSelector} .tab-bar .tab .close-icon {line-height: inherit !important;}
			`, `
				${this.dockSelector} .tab-bar .tab:before, .tab-bar .tab:after {height: inherit !important;}
			`, `
				${this.dockSelector} .tab-bar .tab {font-size: ${fontSize}px !important;}
			`
		]);
		this.currentFontSize = fontSize;
		this.currentTabBarHeight = tabBarHeight;
	}

	// return the existing size in pixels
	getTabBarSizes() {
		var fontSize=11;
		var tabBarHeight=26;
		var bar = document.querySelector(this.dockSelector+' .tab-bar');
		tabBarHeight = (bar) ? bar.getBoundingClientRect().height : tabBarHeight;
		var tab = document.querySelector(this.dockSelector+' .tab-bar .tab');
		if (tab) {
			fontSize = parseInt(window.getComputedStyle(tab).fontSize);
			tabBarHeight = Math.max(tabBarHeight, tab.getBoundingClientRect().height);
		}
		return {fontSize: fontSize, tabBarHeight: tabBarHeight};
	}

	serialize() {
		return {
			active: (!this.dynStyles.isEmpty() ? true:false),
			fontSize: this.currentFontSize,
			tabBarHeight: this.currentTabBarHeight
		}
	}

	dispose() {
		this.resetFontSize()
	}
}
