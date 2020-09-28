

export function bgAsyncSleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// DispatchCommand invokes <cmd> in the current active target environment.
// The active WorkspaceItem is used if it exists, other wise atom.workspace is used.
export function DispatchCommand(cmd) {
	var target = atom.workspace.getActivePaneItem();
	var targetEl = (target && target.getElement) ? target.getElement() : atom.workspace.getElement();
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
