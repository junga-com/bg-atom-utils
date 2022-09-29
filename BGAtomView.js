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
//    this.options : any object passed in the ctors of Components (views are Components) that is not a known content type (like a Component)
//                   will have its members merged into the this.options object in the root Component class. The BGAtomView class ctor
//                   and other methods can access this.options as sort of a config file. This allows any class in the hierarchy to
//                   add a new default setting or override a setting. Objects passed on the left in the super() ctor call take precedent
//                   over the same setting name in objects that appear on the right.
// How To Use:
// If your (package.json:main) entry point module is a class that extends BGAtomPlugin, then include a onURIOpening(uri) method
// that recognizes the uri and returns an instance of your BGAtomView class. If the uri is static (i.e. no variable part) then
// the instance you return maybe a member variable of the plugin (because there is only one instance that can be open or not). If
// the uri has a variable part (like a filename with a certain extension) then create a new BGAtomView instance to return.
//    onURIOpening(uri) {
//       if (uri ~ /<matchExpr>/)
//          return new MyViewClass(uri);
//    }
//
// Manual way (w/o BGAtomPlugin) In your plugin entry file (see package.json:main) activate() method, register an opener callback
// which returns a new instance of this class or a derived class.
//    this.disposables.add(atom.workspace.addOpener((uri) => {
//       if (uri == "atom://bg-sp/console") {
//          return new BGAtomView(uri,this, {
//             title: 'My View'
//          });
//       }
// }));
//
// Constructor Params:
//    uri   : the uri for which this instance of view is associated. A singleton view (like the atom settings view or tree view)
//            should have a static uri that is always the exact same string (e.g. bgdebugger://stack). If there can be multiple
//            views displaying different data (like files of a certain type), the uri should have a variable part like a filename
//            (e.g. myview://<filename>)
//    plugin: the plugin instance that is creating the view. The plugin is the scope that ties all assets (like views) together.
//    options: options is a free form object whose keys are the configuration settings for the view being created. See the
//            defaultBGAtomViewOptions global variable in the BGAtomView module to see what keys are available and their default
//            values.
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
