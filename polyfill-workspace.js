import { PolyfillObjectMixin,ArrangeParamsByType,Disposables,ChannelNode} from 'bg-dom';
import fs from 'fs';

// <itemSpec> is a syntax to specify one or more matching item URI. It can be specified as a literal regex or as a string with the
// following syntax. The string form allows embedding <itemSpec> in a larger DependentsGraph channel value.
//      ''                         : empty string creates the regex /^/ that matches all item URI
//      '/<expression>/[<flags>]'  : string representation of a regex is converted to its RegExp
//      '<expression>'             : without the enclosing "/", it is converted to the regex /^<expression/ to matches URI starting
//                                   with <expression>   e.g. 'atom://' will be interpretted as the regex /^atom:[/][/]/
const ItemSpecStr = '([/](?<itemRe>.*)[/](?<itemFlags>[gmisuy]*)|(?<itemStr>.*))'



// helper function for itemForURI, getItemByURI and getItemsByURI
function URISpecToRegex(uriSpec) {
	if (typeof uriSpec == 'string')
		return new RegExp('^'+uriSpec);
	if (!uriSpec)
		return /^/;
	if (typeof uriSpec == 'object' && uriSpec instanceof RegExp)
		return uriSpec;
	console.assert(false, 'malformed uriSpec in URISpecToRegex(uriSpec, uri)', {uriSpec})
}

// A PolyfillObjectMixin is a way to install dynamic patches to a JS object at runtime.  This pollyfill extends the atom.workspace
// global object with new features.
//   * addDep*, removeDep* family of functions are wrappers over the DependentsGraph system's global deps.add(),deps.remove() functions.
//   * itemForURI is a missing method. You can get paneForURI and then <pane>.itemForURI but this lets you do it in one step
//   * new functions that take a URI to match use a relaxed match so that the URI must only match the start of the item's URI
//     Also can provide RexExp
export class AtomWorkspacePolyfill extends PolyfillObjectMixin {
	constructor() {
		super(
			atom.workspace,
			['itemForURI','getItemByURI','getItemsByURI','hide','openTextFile',
			 'getChannel','addDep','removeDep',
			 'addDep_uriOpening',
			 'addDep_item',      'removeDep_item',      'addDep_itemOpened',      'removeDep_itemOpened',      'addDep_itemDestroyed','removeDep_itemDestroyed', 'addDep_itemActivated',      'removeDep_itemActivated',       ,'addDep_itemDeactivated',      'removeDep_itemDeactivated',
			 'addDep_textEditor','removeDep_textEditor','addDep_textEditorOpened','removeDep_textEditorOpened',                                                  'addDep_textEditorActivated','removeDep_textEditorActivated', ,'addDep_textEditorDeactivated','removeDep_textEditorDeactivated',
			 'addDep_pane',      'removeDep_pane',      'addDep_paneOpened',      'removeDep_paneOpened',      'addDep_paneDestroyed','removeDep_paneDestroyed', 'addDep_paneActivated',      'removeDep_paneActivated',       ,'addDep_paneDeactivated',      'removeDep_paneDeactivated'
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

	// extend openTextFile to support a convention to use the querystring to specify which type of editor to open the file in.
	// I wanted the default behavior for .bgdeps files to open in the cyto graphical view but I also wanted to support a button
	// in that view to open the file in a text editor. I had some success with calling the undocumented atom.workspace.openTextFile
	// from my plugin's oppener function when I detected the querystring but because that method is async and the openers are invoked
	// synchronously, I could not make it work reliably. An alternate patch would be to fix open to resolve promises if the opener
	// callback returns one but that would be harder since its in the middle of a method.
	async openTextFile(uri, options) {
		const uriNew = uri.replace(/[?]editor=text\s*$/,"");
		if (uriNew!=uri && !fs.existsSync(uri) && fs.existsSync(uriNew))
			uri = uriNew;
		return this.orig_openTextFile(uri,options)
	}

	// return the normalized DependentsGraph channel that represents the passed in values.
	// Params:
	//    <objType>    : one of (item|textEditor|pane). The type of workspace object to be dependent on.
	//    <actionType> : one of (<emptyString>|opened|destroyed|activated|deactivated) The action on <objType> to be dependent on
	//    <uriSpec>    : limit the dependency relationship to changes to <objTypes> that match uriSpec.
	//                 uriSpec can be a RegExp object or the string representation of a RegExp object (like '/<exp>/[<flags>]')
	//                 if uriSpec is a string not matching the RegExp syntax, <objType> URI that start with that string will be matched.
	getChannel(objType, actionType, uriSpec) {
		if (!objType)
			return deps.fAll;
		var channel = objType;
		if (uriSpec && uriSpec!='/^/') {
			channel += '('+uriSpec.toString()+')'
		}
		if (actionType)
			channel += '.'+actionType
		return channel;
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
		uriSpec = URISpecToRegex(uriSpec)
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
		uriSpec = URISpecToRegex(uriSpec)
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
		for (const item of this.getItemsByURI(uriSpec)) {
			this.orig_hide(item.getURI());
		}
	}

	/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
	// DependentsGraph Integration:
	//    The following methods provide wrappers over deps.add(... ) and deps.remove(... ). This is just syntaxic sugar that makes
	//    it more obvious to users of the atom.workspace how to make their objects dependent on atom.workspace changes and which
	//    channels can be declared dependence on.
	//    At the bottom of this module is the AtomWorkspaceChannelNode class which is the actual integration that ties Atom's Event
	//    Subscription model into the DependentsGraph system.
	//
	//    The significant difference in using these methods to subscribe to changes rather than the ::on<somthing> methods is that
	//    you do not have to store disposable objects to later remove the subscription. Because the addDep... family of functions
	//    declare a dependency between two objects, when either one is removed from the DependentsGraph system, the subscription
	//    will be canceled. It also means that the subscription is uniquely identified by {obj1,channel,obj2} so calling the
	//    coresponding removeDep<...> function with the same parameters will remove just that one subscription.
	//
	//    These wrapper are more terse than calling the deps system directly....
	// 	     atom.workspace.addDep_itemOpened(uriSpec, obj2, callback);
	//           ... is the same as ...
	//       deps.add({obj:atom.workspace,channel:atom.workspace.getChannel('item', 'opened', uriSpec)  }, obj2, callback);


	// <obj2>.onWorkspaceChanged(<objType>, <actionType>, <obj>, ...)
	// callback(<objType>, <actionType>, <obj>, ...)
	// callback('item',       'opened',      <item>,   <pane>, <index>)
	// callback('item',       'destroyed',   <item>,   <pane>, <index>)
	// callback('item',       'activated',   <item>,   <previousActiveItem>)
	// callback('item',       'deactivated', <item>,   <newActiveItem>)
	// callback('textEditor', 'opened',      <editor>, <pane>, <index>)
	// callback('textEditor', 'activated',   <editor>, <previousActiveEditor>)
	// callback('textEditor', 'deactivated', <editor>, <newActiveEditor>)
	// callback('pane',       'opened'       <pane>)
	// callback('pane',       'destroyed'    <pane>)
	// callback('pane',       'activated'    <pane>,   <previousActivePane>)
	// callback('pane',       'deactivated'  <pane>,   <newActivePane>)
	addDep(   obj2, callback) {deps.add(   this, obj2, callback);}
	removeDep(obj2)           {deps.remove(this, obj2);}


	// <obj2>.onURIOpening(uri)
	// Note: not sure if this should follow the DependentsGraph pattern yet. This is a plugin pattern where the callback implements
	// polymorphism. Maybe that is should be a different pattern. The key difference between this and other addDep* relations is that
	// the callback can return a value which changes the bevior of the source side of the relationship.
	// Return Value:
	//   <viewOrItem> : Can be an object inherited from HTMLElement or an item that as a registered view
	addDep_uriOpening(uriSpec, obj2, callback) {deps.add({obj:this,  channel:this.getChannel('uri', 'opening', uriSpec)},obj2,callback)}


	// <obj2>.onWorkspaceItemChanged(<actionType>, <item>, ...)
	// callback('opened',      <item>, <pane>, <index>)
	// callback('destroyed',   <item>, <pane>, <index>)
	// callback('activated',   <item>, <previousActiveItem>)
	// callback('deactivated', <item>, <newActiveItem>)
	// where:
	//    <item> : is the item matching the uriSpec
	//    <pane> : is the workspace pane that contains <item>
	//    <index>: is the index of <item> in <pane>.items
	addDep_item(   uriSpec, obj2, callback)            {deps.add(   {obj:this,  channel:this.getChannel('item', '', uriSpec)  }, obj2, callback);}
	removeDep_item(uriSpec, obj2)                      {deps.remove({obj:this,  channel:this.getChannel('item', '', uriSpec)  }, obj2);}

	// <obj2>.onWorkspaceItemOpened(<item>, <pane>, <index>)
	// callback(<openedItem>, <pane>, <index>)
	addDep_itemOpened(   uriSpec, obj2, callback)     {deps.add(   {obj:this, channel:this.getChannel('item', 'opened', uriSpec)  }, obj2, callback);}
	removeDep_itemOpened(uriSpec, obj2)               {deps.remove({obj:this, channel:this.getChannel('item', 'opened', uriSpec)  }, obj2);}

	// <obj2>.onWorkspaceItemDestroyed(<item>, <pane>, <index>)
	// callback(<destroyedItem>, <pane>, <index>)
	addDep_itemDestroyed(   uriSpec, obj2, callback)   {deps.add(   {obj:this,  channel:this.getChannel('item', 'destroyed', uriSpec)  }, obj2, callback);}
	removeDep_itemDestroyed(uriSpec, obj2)             {deps.remove({obj:this,  channel:this.getChannel('item', 'destroyed', uriSpec)  }, obj2);}

	// <obj2>.onWorkspaceItemActivated(<item>, <previousActiveItem>)
	// callback(<activateditem>, <previousActiveItem>)
	addDep_itemActivated(   uriSpec, obj2, callback)   {deps.add(   {obj:this,  channel:this.getChannel('item', 'activated', uriSpec)  }, obj2, callback);}
	removeDep_itemActivated(uriSpec, obj2)             {deps.remove({obj:this,  channel:this.getChannel('item', 'activated', uriSpec)  }, obj2);}

	// <obj2>.onWorkspaceItemDeactivated(<item>, <newActiveItem>)
	// callback(<deactivateditem>, <newActiveItem>)
	addDep_itemDeactivated(   uriSpec, obj2, callback) {deps.add(   {obj:this,  channel:this.getChannel('item', 'deactivated', uriSpec)  }, obj2, callback);}
	removeDep_itemDeactivated(uriSpec, obj2)           {deps.remove({obj:this,  channel:this.getChannel('item', 'deactivated', uriSpec)  }, obj2);}

	// <obj2>.onWorkspaceTextEditorChanged(<actionType>, <editor>, ...)
	// callback('opened',      <editor>, <pane>, <index>)
	// callback('activated',   <editor>, <previousActiveEditor>)
	// callback('deactivated', <editor>, <newActiveEditor>)
	addDep_textEditor(   uriSpec, obj2, callback)            {deps.add(   {obj:this,  channel:this.getChannel('textEditor', '', uriSpec)  }, obj2, callback);}
	removeDep_textEditor(uriSpec, obj2)                      {deps.remove({obj:this,  channel:this.getChannel('textEditor', '', uriSpec)  }, obj2);}

	// <obj2>.onWorkspaceTextEditorOpened(<editor>, <pane>, <index>)
	// callback(<openedEditor>, <pane>, <index>)
	addDep_textEditorOpened(   uriSpec, obj2, callback)     {deps.add(   {obj:this,  channel:this.getChannel('textEditor', 'opened', uriSpec)  }, obj2, callback);}
	removeDep_textEditorOpened(uriSpec, obj2)               {deps.remove({obj:this,  channel:this.getChannel('textEditor', 'opened', uriSpec)  }, obj2);}

	// <obj2>.onWorkspaceTextEditorActivated(<editor>, <previousActiveEditor>)
	// callback(<activatedEditor>, <previousActiveEditor>)
	addDep_textEditorActivated(   uriSpec, obj2, callback)   {deps.add(   {obj:this,  channel:this.getChannel('textEditor', 'activated', uriSpec)  }, obj2, callback);}
	removeDep_textEditorActivated(uriSpec, obj2)             {deps.remove({obj:this,  channel:this.getChannel('textEditor', 'activated', uriSpec)  }, obj2);}

	// <obj2>.onWorkspaceTextEditorDeactivated(<editor>, <newActiveEditor>)
	// callback(<deactivatedEditor>, <newActiveEditor>)
	addDep_textEditorDeactivated(   uriSpec, obj2, callback) {deps.add(   {obj:this,  channel:this.getChannel('textEditor', 'deactivated', uriSpec)  }, obj2, callback);}
	removeDep_textEditorDeactivated(uriSpec, obj2)           {deps.remove({obj:this,  channel:this.getChannel('textEditor', 'deactivated', uriSpec)  }, obj2);}


	// <obj2>.onWorkspaceTextPaneChanged(<actionType>, <pane>, ...)
	// callback('opened'     <pane>)
	// callback('destroyed'  <pane>)
	// callback('activated'  <pane>, <previousActivePane>)
	// callback('deactivated' <pane>, <newActivePane>)
	addDep_pane(   obj2, callback)            {deps.add(   {obj:this,  channel:'panes'  }, obj2, callback);}
	removeDep_pane(obj2)                      {deps.remove({obj:this,  channel:'panes'  }, obj2);}

	// <obj2>.onWorkspaceTextPaneOpened(<pane>)
	// callback(<openedPane>)
	addDep_paneOpened(   obj2, callback)     {deps.add({obj:this,     channel:'panes.opened'  }, obj2, callback);}
	removeDep_paneOpened(obj2)               {deps.remove({obj:this,  channel:'panes.opened'  }, obj2);}

	// <obj2>.onWorkspaceTextPaneDestroyed(<pane>)
	// callback(<destroyedPane>)
	addDep_paneDestroyed(   obj2, callback)   {deps.add({obj:this,     channel:'panes.destroyed'  }, obj2, callback);}
	removeDep_paneDestroyed(obj2)             {deps.remove({obj:this,  channel:'panes.destroyed'  }, obj2);}

	// <obj2>.onWorkspaceTextPaneActivated(<pane>, <previousActivePane>)
	// callback(<activatedPane>, <previousActivePane>)
	addDep_paneActivated(   obj2, callback)   {deps.add({obj:this,     channel:'panes.activated'  }, obj2, callback);}
	removeDep_paneActivated(obj2)             {deps.remove({obj:this,  channel:'panes.activated'  }, obj2);}

	// <obj2>.onWorkspaceTextPaneDeactivated(<pane>, <newActivePane>)
	// callback(<deactivatedPane>, <newActivePane>)
	addDep_paneDeactivated(   obj2, callback) {deps.add({obj:this,     channel:'panes.deactivated'  }, obj2, callback);}
	removeDep_paneDeactivated(obj2)           {deps.remove({obj:this,  channel:'panes.deactivated'  }, obj2);}
}





// Integration with DependentsGraph System
// This registers a custom ChannelNode type in the DependentsGraph system so that it can manage the integration with atom.workspace
// Event Subscriptions. When a dependency relationship is added with atom.workspace as the source object, this specific Class of
// ChannelNode will be created so that it can interpret the channel and create the correct atom.workspace Event Subscriptions to
// fire the relationship when needed. When the last relationship of that channel is removed, those atom.workspace Event Subscriptions
// will be disposed.
class AtomWorkspaceChannelNode extends ChannelNode {
	// in this case we made one class that works with all channel of the atom.workspace object so we do not consider channel in the match
	static matchSource(obj1,channel) {return obj1===atom.workspace}
	static resolveChannel(channel) {
		if (channel === deps.fAll)
			return {channelType:'all', channelAction:'', itemSpec:''};
		else {
			const rematch = AtomWorkspaceChannelNode.channelRegex.exec((channel)?channel.toString():'');
			if (!rematch) return {};
			const { channelType, channelAction='' } = rematch.groups
			const itemSpec = new RegExp(
				(rematch.groups.itemRe)
					? rematch.groups.itemRe
					: (rematch.groups.itemStr)
						? '^'+rematch.groups.itemStr
						:'^',
				rematch.groups.itemFlags
			);

			return {channelType, channelAction, itemSpec}
		}
	}

	constructor(obj, channel) {
		super(obj, channel);

		const { channelType, channelAction, itemSpec} = AtomWorkspaceChannelNode.resolveChannel(channel);

		if (!channelType) {
			console.assert(false, 'malformed DependentsGraph channel for atom.workspace', {obj,channel});
			throw 'malformed DependentsGraph channel for atom.workspace';
		}

		switch (channelType) {
			case 'uri':
				switch (channelAction) {
					case 'opening':
						this.defaultTargetMethodName = 'onURIOpening';
						this.disposables.add(obj.addOpener((uri)=>{
							if (itemSpec.test(uri)) {
								const results = deps.fire({obj,channel}, uri);
								return results;
							}
						}))
						break;
				}
				break;
			case 'item':
				this.lastActiveItem = obj.activePaneContainer.getActivePaneItem();
				switch (channelAction) {
					case 'opened':
						this.defaultTargetMethodName = 'onWorkspaceItemOpened';
						this.disposables.add(obj.onDidOpen((event)=>{
							if (itemSpec.test(event.uri))
								deps.fire({obj,channel}, event.item, event.pane, event.index)
						}))
						break;
					case 'destroyed':
						this.defaultTargetMethodName = 'onWorkspaceItemDestroyed';
						this.disposables.add(obj.onDidDestroyPaneItem((event)=>{
							if (itemSpec.test(event.item.getURI()))
								deps.fire({obj,channel}, 'destroyed', event.item, event.pane, event.index)
						}))
						break;
					case 'activated':
						this.defaultTargetMethodName = 'onWorkspaceItemActivated';
						this.disposables.add(obj.onDidChangeActivePaneItem((item)=>{
							if (item && itemSpec.test(item.getURI()))
								deps.fire({obj,channel}, 'activated',   item, this.lastActiveItem);
							this.lastActiveItem = item;
						}))
						break;
					case 'deactivated':
						this.defaultTargetMethodName = 'onWorkspaceItemDeactivated';
						this.disposables.add(obj.onDidChangeActivePaneItem((item)=>{
							if (this.lastActiveItem && itemSpec.test(this.lastActiveItem.getURI()))
								deps.fire({obj,channel}, 'deactivated', this.lastActiveItem, item);
							this.lastActiveItem = item;
						}))
						break;
					default:
						this.defaultTargetMethodName = 'onWorkspaceItemChanged';
						this.disposables.add(obj.onDidOpen((event)=>{
							if (itemSpec.test(event.uri))
								deps.fire({obj,channel}, 'opened', event.item, event.pane, event.index)
						}))
						this.disposables.add(obj.onDidDestroyPaneItem((event)=>{
							if (itemSpec.test(event.item.getURI()))
								deps.fire({obj,channel}, 'destroyed', event.item, event.pane, event.index)
						}))
						this.disposables.add(obj.onDidChangeActivePaneItem((item)=>{
							if (this.lastActiveItem && itemSpec.test(this.lastActiveItem.getURI()))
								deps.fire({obj,channel}, 'deactivated', this.lastActiveItem, item);
							if (item && itemSpec.test(item.getURI()))
								deps.fire({obj,channel}, 'activated',   item, this.lastActiveItem);
							this.lastActiveItem = item;
						}))
				}
				break;

			case 'textEditor':
				this.lastActiveEditor = obj.getActiveTextEditor();
				switch (channelAction) {
					case 'opened':
						this.defaultTargetMethodName = 'onTextEditorOpened';
						this.disposables.add(obj.onDidAddTextEditor((event)=>{
							if (itemSpec.test(event.textEditor.getURI()))
								deps.fire({obj,channel}, event.textEditor, event.pane, event.index)
						}))
						break;
					case 'activated':
						this.defaultTargetMethodName = 'onTextEditorActivated';
						this.disposables.add(obj.onDidChangeActiveTextEditor((editor)=>{
							if (itemSpec.test(editor.getURI()))
								deps.fire({obj,channel}, editor, this.lastActiveEditor)
							this.lastActiveEditor = editor;
						}))
						break;
					case 'deactivated':
						this.defaultTargetMethodName = 'onTextEditorDeactivated';
						this.disposables.add(obj.onDidChangeActiveTextEditor((editor)=>{
							if (this.lastActiveEditor && itemSpec.test(this.lastActiveEditor.getURI()))
								deps.fire({obj,channel}, this.lastActiveEditor, editor)
							this.lastActiveEditor = editor;
						}))
						break;
					default:
						this.defaultTargetMethodName = 'onTextEditorChanged';
						this.disposables.add(obj.onDidAddTextEditor((event)=>{
							if (itemSpec.test(event.textEditor.getURI()))
								deps.fire({obj,channel}, 'opened', event.textEditor, event.pane, event.index)
						}))
						this.disposables.add(obj.onDidChangeActiveTextEditor((editor)=>{
							if (this.lastActiveEditor && itemSpec.test(this.lastActiveEditor.getURI()))
								deps.fire({obj,channel}, 'deactivated', this.lastActiveEditor, editor)
							if (itemSpec.test(editor.getURI()))
								deps.fire({obj,channel}, 'activated',   editor, this.lastActiveEditor)
							this.lastActiveEditor = editor;
						}))
				}
				break;
			case 'pane':
				this.lastActivePane = obj.activePaneContainer.getActivePane();
				switch (channelAction) {
					case 'opened':
						this.defaultTargetMethodName = 'onPaneOpened';
						this.disposables.add(obj.onDidAddPane((event)=>{
							deps.fire({obj,channel}, event.pane)
						}))
						break;
					case 'destroyed':
						this.defaultTargetMethodName = 'onPaneDestroyed';
						this.disposables.add(obj.onDidDestroyPane((event)=>{
							deps.fire({obj,channel}, event.pane)
						}))
						break;
					case 'activated':
						this.defaultTargetMethodName = 'onPaneActivated';
						this.disposables.add(obj.onDidChangeActivePane((pane)=>{
							deps.fire({obj,channel}, pane, this.lastActivePane);
							this.lastActivePane = pane;
						}))
						break;
					case 'deactivated':
						this.defaultTargetMethodName = 'onPaneDeactivated';
						this.disposables.add(obj.onDidChangeActivePane((pane)=>{
							this.lastActivePane && deps.fire({obj,channel}, this.lastActivePane, pane);
							this.lastActivePane = pane;
						}))
						break;
					default:
						this.defaultTargetMethodName = 'onPaneChanged';
						this.disposables.add(obj.onDidAddPane((event)=>{
							deps.fire({obj,channel}, 'opened', event.pane)
						}))
						this.disposables.add(obj.onDidDestroyPane((event)=>{
							deps.fire({obj,channel}, 'destroyed', event.pane)
						}))
						this.disposables.add(obj.onDidChangeActivePane((pane)=>{
							this.lastActivePane && deps.fire({obj,channel}, 'deactivated', this.lastActivePane, pane);
							deps.fire({obj,channel}, 'activated',   pane, this.lastActivePane);
							this.lastActivePane = pane;
						}))
				}
				break;
			case 'all':
				this.defaultTargetMethodName = 'onWorkspaceChanged';
				this.lastActiveItem   = obj.activePaneContainer.getActivePaneItem();
				this.lastActiveEditor = obj.getActiveTextEditor();
				this.lastActivePane   = obj.activePaneContainer.getActivePane();
				this.disposables.add(obj.onDidOpen((event)=>{
					deps.fire({obj,channel}, 'item', 'opened', event.item, event.pane, event.index)
				}))
				this.disposables.add(obj.onDidDestroyPaneItem((event)=>{
					deps.fire({obj,channel}, 'item', 'destroyed', event.item, event.pane, event.index)
				}))
				this.disposables.add(obj.onDidChangeActivePaneItem((item)=>{
					this.lastActiveItem && deps.fire({obj,channel}, 'item', 'deactivated', this.lastActiveItem, item);
					item && deps.fire({obj,channel}, 'item', 'activated',   item, this.lastActiveItem);
					this.lastActiveItem = item;
				}))
				this.disposables.add(obj.onDidAddTextEditor((event)=>{
					deps.fire({obj,channel}, 'textEditor', 'opened', event.textEditor, event.pane, event.index)
				}))
				this.disposables.add(obj.onDidChangeActiveTextEditor((editor)=>{
					this.lastActiveEditor && deps.fire({obj,channel}, 'textEditor', 'deactivated', this.lastActiveEditor, editor)
					deps.fire({obj,channel}, 'textEditor', 'activated',   editor, this.lastActiveEditor)
					this.lastActiveEditor = editor;
				}))
				this.disposables.add(obj.onDidAddPane((event)=>{
					deps.fire({obj,channel}, 'pane', 'opened', event.pane)
				}))
				this.disposables.add(obj.onDidDestroyPane((event)=>{
					deps.fire({obj,channel}, 'pane', 'destroyed', event.pane)
				}))
				this.disposables.add(obj.onDidChangeActivePane((pane)=>{
					this.lastActivePane && deps.fire({obj,channel}, 'pane', 'deactivated', this.lastActivePane, pane);
					deps.fire({obj,channel}, 'pane', 'activated',   pane, this.lastActivePane);
					this.lastActivePane = pane;
				}))
				break;
			default:
				console.assert(false,'logic error: channelType should have been resolved to one of item|textEditor|pane|all', {channelType});
		}
	}
}
AtomWorkspaceChannelNode.channelRegex = new RegExp(`^(?<channelType>uri|item|pane|textEditor)(?:[(]${ItemSpecStr}[)])?(?:[.](?<channelAction>opening|opened|destroyed|activated|deactivated))?$`);
deps.registerCNodeClass(AtomWorkspaceChannelNode);

new AtomWorkspacePolyfill().install();
