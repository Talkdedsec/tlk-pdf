# Security

TLK PDF opens files that come from anywhere, so problems in how it reads them matter.

## Reporting a vulnerability

Please do **not** open a public issue for a vulnerability. Report it privately through **Security → Report a vulnerability** in this repository. Include, if you can:

- the version (shown in the shortcuts window, the **?** button),
- whether it happens in the browser, the Windows app or both,
- steps to reproduce, ideally with a sample file,
- the possible impact.

You will get an answer as soon as possible. When a fix is released, the reporter is credited if they want to be.

## What the app does and does not do

- Files are read and written on the device. The web app makes no network requests apart from loading its own files from GitHub Pages; the service worker caches them for offline use.
- The Windows app loads the same files from inside the program through a private `app://` scheme, with context isolation and the renderer sandbox turned on. The page can only receive files you open and ask the system Save dialog to write a file.
- Once a day the Windows app reads `api.github.com/repos/Talkdedsec/tlk-pdf/releases/latest` to see whether a newer release exists. Nothing about your files is sent.
- PDF JavaScript is never run (`isEvalSupported` is off and scripting is not enabled), and XFA forms are not rendered.
- Saved signatures are kept in the browser's local storage on that device only.

Out of scope: malware already running under your user account, and someone with physical access to an unlocked computer.

## Known limits that are not vulnerabilities

- **White-out covers content; it does not remove it.** The covered text and images are still in the saved file. Do not use it to redact.
- A drawn or typed signature is an image, not a cryptographic signature.
