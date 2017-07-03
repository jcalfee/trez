#!/usr/bin/env node

const co = require('co')
const fs = require('fs')
const uuidv4 = require('uuid/v4')
const promisify = require('sb-promisify').default
const TrezorSession = require('trezor-session')
const {random32ByteBuffer} = require('./entropy')
const clipboard = require('./clipboard')()
const trez = require('./trez-format')

const argv = require('yargs').usage(`
Trez - File encryption program making use of Trezor hardware wallet security.
`)
.option('clipboard-save', {describe: 'Save next clipboard copy to an encrypted file (clears the clipboard).', type: 'string', alias: 's'})
.option('clipboard-load', {describe: 'Load the clipboard with decrypted data.', type: 'string', alias: 'l'})
.option('force', {describe: 'Force overwrite file', type: 'boolean'})
.example('$0 --clipboard-save [myfile.txt.trez, omit to generate filename]')
.example('$0 --clipboard-load myfile.txt.trez')

.example('$0 myfile.txt', 'Encrypt to myfile.txt.trez')
.example('$0 myfile.txt.trez', 'Decrypt to myfile.txt')
.example('$0 myfile.txt.trez -', 'Decrypt to standard out')
.example('$0 myfile.txt.trez /safe/myfile.txt', 'Decrypt')

.help('help').alias('help', 'h').alias('help', '?').argv

const files = argv._
const clipboardToFile = argv['clipboard-save']
const clipboardFromFile = argv['clipboard-load']
const force = argv['force']

// The implementation below, based on arguments will define only one:
// readCipherText or readPlainText

/* Return {function} returns Buffer */
let readCipherText

/** Return {function} return Buffer */
let readPlainText

/**
  Required
  @arg ciperOrPlain<Buffer>
  @return {undefined|Promise} complete
*/
let saveBuffer

/** @return {undefined|Promise} complete */
let onSuccess = () => {}


if(files.length && (clipboardToFile || clipboardFromFile)) {
  console.error('Please work with files or the clipboard but not both')
  process.exit(1)
}

if(files.length > 2) {
  console.error('Expecting only 2 files, instead got ' + files.length)
  process.exit(1)
}

const saveFileOrStdout = fn => buf => {
  if(fn.trim() === '-') {
    process.stdout.write(buf.toString('binary'))
    return
  }
  console.error('Writing ' + fn)
  fs.writeFileSync(fn, buf)
}

if(files.length) {
  let [f1, f2] = files

  if(!fs.existsSync(f1)) {
    console.error('File does not exist: ' + f1)
    process.exit(1)
  }

  const data = fs.readFileSync(f1)
  let isSourceEncrypted
  try {
    trez.dissect(data)
    isSourceEncrypted = true
  } catch(error) {
    isSourceEncrypted = false
  }

  if(f2 == null) {
    if(isSourceEncrypted) {
      f2 = f1.replace(/.trez$/, '')
      if(f1 === f2) {
        f2 = `${uuidv4()}.trez`
      }
    } else {
      f2 = f1 + '.trez'
    }
  }

  if(fs.existsSync(f2)) {
    if(!force) {
      console.error('File exist, use --force to overwrite: ' + f2)
      process.exit(1)
    }
  }

  if(isSourceEncrypted) {
    // decrypt trez => plainbuf
    readCipherText = () => fs.readFileSync(f1)
    saveBuffer = saveFileOrStdout(f2)
  } else {
    readPlainText = () => fs.readFileSync(f1)
    saveBuffer = saveFileOrStdout(f2)
  }
}

// clipboard to file
if(clipboardToFile != null) {
  const fn = clipboardToFile.trim() === '' ? `${uuidv4()}.trez` : clipboardToFile
  if(fs.existsSync(fn) && !force) {
    console.error('File exist, use --force to overwrite: ' + fn)
    process.exit(1)
  }
  saveBuffer = saveFileOrStdout(fn)

  readPlainText = () => {
    console.error('Checking clipboard for new data.  Copy it but do not paste.  I\'ll encrypt, save, then erase..')
    return promisify(clipboard.nextClip)().then(clip => Buffer.from(clip, 'utf-8'))
  }
  onSuccess = () => {
    console.error('Erasing clipboard')
    clipboard.nextClipClear()
  }
}

// file to clipboard
if(clipboardFromFile != null) {
  if(/^-?$/.test(clipboardFromFile.trim())) { // if dash or empty
    console.error('--clipboard-load requires a file name')
    process.exit(1)
  }
  if(!fs.existsSync(clipboardFromFile)) {
    console.error('File does not exist: ' + clipboardFromFile)
    process.exit(1)
  }
  readCipherText = () => loadFile(clipboardFromFile)
  saveBuffer = buf => clipboard.push(buf.toString('utf-8'))
}

if(!readCipherText && !readPlainText) {
  console.error('Nothing to do.')
  console.error('Try -? for help')
  process.exit(1)
}

const trezorSession = TrezorSession()

const errorExit = (error) => {
  console.error(error)
  process.exit(1)
}

trezorSession(
  (err, session) => err ?
    errorExit(err) : co.wrap(main)(session).catch(errorExit)
)

function loadFile(fn) {
  fn = fn.trim()
  let buf
  if(fn === '-') {
    console.error('data source can not be an standard input')
    process.exit(1)
  } else if(fn === '') {
    console.error('input file name is required')
    process.exit(1)
  }
  return fs.readFileSync(fn)
}

process.on('exit', function() {
  trezorSession.close()
})

function* main(session) {
  if(readPlainText) {
    const entropy = () => {
      console.error('Gathering entropy..')
      return random32ByteBuffer()
    }
    const readData = () => Promise.resolve(readPlainText())
    const config = {saveLabel: true, entropy}
    const cypherbuf = yield trez.encrypt(session, readData, config)
    yield Promise.resolve(saveBuffer(cypherbuf))
    yield Promise.resolve(onSuccess())
  } else if(readCipherText) {
    const readData = () => Promise.resolve(readCipherText())
    const plainbuf = yield trez.decrypt(session, readData)
    yield Promise.resolve(saveBuffer(plainbuf))
    yield Promise.resolve(onSuccess())
  }
  process.exit()
}
