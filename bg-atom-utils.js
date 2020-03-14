'use babel';
import { el, list, mount, setAttr } from 'redom';
import { Disposable, CompositeDisposable } from 'atom';

// DispatchCommand invokes <cmd> in the current active target environment. 
// The active WorkspaceItem is used if it exists, other wise atom.workspace is used. 
export function DispatchCommand(cmd) {
	var target = atom.workspace.getActivePaneItem();
	var targetEl = target ? target.getElement() : atom.workspace.getElement();
	atom.commands.dispatch(targetEl, cmd);
}

export function BGRemoveKeybindings(sourceRegex, keystrokeRegex, selectorRegex, commandRegex) {
	if (typeof sourceRegex == 'object' && sourceRegex.sourceRegex)
		({sourceRegex, keystrokeRegex, selectorRegex, commandRegex} = sourceRegex);
	// TODO: since this uses an undocumented features of atom.keymaps, add gaurds and report failure well
	var removedCount = 0;
	var filePath
	atom.keymaps.keyBindings = atom.keymaps.keyBindings.filter( 
		(binding)=>{
			const matched =
			 	   (!sourceRegex    || sourceRegex.test(binding.source))
				&& (!keystrokeRegex || keystrokeRegex.test(binding.keystrokes[0]))
				&& (!selectorRegex  || selectorRegex.test(binding.selector))
				&& (!commandRegex   || commandRegex.test(binding.command));
			if (matched) {
				removedCount++;
				filePath = binding.source;
			}
			// negate the result b/c we return false only for the ones we matched. All other will stay in the keymap so should be true
			return (matched) ? false : true;
		}
	);
	atom.keymaps.emitter.emit('did-reload-keymap', {
	  path: filePath
	});
	return removedCount;
}


// This return the WorkspaceItem with the given uri if it is open. Otherwise it returns false. It will not open a uri.
export function BGFindWorkspaceItemFromURI(uri) {
	const items = atom.workspace.getPaneItems();
	return items.find((item)=>{return item.getURI() == 'atom://config'});
}



export class BGTimer {
	constructor(prec) {
		this.prec = (prec!==undefined) ? prec : 3;
		this.startTime = null;
		this.lap   = null;
		this.ticks = [];
		this.tickAccumulation = 0.0;
		this.start();
	}

	start() {
		var current = process.hrtime.bigint();
		this.startTime = current;
		this.lap   = current;
		this.ticks = [];
		this.ticks.push({
			startTime: current,
			endTime: null,
			delta: null
		})
	}

	// call at the top of callbacks and after awaits
	tickStart() {
		this.ticks.push({
			startTime: process.hrtime.bigint(),
			endTime: null,
			delta: null
		})
	}
	// call at the end of callbacks and before awaits (just before they yield)
	tickEnd() {
		var tick = this.ticks[this.ticks.length-1];
		if (tick.endTime)
			console.log("BGTimer: error: tickEnd called without a matching tickStart/start");
		else {
			tick.endTime = process.hrtime.bigint();
			tick.delta = this.bgNanoToSec(tick.endTime-tick.startTime);
			this.tickAccumulation += tick.delta;
		}
	}

	get()   {return this.bgNanoToSec(process.hrtime.bigint() - this.startTime) }
	print(description, prec) {
		var prec = (prec!==undefined) ? prec : this.prec;
		console.log('total : '+this.get().toFixed(prec)+' : '+description);
	}

	lapGet()   {return this.bgNanoToSec(process.hrtime.bigint() - this.lap) }
	lapPrint(description, prec) {
		var prec = (prec!==undefined) ? prec : this.prec;
		var current = process.hrtime.bigint();
		var delta = this.bgNanoToSec(current - this.lap);
		this.lap = current;
		console.log('lap : '+delta.toFixed(prec)+' : '+description);
	}

	printDetails(description) {
		this.tickEnd();
		var total = this.get()
		var activePercent = this.tickAccumulation * 100.0 / total;
		console.log("BGTimer ended:"+description);
		console.log("   real elapsed  : "+total.toFixed(3));
		console.log("   active elapsed: "+this.tickAccumulation.toFixed(3));
		console.log("   % active      : "+activePercent.toFixed(0)+'%');
	}

	bgNanoToSec(nano) {
		var nano = nano.toString();
		while (nano.length < 10) nano = '0'+nano;
		var frac=nano.slice(-9);
		var sec=nano.slice(0, nano.length-9);
		return parseFloat(sec+'.'+frac);
	}
}


export class BGAtomPlugin {
	constructor() {
		// subscriptions is a place to put things that need to be cleaned up on deativation
		this.subscriptions = new CompositeDisposable();
	}

	activate(state) {
	}

	deactivate() {
		this.subscriptions.dispose();
	}

	serialize() {
		return ;
	}

	addCommand(name, callback) {
		var obj = {}
		obj[name] = callback;
		this.subscriptions.add(atom.commands.add('atom-workspace', obj));
	}
}


const defaultBGAtomViewOptions = {
	title:           'BG View',
	defaultLocation: 'bottom',
	allowedLocations: ['center', 'left', 'right', 'bottom'],
	isPermanent:      false
} 


// This is a generic component for creating new Atom items dislayed in panes. This class can be used as is to open an empty view.
// Typically, you would make a new class that extends this, register a URI opener in atom.workspace and return a new instance 
// of that class from the opener.
// Features:
//    onDomReady() : overridable method. This method gets called after the view is added to the DOM and is located in a pane or panel
//    onResize()   : overridable method. This gets called when the view changes size
//    onFocus()    : overridable method. This gets called when the view receives the focus. Often you need to delegate focus to
//                   a specific child component of the view 
//    this.options : gets passed through constructors to implement defaults at each class in the hiearchy to set Atom features
// How To Use:
// In your plugin entry file (see package.json:main) activate() method, register an opener callback which returns a new instance
// of this class or a derived class.
//    this.subscriptions.add(atom.workspace.addOpener((uri) => {
//       if (uri == "atom://bg-sp/console") {
//          return new BGAtomView(uri,this, {
//             title: 'My View'
//          });
//       }
// }));
export class BGAtomView {
	constructor(uri, parent, options) {
		this.uri     = uri;
		this.parent  = parent;
		this.options = Object.assign({}, defaultBGAtomViewOptions, options) || {};
		this.subscriptions = new CompositeDisposable();

		// Create root element
		this.rootElement = el('div.bg-toolPanel');


		// Create a temporary iframe to generate the onDomReady message back to us
		// also tried atom.workspace.onDidAddPaneItem, but that gets called before the DOM is ready
		this.tFrame = document.createElement('iframe');
		this.rootElement.appendChild(this.tFrame);
		this.addWinListener('message', (ev) => this._postCtor(ev));
		this.tFrame.src = `${__dirname}/postOnLoadMsgPage.html`;
	}


	// this is the internal onDomReady callback gernerated by the iframe trick 
	_postCtor(ev) {
		if (!this.tFrame || this.tFrame.contentWindow != ev.source) return;
		this.tFrame.remove(); delete this.tFrame;
		let pane = atom.workspace.paneForURI(this.uri);
		if (pane) {
			this.subscriptions.add(pane.onDidChangeFlexScale((e) => {this.onResize(e)}));
			this.subscriptions.add(pane.onDidChangeActiveItem((e) => {this.onResize(e)}));
		}
		this.addWinListener('resize', (ev) => this.onResize(ev));

		// Add callbacks to run for current and future active items on active panes.
		this.subscriptions.add(atom.workspace.observeActivePaneItem((item) => {
			// In callback, focus specifically on terminal when item is terminal item.
			if (item instanceof BGAtomView) {
				this.onFocus()
			}
		}))

		this.onDomReady()
	}

	// override this to finish construction after atom has added your getElement() into the DOM 
	onDomReady() {}

	// override this to perform actions when the view changes size
	onResize(e) {console.log('base class onResize');}

	// override this to perform actions when the view receives focus
	onFocus(e)   {console.log('base class onFocus');}

	getTitle()            {return this.options['title'] || 'BG Tool';}
	getElement()          {return this.rootElement;}
	getDefaultLocation()  {return this.options['defaultLocation'] || 'bottom';}
	getAllowedLocations() {return this.options['allowedLocations'] || ['bottom'];}
	getURI()              {return this.uri;}
	isPermanentDockItem() {return this.options['isPermanent'] || false}

	show() {
		atom.workspace.open(this.uri)
	}

	toggle() {
		atom.workspace.toggle(this.uri)
	}

	destroy() {
		this.subscriptions.dispose();
	}

	// helper function to add window.addEventListener's with a disposable registered
	addWinListener(eventName, callback) {
		window.addEventListener(eventName, callback);
		this.subscriptions.add(new Disposable(() => window.removeEventListener(eventName, callback)));
	}
}


export class BGFeedbackView {
	constructor() {
		// Create root element
		this.rootElement = el('div.atom-cyto-message', "here, baby");
		mount(document.body, this.rootElement);

		this.modalPanel = atom.workspace.addModalPanel({
			item: this.rootElement,
			visible: true
		});
	}

	setMessage(data) {
		this.rootElement.textContent = data;
	}

	isVisible() {this.modalPanel.isVisible()}
	show()      {this.modalPanel.show()}
	hide()      {this.modalPanel.hide()}
	destroy()   {this.modalPanel.destroy();}

	serialize() {}
}



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


export function bgAsyncSleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
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
