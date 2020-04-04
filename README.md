# bg-atom-utils package

This is an NPM Package that provides utilities to for writing Atom plugins.

As of 2020-03 it is a work in progress and is on its second version. 

See the atom package bg-atom-packageDev which demonstrate how to use this package and (eventually) provide some tools.  

### Classes
* class BGAtomPlugin :  base class for creating the main entrypoint for Atom packages.
* class BGAtomView   :  base class for creating new Atom WorkspaceItems displayed in panes. 
* class BGStylesheet  : dynamically add and manage style rules to the DOM
* class BGTimer       : class for simple timing of code
* class BGFeedbackView :  class for displaying feedback for long tasks
* class BGAtomTreeItemFontSizer : change the size of the list items in tree-view dynamically
* class BGAtomTabFontSizer : change the size of tab controls in tree-view dynamically

### Functions
* function FirstParamOf   : helper for overloaded function parameters
* function ArrangeParamsByType   : helper for overloaded function parameters
* function GetConfigKeys         : query for all matching atom config keys
* function OnDidChangeAnyConfig  : watch for changes to multiple config keys at once
* function DispatchCommand -- wrapper for atom.commands.dispatch on the active target
* function BGRemoveKeybindings -- dynamically disable some keystroke from your package 
* function BGFindWorkspaceItemFromURI -- get an open URI if one exists
