import { Component, Disposables, FireDOMTreeEvent } from 'bg-dom';

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
//    onConnected() : overridable method. This method gets called after the view is added to the DOM and is located in a pane or panel
//    onResize()   : overridable method. This gets called when the view changes size
//    onFocus()    : overridable method. This gets called when the view receives the focus. Often you need to delegate focus to
//                   a specific child component of the view
//    this.options : gets passed through constructors to implement defaults at each class in the hiearchy to set Atom features
// How To Use:
// In your plugin entry file (see package.json:main) activate() method, register an opener callback which returns a new instance
// of this class or a derived class.
//    this.disposables.add(atom.workspace.addOpener((uri) => {
//       if (uri == "atom://bg-sp/console") {
//          return new BGAtomView(uri,this, {
//             title: 'My View'
//          });
//       }
// }));
export class BGAtomView extends Component {
	constructor(uri, plugin, options, ...p) {
		super(...p, '$div.bg-toolPanel', {root:true});
		this.uri     = uri;
		this.plugin  = plugin;
		this.options = Object.assign({}, defaultBGAtomViewOptions, options) || {};


		this.plugin.viewsByURI.set(this.uri,this);

		// NOTE: we no longer need to use the iframe trick because the component subsystem fires onConnected events

		// // if the derived class defines any of these methods, use the iframe trick to generate the _postCtor invocation
		// // which not only calls onConnected but also registers the callbacks for onResize and onFocus
		// // Note: I tried atom.workspace.onDidAddPaneItem, but that seems to get called before the view is added to the DOM -- not sure why
		// if (Reflect.has(new.target.prototype, 'onConnected')
		// || Reflect.has(new.target.prototype, 'onResize')
		// || Reflect.has(new.target.prototype, 'onFocus')) {
		// 	this.tFrame = document.createElement('iframe');
		// 	this.el.appendChild(this.tFrame);
		// 	this._addWinListener('message', (ev) => this._postCtor(ev));
		// 	this.tFrame.src = `${__dirname}/postOnLoadMsgPage.html`;
		// }

		FireDOMTreeEvent(this, 'onPreConnected');
	}

	// Atom calls destroy on views when the user closes its tab so in BGAtomView, destroy is really the "close" behavior which a
	// particular type of view may or may not want to destroy the view. If the view required work to produce, it can stay in the
	// plugin cache after being closed and then if its re-openned, it can use the cached instance
	destroy() {
		this.plugin.viewsByURI.deleteBypass(this.uri);
		// workspace registers a callback on 'destroyed' channel to remove the item from the pane. Must call b4 we destroy our deps.
		deps.fire({obj:this,channel:'destroyed'});
		super.destroy();
		delete(this.paneContainer);
		delete(this.pane);
		delete(this.plugin);
	}


	// the derived class can override on* methods to make it respond to various events. They should call super.on<name> in case
	// the super class defines behavior also

	onConnected() {
		if (!this._doneLateCtor) {
			this._doneLateCtor = true;
			this.constructAfterConnected && this.constructAfterConnected();

			// implement the onResize method for derived classes
			if (this.pane && this.onResize) {
				this.disposables.add(this.pane.onDidChangeFlexScale((e) => {this.onResize(e)}));
				this.disposables.add(this.pane.onDidChangeActiveItem((e) => {this.onResize(e)}));
			}
			if (this.onResize)
				this._addWinListener('resize', (ev) => this.onResize(ev));
		}
		this.pane = atom.workspace.paneForURI(this.uri);
		this.paneContainer = atom.workspace.paneContainerForItem(this);
	}
	onDisconnected() {
		this.pane = atom.workspace.paneForURI(this.uri);
		this.paneContainer = atom.workspace.paneContainerForItem(this);
	}

	//constructAfterConnected() {}
	//onResize(e) {}
	//onFocus(e)  {}

	// these are the methods that are called Atom workspace
	getTitle()            {return this.options['title'] || 'BG Tool';}
	getElement()          {return this.el;}
	getURI()              {return this.uri;}
	getLongTitle()        {return this.options['longTitle'] || this.getTitle()}
	getIconName()         {return this.options['icon']}
	getDefaultLocation()  {return this.options['defaultLocation'] || 'bottom';}
	getAllowedLocations() {return this.options['allowedLocations'] || ['bottom'];}
	isPermanentDockItem() {return this.options['isPermanent'] || false}
	getPreferredHeight()  {return this.options['preferredHeight']}
	getPreferredWidth()   {return this.options['preferredWidth']}
	// these on* methods are the Atom pattern to register callbacks not to be confused with other on* methods which define behavior
	// of this class to respond to events
	// NOTE: these calls to deps.addWithDispose pass the callback as the obj2 because we do not know what obj2 is. In practice
	//       onDidChangeTitle gets called by atom.workspace and also a tabView instance. Since callback is a transient object with
	//       a unique identity each time, this will mean each call will have a unique relationship. The returned disposable holds
	//       that idntitity. We can also destroy the relationships when obj1 (this view) is destroyed.
	onDidDestroy(callback)               {return deps.addWithDispose({obj:this,channel:'destroyed'},     callback, callback)}
	onDidChangeTitle(callback)           {return deps.addWithDispose({obj:this,channel:'title'},         callback, callback)}
	onDidChangeIcon(callback)            {return deps.addWithDispose({obj:this,channel:'icon'},          callback, callback)}
	onDidChangeModified(callback)        {return deps.addWithDispose({obj:this,channel:'modifiedState'}, callback, callback)}
	onDidTerminatePendingState(callback) {return deps.addWithDispose({obj:this,channel:'pendingState'},  callback, callback)}

	serialize() {}
	save() {}
	saveAs() {}
	shouldPromptToSave() {return false}
	getPath() {}
	isModified() {}
	copy() {}

	// common actions on views
	show() {atom.workspace.open(this.uri)}
	hide() {atom.workspace.hide(this.uri)}
	toggle() {atom.workspace.toggle(this.uri)}

	// helper function to add window.addEventListener's with a disposable registered
	// TODO: maybe this should be in atom.workspace.addDep_domEvent(eventName, obj2, callback)
	_addWinListener(eventName, callback) {
		window.addEventListener(eventName, callback);
		this.disposables.add(new Disposables(() => window.removeEventListener(eventName, callback)));
	}

	// NOTE: we no longer need to use the iframe trick because the component subsystem fires onConnected events
	// this is the internal onConnected callback gernerated by the iframe trick
	_postCtor(ev) {
		if (!this.tFrame || this.tFrame.contentWindow != ev.source) return;
		this.tFrame.remove(); delete this.tFrame;
		this.pane = atom.workspace.paneForURI(this.uri);

		// implement the onResize method for derived classes
		if (this.onResize) {
			if (this.pane) {
				this.disposables.add(this.pane.onDidChangeFlexScale((e) => {this.onResize(e)}));
				this.disposables.add(this.pane.onDidChangeActiveItem((e) => {this.onResize(e)}));
			}
			this._addWinListener('resize', (ev) => this.onResize(ev));
		}

		// implement the onFocus method for dericed classes
		this.disposables.add(atom.workspace.observeActivePaneItem((item) => {
			// In callback, focus specifically on terminal when item is terminal item.
			if (item instanceof BGAtomView) {
				this.onFocus && this.onFocus()
			}
		}))

		FireDOMTreeEvent(this, 'onConnected');
	}
}
