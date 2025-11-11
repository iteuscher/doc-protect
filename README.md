# Doc Protect   

## Table of Contents
- [Overview](#overview)
- [Versioning](#versioning)
- [Architecture](#architecture)
- [Technical Details](#technical-details)

![Architecture Diagram](Architecture%20Diagrams/Cloud-Server-based%20v1.png)

## Overview
Doc Protect is a document encryption platform that lets you encrypt and securely share files using a modern, passwordless approach. Instead of relying on password protected PDFs, users can unlock and share documents using modern authentication methods—like passkeys, YubiKeys, biometrics, or identity providers—while keeping encryption and decryption local in the browser for maximum privacy and security.

Doc Protct runs locally on the browser to promote privacy and interfaces with identity providers such as hardware tokens, passkeys, and SSO in order to provide a passwordless approach to key generation and encryption. This enables individuals and enterprises to store and share documents securely without relying on shared passwords. It will mitigate issues that have been exploited in recent hacks of managed file transfer services.

Adobe PDF or Microsoft Word password protection are commonly used and easy to navigate. However they rely on a shared password that cannot be changed once the password is set. Additionally, there is no rate limiting on attempts to crack the password and sharing requries giving full control to the person who the document is shared with. Doc Protect is innovative as it ties together modern advances in encryption methods and passwordless authentication to create a stronger encryption model for documents. 

## Versioning
The current Doc Protect version is v0.1 as it is in active research and development. Until v1.0 is released, the system is considered to be in a pre-alpha state and is not ready for production use.

## Architecture
Architecture diagrams are available in the folder: (Architecture Diagrams)[Architecture Diagrams]. 

## Technical Details
- [*age*](https://c2sp.org/age) is the modern file encryption method used.
- [*typage*](https://github.com/FiloSottile/typage) (a TypeScript implementation of age) is used to encrypt the file in the browser.
- [*WebAuthn PRF*](https://w3c.github.io/webauthn/#prf-extension) is used to derive the key from the user's authenticator.
- The owner's key is then used to encrypt the file and the encrypted blob is stored in the browser.






