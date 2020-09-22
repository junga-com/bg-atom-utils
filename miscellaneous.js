

export function bgAsyncSleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// This supports functions and methods with flexible parameter order
// It returns the first parameter in the call whose type matches <type>
// Params:
//    <type>  : can be a string name of a builtin type (string,number,boolan,bigint,symbol,undefined,object,function)
//              or it can be a Class object to match an object of that type (aka MyClass js token, not the string 'MyClass')
// See Also:
//    ArrangeParamsByType
export function FirstParamOf(type, ...params) {
	if (typeof type == 'string')
		// check for builtin types against this string value
		for (var param of params) {
			if (typeof param == type)
				return param
		}
	else
		// assume type is a class to check against
		for (var param of params) {
			if (typeof param == 'object' && param instanceof type)
				return param
		}
	return undefined;
}


// This supports functions and methods with flexible parameter order
// This only works if the parameter types make the identification unabiguous
// Performance Warning:
// There is a runtime cost associated with doing this so its not appropriate to use this pattern for a function or method that is
// low level and likely to be called many times in a single transaction. For higher level APIs that are called at most a few time
// per user interaction (aka transaction) the performance is neglible.
// If the caller does pass all the params in the natural order, it will be very slightly faster but that may not be significant.
// Example:
//    // The 3 parameters to this function each are of a different type. They can be given in any order and the call to ArrangeParamsByType
//    // will rearrange them if needed. Note that by convention, the input parameter names start with a $ to indicate the something
//    // special is happening.
//    function onDidChangeAny($keyContainer, $configKeyRegex, $callback) {
//       var [keyContainer, configKeyRegex, callback] = ArrangeParamsByType(arguments, 'string', RegExp, 'function');
//       ...
// Params:
//    <params> : an array of parameters to operate on. This would typically be the JS literal 'arguments' psuedo array variable
//    ...<types> : list of types, that the params are expected to be, in the order that this function will order the results
//                 Type can be a string with the name of a builtin type or a JS class token (See FirstParamOf)
// See Also:
//    FirstParamOf
export function ArrangeParamsByType(params, ...types) {
	// outer loop: goes through the types in order, placing the correct param in results from first to last. If there is no
	//    matching param, the condition in the inner loop will not fire and that slot in result is left 'undefined'.
	// inner loop: locates the param matching the current type and if found, sets it in the current results slot and removes that
	//    param from params. If the param is on either end of params, pStart or pEnd is adjusted so that they are not even iterated
	//    in future passes. If the params happen to be given in the natural order, this algorithm will be slightly faster (significant?)
	var results = new Array(types.length);
	var pStart=0, pEnd=params.length;
	eachType: for (var j=0; j<types.length; j++) {
		for (var i=pStart; i<pEnd; i++) {
			if ( (typeof types[j] == 'string') ? (typeof params[i] == types[j]) : (params[i] instanceof types[j]) ) {
				// found it
				results[j] = params[i];

				// now remove params[i] from params so that its not considered anymore in future outter loop iterations
				if (i==pStart)
					pStart++;
				else if (i==pEnd-1)
					pEnd--
				else
					params[i]=undefined;

				// done with this outer loop iteration
				continue eachType;
			}
		}
		results.push(params[i])
	}

	return results;
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
