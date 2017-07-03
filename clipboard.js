const ncp = require('copy-paste')

module.exports = () => {

  let nextClipData

  function nextClip(cb) {
    let current
    function chk() {
      const next = pull()
      if((next ? next : '') == (current ? current : '')) {
        setTimeout(() => chk(), 300)
      } else {
        nextClipData = next
        cb(null, next)
      }
    }
    try {
      current = pull()
      chk()
    } catch(error) {
      cb(error)
    }
  }

  function nextClipClear() {
    const shouldClear = pull() === nextClipData
    if(shouldClear) {
      ncp.copy('')
    }
  }

  return {
    nextClip,
    nextClipClear,
    push
  }
}

const toString = s => s ? String(s) : ''

function push(text) {
  ncp.copy(text)
}

function pull() {
  try {
    return ncp.paste()
  } catch(error) {
    if(error.toString() === 'target STRING not available') {
      console.error(error.toString())
      return null
    }
    throw error
  }
}
