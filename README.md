# bg-atom-utils package

## 2020-09 Status

As of 2020-09 this is a work in progress and is on its second version. The dependency between this and bg-redom-ui has flipped. That will evolve into an independent JS / DOM component library and this package will use that library to provide an Atom specific API.

A new feature in this release that I am excited about is the PolyfillObjectMixin pattern. I submitted several PR to Atom projects in the beginning of the year that have gotten no attention despite asking for advice in the atom slack group. This pattern allows me to publish Atom plugins that depend on those changes by including a dynamically applied patch which will automatically turn off if the PR is ever accepted.

This package provides extensions to most of the atom.* objects using PolyfillObjectMixin that are currently unconditionally installed when the first atom package imports this npm.  If this becomes popular, I will have to improve the mechanism to deal
with different versions of this npm being used and other packages also using PolyfillObjectMixin to provide extensions that might conflict.


# Summary

This is an NPM Package that provides utilities to for writing Atom plugins.

It extends many of the objects found at atom.* in the global namespace by providing PollyfillObjectMixin classes that are installed when the
first atom package that depends on this package is loaded.

See the atom package bg-atom-packageDev (WIP) which (will) demonstrate how to use this package and provide some tools for development.

### Classes
  * class BGAtomPlugin :  base class for creating the main entrypoint for Atom packages.
  * class BGAtomView   :  base class for creating new Atom WorkspaceItems displayed in panes.
  * class BGTimer       : class for simple timing of code
  * class BGFeedbackDialog :  class for displaying feedback for long tasks

### Functions
  * function bgAsyncSleep(ms) : delay function to be used in sync functions
  * function DispatchCommand -- wrapper for atom.commands.dispatch on the active target
  * function BGRemoveKeybindings -- dynamically disable some keystroke from your package

### Dynamic Patches (aka Atom polyfills)
These are enhancements to the Atom API. The global objects or classes are patched to add or change methods.  These each use the PolyfillObjectMixin class to extend global objects in a controlled way.
  * atom.config
     * removeSchema : there was already an addSchema but this adds the ability to undo what addSchema does at runtime.
     * existsSchema : check to see if a schema exists at a particular key
     * addDep, addDep_<channel> : family of methods that integrate with the DependentsGraph. alternative to onDidChange
     * onDidChangeAny : enhancement to onDidChange that can register the callback on multiple keys at once and adds key to {key,newValue,oldValue}
     * getConfigKeys : query the set of available config keys
  * atom.workspace
     * addDep, addDep_<channel> : family of methods that integrate with the DependentsGraph. alternative to onDidChange
     * getItemByURI   : return the first WorkspaceItem that matches the uri
     * getItemsByURI  : return all WorkspaceItems that matches the uri in an array
     * hide           : enhances to be more flexible in matching uri
  * atom.packages
     * addDep, addDep_<channel> : family of methods that integrate with the DependentsGraph. alternative to onDidChange
  * atom.project
     * addPath  : overridden to recognize when a sandbox folder is being added and replaces the sandbox folder with the subprojects instead. This is like a shortcut to add multiple top-level root folders.
