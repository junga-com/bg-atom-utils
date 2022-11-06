import {RegisterPackage} from 'bg-dom'
RegisterPackage(__filename);

// pass through the exports from bg-dom so that atom packages can just depend on bg-atom-utils
// export {
// 	BGError,
// 	Disposable,
// 	Disposables,
// 	DependentsGraph,
// 	ChannelNode,
// 	FirstParamOf,
// 	ArrangeParamsByType,
// 	BGPromise,
// 	BGRepeatablePromise,
// 	RegisterPackage,
// 	debounce,
// 	Component,
// 	BackgroundMessage
// }                          from 'bg-dom'
export * from 'bg-dom'

export {default as dedent} from 'dedent'

export * from './polyfill-project'
export * from './polyfill-config'
export * from './polyfill-workspace'
export * from './polyfill-packageManager'
export * from './BGAtomPlugin'
export * from './BGAtomView'
export * from './BGAtomPanel'
export * from './BGTimer'
export * from './miscellaneous'
export * from './Tutorial'
