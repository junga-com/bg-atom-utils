
import { Disposable, CompositeDisposable } from 'atom';
import { el, list, mount, setAttr } from 'redom';


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
