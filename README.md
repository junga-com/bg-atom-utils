# bg-atom-utils package

This is an NPM Package that provides utilities to for writing Atom plugins.

* class BGAtomView base class for creating new Atom WorkspaceItems displayed in panes. 
* class BGFeedbackView class for displaying feedback for long tasks
* class BGTimer class for simple timing of code
* function DispatchCommand -- wrapper for atom.commands.dispatch on the active target
* function BGRemoveKeybindings -- dynamically disable some keystroke from your package 
* function BGFindWorkspaceItemFromURI -- get an open URI if one exists
* class BGStylesheet -- dynamically add and manage style rules to the DOM
* function bgAsyncSleep -- yield and continue afte a delay
* class BGAtomTreeItemFontSizer -- change the size of the list items in tree-view dynamically
* class BGAtomTabFontSizer -- change the size of tab controls in tree-view dynamically
