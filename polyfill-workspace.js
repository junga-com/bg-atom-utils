import { PolyfillObjectMixin }        from './PolyfillObjectMixin'
import { ArrangeParamsByType }        from './miscellaneous'
import { Disposables }                from './Disposables'


export class AtomWorkspacePolyfill extends PolyfillObjectMixin {
	constructor() {
		super(
			atom.workspace,
			['_normalizeURISpec','_uriMatch','itemForURI','getItemByURI','getItemsByURI','hide',
			 'addDep_items',      'removeDep_items',      'addDep_itemsOpenned',      'removeDep_itemsOpenned',      'addDep_itemsDestroyed', 'removeDep_itemsDestroyed', 'addDep_itemsActivated',      'removeDep_itemsActivated',
			 'addDep_textEditors','removeDep_textEditors','addDep_textEditorsOpenned','removeDep_textEditorsOpenned',                                                     'addDep_textEditorsActivated','removeDep_textEditorsActivated',
			 'addDep_panes',      'removeDep_panes',      'addDep_panesOpenned',      'removeDep_panesOpenned',      'addDep_panesDestroyed', 'removeDep_panesDestroyed', 'addDep_panesActivated',      'removeDep_panesActivated'
			]
		);
	}

	getTarget() {return atom.workspace;}
	doesTargetAlreadySupportFeature() {return !!this.target.getItemByURI;}
	isTargetStillCompatibleWithThisPollyfill() {return true;}

	//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// Polyfill Methods...
	// These methods are writtien in the context of the target object and will be dynamically added to that object when this polyfill
	// is installed.  If the name matches an existing method of the target object, it will be replaced and the original will be
	// available as orig_<methodName>
	// The 'this' pointer of these methods will be the target object, not the polyfill object when they are invoked.

	// Params:
	//    <uriSpec>  : uriSpec is a regex that matches uri's. If it is specified as a string, it will be converted to a RegExp
	//                 prepending a '^' to match the string at the start of the uri. The string can contain regex expresssions
	_normalizeURISpec(uriSpec) {
		(typeof uriSpec == 'string') && (uriSpec = new RegExp('^'+uriSpec))
		return uriSpec;
	}

	_uriMatch(uriSpec, uri) {
		return this._normalizeURISpec(uriSpec).test(uri)
	}

	// This return the WorkspaceItem with the given uri if it is open. Otherwise it returns false. It will not open a uri.
	// If <uri> matches multiple items, only the first found will be returned. (See getItemsByURI(uri))
	// If <uri> does not match any items, undefined will be returned
	// Alternative:
	//   atom.workspace.paneForURI(uri).itemForURI(uri)
	// Params:
	//    <uri> : a string or RegExp that will match the uri of the items to hide. A string will be interpretted as the leteral
	//            prefix to match. e.g. 'atom://config' will match 'atom://config/bg-tree-view-toolbar'
	itemForURI(uriSpec) {return this.getItemByURI(uriSpec)}
	getItemByURI(uriSpec) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const items = atom.workspace.getPaneItems();
		return items.find((item)=>{return uriSpec.test(item.getURI())});
	}

	// This return the WorkspaceItem with the given uri if it is open. Otherwise it returns false. It will not open a uri.
	// If <uri> matches multiple items, only the first found will be returned. (See getItemsByURI(uri))
	// If <uri> does not match any items, undefined will be returned
	// Params:
	//    <uri> : a string or RegExp that will match the uri of the items to hide. A string will be interpretted as the leteral
	//            prefix to match. e.g. 'atom://config' will match 'atom://config/bg-tree-view-toolbar'
	getItemsByURI(uriSpec) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const items = atom.workspace.getPaneItems();
		return items.filter((item)=>{return uriSpec.test(item.getURI())});
	}

	// this overrides the original hide(uri) method to make it more tolerant to uri matching. For example, the actual uri might
	// have a #<anchor> suffix and this will match the prefix regardless of the suffix
	// If <uri> matches multiple items, they all will be hidden.
	// If <uri> does not match any items, nothing will be done and it is not an error
	// Params:
	//    <uri> : a string or RegExp that will match the uri of the items to hide. A string will be interpretted as the leteral
	//            prefix to match. e.g. 'atom://config' will match 'atom://config/bg-tree-view-toolbar'
	hide(uriSpec) {
		for (const item in this.getItemsByURI(uriSpec))
			this.orig_hide(item.getURI());
	}



	// callback('openned',     <item>, <pane>, <index>)
	// callback('destroyed',   <item>, <pane>, <index>)
	// callback('activated',   <item>, <previousActiveItem>)
	// callback('deactivated', <item>, <newActiveItem>)
	// where:
	//    <item> : is the item matching the uriSpec
	//    <pane> : is the workspace pane that contains <item>
	//    <index>: is the index of <item> in <pane>.items
	addDep_items(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'');

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onWorkspaceItemChanged';
			cnode.lastActiveItem = this.activePaneContainer.getActivePaneItem();
			cnode.disposables.add(this.onDidOpen((event)=>{
				if (uriSpec.test(event.uri))
					deps.fire({obj:this,channel}, 'openned', event.item, event.pane, event.index)
			}))
			cnode.disposables.add(this.onDidDestroyPaneItem((event)=>{
				if (uriSpec.test(event.item.getURI()))
					deps.fire({obj:this,channel}, 'destroyed', event.item, event.pane, event.index)
			}))
			cnode.disposables.add(this.onDidChangeActivePaneItem((item)=>{
				if (cnode.lastActiveItem && uriSpec.test(cnode.lastActiveItem.getURI()))
					deps.fire({obj:this,channel}, 'deactivated', cnode.lastActiveItem, item);
				if (uriSpec.test(item.getURI()))
					deps.fire({obj:this,channel}, 'activated',   item, cnode.lastActiveItem);
				cnode.lastActiveItem = item;
			}))
		}
	}
	removeDep_items(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'');
		deps.remove({obj:this,channel}, obj2);
	}


	// callback(<opennedItem>, <pane>, <index>)
	addDep_itemsOpenned(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.openned';

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onWorkspaceItemOpenned';
			cnode.disposables.add(this.onDidOpen((event)=>{
				if (uriSpec.test(event.uri))
					deps.fire({obj:this,channel}, event.item, event.pane, event.index)
			}))
		}
	}
	removeDep_itemsOpenned(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.openned';
		deps.remove({obj:this,channel}, obj2);
	}


	// callback(<destroyedItem>, <pane>, <index>)
	addDep_itemsDestroyed(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.destroyed';

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onWorkspaceItemDestroyed';
			cnode.disposables.add(this.onDidDestroyPaneItem((event)=>{
				if (uriSpec.test(event.item.getURI()))
					deps.fire({obj:this,channel}, event.item, event.pane, event.index);
			}))
		}
	}
	removeDep_itemsDestroyed(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.destroyed';
		deps.remove({obj:this,channel}, obj2);
	}


	// callback('activated',   <item>, <previousActiveItem>)
	// callback('deactivated', <item>, <newActiveItem>)
	addDep_itemsActivationChange(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.activationChange';

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onWorkspaceItemActivationChange';
			cnode.lastActiveItem = this.activePaneContainer.getActivePaneItem();
			cnode.disposables.add(this.onDidChangeActivePaneItem((item)=>{
				if (cnode.lastActiveItem && uriSpec.test(cnode.lastActiveItem.getURI()))
					deps.fire({obj:this,channel}, 'deactivated', cnode.lastActiveItem, item);
				if (uriSpec.test(item.getURI()))
					deps.fire({obj:this,channel}, 'activated',   item, cnode.lastActiveItem);
				cnode.lastActiveItem = item;
			}))
		}
	}
	removeDep_itemsActivationChange(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.activationChange';
		deps.remove({obj:this,channel}, obj2);
	}


	// callback(<activateditem>, <previousActiveItem>)
	addDep_itemsActivated(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.activated';

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onWorkspaceItemActivated';
			cnode.lastActiveItem = this.activePaneContainer.getActivePaneItem();
			cnode.disposables.add(this.onDidChangeActivePaneItem((item)=>{
				if (uriSpec.test(item.getURI()))
					deps.fire({obj:this,channel}, item, cnode.lastActiveItem);
				cnode.lastActiveItem = item;
			}))
		}
	}
	removeDep_itemsActivated(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.activated';
		deps.remove({obj:this,channel}, obj2);
	}


	// callback(<deactivateditem>, <newActiveItem>)
	addDep_itemsDeactivated(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.deactivated';

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onWorkspaceItemDeactivated';
			cnode.lastActiveItem = this.activePaneContainer.getActivePaneItem();
			cnode.disposables.add(this.onDidChangeActivePaneItem((item)=>{
				if (cnode.lastActiveItem && uriSpec.test(cnode.lastActiveItem.getURI()))
					deps.fire({obj:this,channel}, cnode.lastActiveItem, item);
				cnode.lastActiveItem = item;
			}))
		}
	}
	removeDep_itemsDeactivated(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'items'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.deactivated';
		deps.remove({obj:this,channel}, obj2);
	}






	// callback('openned',     <editor>, <pane>, <index>)
	// callback('activated',   <editor>, <previousActiveEditor>)
	// callback('deactivated', <editor>, <newActiveEditor>)
	addDep_textEditors(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'');

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onTextEditorChanged';
			cnode.lastActiveEditor = this.getActiveTextEditor();
			cnode.disposables.add(this.onDidAddTextEditor((event)=>{
				if (uriSpec.test(event.textEditor.getURI()))
					deps.fire({obj:this,channel}, {type:'openned',...event, editor:event.textEditor})
			}))
			cnode.disposables.add(this.onDidChangeActiveTextEditor((editor)=>{
				if (cnode.lastActiveEditor && uriSpec.test(cnode.lastActiveEditor.getURI()))
					deps.fire({obj:this,channel}, 'deactivated', cnode.lastActiveEditor, editor)
				if (uriSpec.test(editor.getURI()))
					deps.fire({obj:this,channel}, 'activated',   editor, cnode.lastActiveEditor)
				cnode.lastActiveEditor = editor;
			}))
		}
	}
	removeDep_textEditors(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'');
		deps.remove({obj:this,channel}, obj2);
	}

	// callback(<opennedEditor>, <pane>, <index>)
	addDep_textEditorsOpenned(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.openned';

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onTextEditorOpenned';
			cnode.disposables.add(this.onDidAddTextEditor((event)=>{
				if (uriSpec.test(event.textEditor.getURI()))
					deps.fire({obj:this,channel}, event.textEditor, event.pane, event.index)
			}))
		}
	}
	removeDep_textEditorsOpenned(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.openned';
		deps.remove({obj:this,channel}, obj2);
	}

	// callback('activated',   <editor>, <previousActiveEditor>)
	// callback('deactivated', <editor>, <newActiveEditor>)
	addDep_textEditorsActivationChanged(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.activationChanged';

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onTextEditorActivationChanged';
			cnode.lastActiveEditor = this.getActiveTextEditor();
			cnode.disposables.add(this.onDidChangeActiveTextEditor((editor)=>{
				if (cnode.lastActiveEditor && uriSpec.test(cnode.lastActiveEditor.getURI()))
					deps.fire({obj:this,channel}, 'deactivated', cnode.lastActiveEditor, editor)
				if (uriSpec.test(editor.getURI()))
					deps.fire({obj:this,channel}, 'activated',   editor, cnode.lastActiveEditor)
				cnode.lastActiveEditor = editor;
			}))
		}
	}
	removeDep_textEditorsActivationChanged(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.activationChanged';
		deps.remove({obj:this,channel}, obj2);
	}

	// callback(<activatedEditor>, <previousActiveEditor>)
	addDep_textEditorsActivated(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.activated';

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onTextEditorActivated';
			cnode.lastActiveEditor = this.getActiveTextEditor();
			cnode.disposables.add(this.onDidChangeActiveTextEditor((editor)=>{
				if (uriSpec.test(editor.getURI()))
					deps.fire({obj:this,channel}, editor, cnode.lastActiveEditor)
				cnode.lastActiveEditor = editor;
			}))
		}
	}
	removeDep_textEditorsActivated(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.activated';
		deps.remove({obj:this,channel}, obj2);
	}

	// callback(<deactivatedEditor>, <newActiveEditor>)
	addDep_textEditorsDeactivated(uriSpec, obj2, callback) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.deactivated';

		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onTextEditorDeactivated';
			cnode.lastActiveEditor = this.getActiveTextEditor();
			cnode.disposables.add(this.onDidChangeActiveTextEditor((editor)=>{
				if (cnode.lastActiveEditor && uriSpec.test(cnode.lastActiveEditor.getURI()))
					deps.fire({obj:this,channel}, cnode.lastActiveEditor, editor)
				cnode.lastActiveEditor = editor;
			}))
		}
	}
	removeDep_textEditorsDeactivated(uriSpec, obj2) {
		uriSpec = this._normalizeURISpec(uriSpec)
		const channel = 'textEditors'+((uriSpec!='/^/')?`(${uriSpec})`:'')+'.deactivated';
		deps.remove({obj:this,channel}, obj2);
	}







	// callback('openned'    <pane>)
	// callback('destroyed'  <pane>)
	// callback('activated'  <pane>, <previousActivePane>)
	// callback('dectivated' <pane>, <newActivePane>)
	addDep_panes(obj2, callback) {
		const channel = 'panes';
		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onPaneChanged';
			cnode.lastActivePane = this.activePaneContainer.getActivePane();
			cnode.disposables.add(this.onDidAddPane((event)=>{
				deps.fire({obj:this,channel}, 'openned', event.pane)
			}))
			cnode.disposables.add(this.onDidDestroyPane((event)=>{
				deps.fire({obj:this,channel}, 'destroyed', event.pane)
			}))
			cnode.disposables.add(this.onDidChangeActivePane((event)=>{
				cnode.lastActivePane && deps.fire({obj:this,channel}, 'deactivated', cnode.lastActivePane, event.pane);
				deps.fire({obj:this,channel}, 'activated',   event.pane, cnode.lastActivePane);
				cnode.lastActivePane = event.pane;
			}))
		}
	}
	removeDep_panes(obj2) {
		const channel = 'panes';
		deps.remove({obj:this,channel}, obj2);
	}


	// callback(<opennedPane>)
	addDep_panesOpenned(obj2, callback) {
		const channel = 'panes.openned';
		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onPaneOpenned';
			cnode.disposables.add(this.onDidAddPane((event)=>{
				deps.fire({obj:this,channel}, event.pane)
			}))
		}
	}
	removeDep_panesOpenned(obj2) {
		const channel = 'panes.openned';
		deps.remove({obj:this,channel}, obj2);
	}


	// callback(<destroyedPane>)
	addDep_panesDestroyed(obj2, callback) {
		const channel = 'panes.destroyed';
		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onPaneDestroyed';
			cnode.disposables.add(this.onDidDestroyPane((event)=>{
				deps.fire({obj:this,channel}, event.pane)
			}))
		}
	}
	removeDep_panesDestroyed(obj2) {
		const channel = 'panes.destroyed';
		deps.remove({obj:this,channel}, obj2);
	}


	// callback(<activatedPane>, <previousActivePane>)
	addDep_panesActivated(obj2, callback) {
		const channel = 'panes.activated';
		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onPaneActivated';
			cnode.lastActivePane = this.activePaneContainer.getActivePane();
			cnode.disposables.add(this.onDidChangeActivePane((event)=>{
				deps.fire({obj:this,channel}, event.pane, cnode.lastActivePane)
				cnode.lastActivePane = event.pane;
			}))
		}
	}
	removeDep_panesActivated(obj2) {
		const channel = 'panes.activated';
		deps.remove({obj:this,channel}, obj2);
	}

	// callback(<deactivatedPane>, <newActivePane>)
	addDep_panesDeactivated(obj2, callback) {
		const channel = 'panes.deactivated';
		const cnode = deps.add({obj:this,channel}, obj2, callback);

		// if we just created the cnode, register the callback to fire changes to this channel
		if (cnode.isNew()) {
			cnode.defaultTargetMethodName = 'onPaneDeactivated';
			cnode.lastActivePane = this.activePaneContainer.getActivePane();
			cnode.disposables.add(this.onDidChangeActivePane((event)=>{
				cnode.lastActivePane && deps.fire({obj:this,channel}, cnode.lastActivePane, event.pane)
				cnode.lastActivePane = event.pane;
			}))
		}
	}
	removeDep_panesDeactivated(obj2) {
		const channel = 'panes.deactivated';
		deps.remove({obj:this,channel}, obj2);
	}
}

new AtomWorkspacePolyfill().install();
