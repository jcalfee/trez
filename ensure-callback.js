module.exports = () => {

  let ensureCallbacks = {}

  /**
    Track callbacks as they start and finish.  Any that do not complete are
    available via ensureCallbackClose.
  */
  function ensureCallback(fn) {
    return (...args) => {
      if(args.length > 0 && typeof args[args.length - 1] === 'function') {
        // track callbacks, make sure they are called
        const cb = args[args.length - 1]
        ensureCallbacks[cb] = cb
        args[args.length - 1] = (...cb2) => {
          delete ensureCallbacks[cb]
          return cb(...cb2)
        }
      }
      return fn(...args)
    }
  }

  /**
    @example <code>
    process.on('SIGINT', function () {
    ensureCallbackClose(cb => cb('exit'))
    })
    </code>

    @arg {function} handler - receives all uncompleted callbacks
  */
  function ensureCallbackClose(handler, errorHandler, returnHandler) {
    if(typeof handler !== 'function')
    throw new TypeError('handler function is required')

    for(const cb in ensureCallbacks) {
      try {
        const ret = handler(ensureCallbacks[cb])
        if(returnHandler) {
          returnHandler(ret)
        }
      } catch(e) {
        if(errorHandler) {
          errorHandler(e)
        } else {
          console.error(e)
        }
      }
    }
    ensureCallbacks = {}
  }
  return {
    ensureCallback,
    ensureCallbackClose
  }
}
