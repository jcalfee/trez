const createHash = require('create-hash')
const sodium = require('libsodium-wrappers')
const assert = require('assert')

module.exports = {
  encrypt,
  decrypt,
  dissect,
  check
}

const defaultTrezorMsg = 'Trez Cypher'

const asserts = true
const keygen = () => sodium.crypto_secretbox_keygen()

/**
  @arg {TrezorSession} session
  @arg {function} data - returns Buffer or Promise<Buffer> (collects data after the PIN)
  @arg {object} config.entropy () => <Buffer> additional entropy
  @return {Promise<Buffer>} encrypted data
*/
function encrypt(session, data, config) {
  const {
    address,
    trezorMsg,
    askOnEncrypt,
    askOnDecrypt,
    entropy,
    iv,
    saveLabel,
   } =
    Object.assign({
      address: [0],
      trezorMsg: defaultTrezorMsg,
      askOnEncrypt: false,
      askOnDecrypt: true,
      entropy: null,
      iv: undefined,
      saveLabel: false,
    }, config)

  if(!session || typeof session.cipherKeyValue !== 'function') {
    throw new TypeError('session parameter is a required Trezor session')
  }

  if(typeof data !== 'function') {
    throw new TypeError('data parameter should be a function')
  }

  if(entropy && typeof entropy !== 'function') {
    throw new TypeError('entropy parameter should be function that returns a Buffer')
  }

  if(iv) {
    iv = toBinaryBuffer(iv, 'iv needs to be a hex string or a buffer')
    if(iv.length !== 16) {
      throw new TypeError('iv needs to be 16 bytes, instead got ' + iv.length)
    }
  }

  // A 256 bit secret matches the strength of a Trezor's private key.
  //
  // By encrypting only the secret on the device (not the data), this format
  // allows for better and predictable device performance, quick decryption
  // checking, and quick decryption key changes (simply re-encrypt the secret).
  let secret = Buffer.from(keygen())
  if(asserts && secret.length !== 32) {
    throw new Error('invalid secret length')
  }

  return Promise.resolve(data()).then(data => {
    if(!Buffer.isBuffer(data)) {
      throw new TypeError('data function parameter should return a Buffer or Promise<Buffer>')
    }

    if(entropy) {
      entropyBuf = entropy()
      if(!Buffer.isBuffer(entropyBuf)) {
        throw new TypeError('entropy parameter should return a Buffer')
      }
      const h = createHash('sha256')
      h.update(secret)
      h.update(entropyBuf)
      secret = h.digest()
    }

    // Encrypt only a secret using the device
    // then encrypt the data using the secret..
    return session.cipherKeyValue(address, trezorMsg, secret,
      true/*encrypt*/, askOnEncrypt, askOnDecrypt, iv)
    .then(enc => {
      const encSecret = Buffer.from(enc.message.value, 'hex')
      if(asserts && encSecret.length !== 32) {
        throw new Error('invalid secret length')
      }

      const trezorParams = {
        address,
        trezorMsg,
        encSecret: enc.message.value,
        askOnEncrypt,
        askOnDecrypt,
        iv
      }

      const encData = secretboxEncrypt(data, secret)
      const encrypedDataSha256 = createHash('sha256').update(encData).digest().toString('hex')
      const trezorParamsSha256 = createHash('sha256').update(JSON.stringify(trezorParams)).digest().toString('hex')

      const validationParams = {
        encrypedDataSha256, trezorParamsSha256
      }

      const headers = JSON.stringify(Object.assign(trezorParams, validationParams), null, 2)
      return Buffer.concat([Buffer.from(headers + '\n'), encData])
    })
  })
}

/**
  @arg {Buffer} data
  @return {object} - {header: {trezorMsg, encSecret, ..}, dataIndex: number}
  @throws {Error} formatting errors
*/
function dissect(data) {
  let header, dataIndex
  try {
    const headerEndIdx = data.indexOf('\n}\n')
    const headerJson = data.slice(0, headerEndIdx + 2)
    header = JSON.parse(headerJson)
    assert(Array.isArray(header.address), 'address')
    assert(typeof header.trezorMsg === 'string', 'trezorMsg')
    assert(typeof header.encSecret === 'string', 'encSecret')
    assert(typeof header.askOnDecrypt === 'boolean', 'askOnDecrypt')
    assert(typeof header.askOnEncrypt === 'boolean', 'askOnEncrypt')
    dataIndex = headerEndIdx + 3
  } catch(error) {
    error.message = 'This is not a valid trez file format: ' + error.message
    throw error
  }
  return {header, dataIndex}
}

function check(data) {
  let checkHeaders
  try {
    checkHeaders = dissect(data)
  } catch(error) {
    return {validData: false, validHeader: false}
  }
  const {header: {address, trezorMsg, encSecret, askOnEncrypt, askOnDecrypt, iv}} = checkHeaders
  const {dataIndex} = checkHeaders

  const trezorParams = {address, trezorMsg, encSecret, askOnEncrypt, askOnDecrypt, iv}
  const trezorParamsSha256 = createHash('sha256').update(JSON.stringify(trezorParams)).digest().toString('hex')

  const encryptedData = data.slice(dataIndex)
  const encrypedDataSha256 = createHash('sha256').update(encryptedData).digest().toString('hex')

  const validData = encrypedDataSha256 === checkHeaders.header.encrypedDataSha256
  const validHeader = trezorParamsSha256 === checkHeaders.header.trezorParamsSha256

  return {validData, validHeader}
}

function decrypt(session, data) {
  if(!session || typeof session.cipherKeyValue !== 'function') {
    throw new TypeError('session parameter is a required Trezor session')
  }
  if(typeof data !== 'function') {
    throw new TypeError('data parameter should be a function')
  }

  return Promise.resolve(data()).then(data => {
    if(!Buffer.isBuffer(data)) {
      throw new TypeError('data function parameter should return a Buffer or Promise<Buffer>')
    }

    const {header, dataIndex} = dissect(data)
    const {address, trezorMsg, encSecret, askOnEncrypt, askOnDecrypt} = header
    const encryptedData = data.slice(dataIndex)

    return session.cipherKeyValue(address, trezorMsg, Buffer.from(encSecret, 'hex'),
      false/*encrypt*/, askOnEncrypt, askOnDecrypt)
    .then(dec => {
      const secret = Buffer.from(dec.message.value, 'hex')
      if(asserts && secret.length !== 32) {
        throw new Error('invalid secret length')
      }
      try {
        return secretboxDecrypt(encryptedData, secret)
      } catch(error) {
        error.message = 'Decryption Failed ' + error.message
        throw error
      }
    })
  })
}

function toBinaryBuffer(data, typeError = 'expecting a hex string or buffer') {
  try {
    if(typeof data === 'string') {
      data = Buffer.from(data, 'hex')
    } else {
      if(!Buffer.isBuffer(data)) {
        throw 'unknown type'
      }
    }
  } catch(error) {
    throw new TypeError(typeError)
  }
  return data
}

/**
    @arg {Buffer} buf
    @return {Buffer}
*/
function secretboxEncrypt(buf, secret) {
    const nonce = Buffer.from(sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES))
    const ciphertext = sodium.crypto_secretbox_easy(buf, nonce, secret)
    return Buffer.concat([nonce, Buffer.from(ciphertext)])
}

/**
    @arg {Buffer} buf
    @return Buffer
*/
function secretboxDecrypt(buf, secret) {
    const nonce = buf.slice(0, sodium.crypto_box_NONCEBYTES);
    const cypherbuf = buf.slice(sodium.crypto_box_NONCEBYTES);
    return sodium.crypto_secretbox_open_easy(cypherbuf, nonce, secret, 'text');
}
