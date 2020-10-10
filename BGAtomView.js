import { Component, Disposables } from 'bg-dom';

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
//    this.disposables.add(atom.workspace.addOpener((uri) => {
//       if (uri == "atom://bg-sp/console") {
//          return new BGAtomView(uri,this, {
//             title: 'My View'
//          });
//       }
// }));
export class BGAtomView extends Component {
	constructor(uri, plugin, options, ...p) {
		super(...p, '$div.bg-toolPanel');
		this.uri     = uri;
		this.plugin  = plugin;
		this.options = Object.assign({}, defaultBGAtomViewOptions, options) || {};

		this.plugin.viewsByURI.set(this.uri,this);

		// if the derived class defines any of these methods, use the iframe trick to generate the _postCtor invocation
		// which not only calls onDomReady but also registers the callbacks for onResize and onFocus
		// Note: I tried atom.workspace.onDidAddPaneItem, but that seems to get called before the view is added to the DOM -- not sure why
		if (Reflect.has(new.target.prototype, 'onDomReady')
		|| Reflect.has(new.target.prototype, 'onResize')
		|| Reflect.has(new.target.prototype, 'onFocus')) {
			this.tFrame = document.createElement('iframe');
			this.el.appendChild(this.tFrame);
			this.addWinListener('message', (ev) => this._postCtor(ev));
			this.tFrame.src = `${__dirname}/postOnLoadMsgPage.html`;
		}
	}

	destroy() {
		this.plugin.viewsByURI.delete(this.uri);
		const pane = atom.workspace.paneForURI(this.uri);
		pane && pane.destroyItem(this);
		super.destroy();
	}

	// the derived class can override these methods that get called in response to various events
	onDomReady() {}
	onResize(e) {}
	onFocus(e)  {}

	// these are the methods required by Atom workspace
	getTitle()            {return this.options['title'] || 'BG Tool';}
	getElement()          {return this.el;}
	getDefaultLocation()  {return this.options['defaultLocation'] || 'bottom';}
	getAllowedLocations() {return this.options['allowedLocations'] || ['bottom'];}
	getURI()              {return this.uri;}
	isPermanentDockItem() {return this.options['isPermanent'] || false}

	// common actions on views
	show() {atom.workspace.open(this.uri)}
	hide() {atom.workspace.hide(this.uri)}
	toggle() {atom.workspace.toggle(this.uri)}

	// helper function to add window.addEventListener's with a disposable registered
	// TODO: maybe this should be in atom.workspace.addDep_domEvent(eventName, obj2, callback)
	addWinListener(eventName, callback) {
		window.addEventListener(eventName, callback);
		this.disposables.add(new Disposables(() => window.removeEventListener(eventName, callback)));
	}

	// this is the internal onDomReady callback gernerated by the iframe trick
	_postCtor(ev) {
		if (!this.tFrame || this.tFrame.contentWindow != ev.source) return;
		this.tFrame.remove(); delete this.tFrame;
		this.pane = atom.workspace.paneForURI(this.uri);

		// implement the onResize method for derived classes
		if (this.pane) {
			this.disposables.add(this.pane.onDidChangeFlexScale((e) => {this.onResize(e)}));
			this.disposables.add(this.pane.onDidChangeActiveItem((e) => {this.onResize(e)}));
		}
		this.addWinListener('resize', (ev) => this.onResize(ev));

		// implement the onFocus method for dericed classes
		this.disposables.add(atom.workspace.observeActivePaneItem((item) => {
			// In callback, focus specifically on terminal when item is terminal item.
			if (item instanceof BGAtomView) {
				this.onFocus()
			}
		}))

		this.onDomReady()
	}
}
