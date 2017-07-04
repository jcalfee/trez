[![NPM](https://img.shields.io/npm/v/trez.svg)](https://www.npmjs.org/package/trez)

# About

Encrypt or decrypt files using a Trezor hardware wallet.

By design, a decrypt operation requires a confirmation on the device.  Unlike an
encrypted partition, the user can have some assurance that the data remains
encrypted unless needed.

Trez can add convenience and security, however, this is Beta software so you should
only use Trez on a secondary copy of your data.  Here are some use cases:

- Create cold-storage backups
- Use trez files to copy data to and from cold storage (keeping the USB clean).
- Keep encrypted partitions locked more often by extract commonly use data into
  Trez files.

# Usage

```bash
$ npm install -g trez

$ trez -?

Trez - File encryption program making use of Trezor hardware wallet security.


Options:
  --clipboard-save, -s  Save next clipboard copy to an encrypted file (clears
                        the clipboard).                                 [string]
  --clipboard-load, -l  Load the clipboard with decrypted data.         [string]
  --force               Force overwrite file                           [boolean]
  --help, -h, -?        Show help                                      [boolean]

Examples:
  trez --clipboard-save [myfile.txt.trez, omit to generate filename]
  trez --clipboard-load myfile.txt.trez
  trez myfile.txt                           Encrypt to myfile.txt.trez
  trez myfile.txt.trez                      Decrypt to myfile.txt
  trez myfile.txt.trez -                    Decrypt to standard out
  trez myfile.txt.trez /safe/myfile.txt     Decrypt

```

# Trez file format

The Trez format is JSON followed by binary data.  Trez files use a 256 bit
encrypted secret to unlock the larger dataset.  This lends itself to better
device performance and quick validation.

Please keep in mind the following safety design decisions were made.  Make sure
you understand any potential privacy issues:

- It is easy to identify a Trez file by looking at the data
- The Trezor's device label is saved in plain text in the trez file (that device
  is required to decrypt).
- The Trezor confirmation message is saved in plain text in the trez file (this
  phrase is required to decrypt).
- A device confirmation to decrypt is required.  However, unless Trezor is
  configured to prompt for a passphrase or needs the PIN, a confirmation to
  encrypted is not used.

# Requirements

- Clipboard (optional) - The [copy-paste](https://www.npmjs.com/package/copy-paste) package will expect one of these prgrams: "pbcopy/pbpaste (for OSX), xclip (for Linux and OpenBSD), and clip (for Windows). Currently works with node.js v0.8+."

# Environment

Node 6+

# Disclaimer

No warranty.  Audit the code or have someone check this for you.  Your fully
responsible for your own security.
