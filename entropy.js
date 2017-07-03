const secureRandom = require('secure-random')
const createHash = require('create-hash')

module.exports = {
    random32ByteBuffer,
    addEntropy
}

/**
    @return a random buffer obtained from the secure random number generator.  Additional entropy is used.
    Additional forms of entropy are used.  A week random number generator can run out of entropy.  This should ensure even the worst random number implementation will be reasonably safe.
*/
function random32ByteBuffer() {
    if(entropyCount > 0) {
        console.log(`Additional private key entropy: ${entropyCount} events`)
        entropyCount = 0
    }
    const h = createHash('sha256')
    h.update(secureRandom.randomBuffer(32))
    h.update(Buffer.from(cpuEntropy()))
    h.update(externalEntropyArray)
    h.update(browserEntropy())
    return h.digest()
}

let entropyPos = 0, entropyCount = 0
const externalEntropyArray = secureRandom.randomBuffer(101)

/**
    Add entropy via external events (like mouse events).  This may be called many times while the amount of data saved is limited.  Data is retained in RAM for the life of this module.
    @example React <code>
    componentDidMount() {
        this.refs.MyComponent.addEventListener("mousemove", this.onEntropyEvent, {capture: false, passive: true})
    }
    componentWillUnmount() {
        this.refs.MyComponent.removeEventListener("mousemove", this.onEntropyEvent);
    }
    onEntropyEvent = (e) => {
        if(e.type === 'mousemove')
            key_utils.addEntropy(e.pageX, e.pageY, e.screenX, e.screenY)
        else
            console.log('onEntropyEvent Unknown', e.type, e)
    }
    </code>
*/
function addEntropy(...ints) {
    entropyCount++
    for(const i of ints) {
        const pos = entropyPos++ % 101
        const i2 = externalEntropyArray[pos] += i
        if(i2 > 9007199254740991)
            externalEntropyArray[pos] = 0
    }
}

/**
    This runs in just under 1 second and ensures a minimum of 512 bits of entropy are gathered.
    @return {array} counts gathered by measuring variations in the CPU speed during floating point operations.
    Based on more-entropy.
    @see https://github.com/keybase/more-entropy/blob/master/src/generator.iced
*/
function cpuEntropy() {
    const samples = 128
    let collected = []
    let lastCount = null
    let lowEntropySamples = 0
    while(collected.length < samples) {
        const count = floatingPointCount()
        if(lastCount != null) {
            const delta = count - lastCount
            if(Math.abs(delta) < 1) {
                lowEntropySamples++
                continue
            }
            // how many bits of entropy were in this sample
            const bits = Math.floor(log2(Math.abs(delta)) + 1)
            if(bits < 4) {
                lowEntropySamples++
                continue
            }
            collected.push(delta)
        }
        lastCount = count
    }
    if(lowEntropySamples > 10) {
        const pct = Number(lowEntropySamples / samples * 100).toFixed(2)
        console.error(`WARN: ${pct}% low CPU entropy re-sampled`);
    }
    return collected
}

/**
    Count while performing floating point operations during a fixed time (7 ms for example).  Using a fixed time makes this algorithm predictable in runtime.
*/
function floatingPointCount() {
    const workMinMs = 7
    const d = Date.now()
    let i = 0, x = 0
    while (Date.now()  < d + workMinMs + 1) {
        x = Math.sin(Math.sqrt(Math.log(++i + x)))
    }
    return i
}

const log2 = x => Math.log(x) / Math.LN2

/**
    Attempt to gather and hash information from the browser's window, history, and supported mime types.  For non-browser environments this simply includes secure random data.  In any event, the information is re-hashed in a loop for .25 seconds.
    @return {Buffer} 32 bytes
*/
function browserEntropy() {
    let entropyStr = Array(secureRandom.randomBuffer(101)).join()
    try {
        entropyStr += (new Date()).toString() + " " + window.screen.height + " " + window.screen.width + " " +
            window.screen.colorDepth + " " + " " + window.screen.availHeight + " " + window.screen.availWidth + " " +
            window.screen.pixelDepth + navigator.language + " " + window.location + " " + window.history.length;

        for (let i = 0, mimeType; i < navigator.mimeTypes.length; i++) {
            mimeType = navigator.mimeTypes[i];
            entropyStr += mimeType.description + " " + mimeType.type + " " + mimeType.suffixes + " ";
        }
    } catch(error) {
        //nodejs:ReferenceError: window is not defined
        entropyStr += createHash('sha256').update((new Date()).toString()).digest();
    }

    const b = new Buffer(entropyStr);
    entropyStr += b.toString('binary') + " " + (new Date()).toString();

    let entropy = entropyStr;
    const start_t = Date.now();
    while (Date.now() - start_t < 250)
        entropy = createHash('sha256').update(entropy).digest();

    return entropy;
}
