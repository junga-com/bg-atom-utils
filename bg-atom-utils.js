import {RegisterPackage} from 'bg-dom'
RegisterPackage(__filename);

// pass through the utility exports for common things that packages that use us need to do so that they dont have to declare extra dependencies
export {Disposables,DependentsGraph,ChannelNode,FirstParamOf,ArrangeParamsByType,BGPromise,BGRepeatablePromise,RegisterPackage} from 'bg-dom'
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
