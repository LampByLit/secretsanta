# Our Secret Santa vs Tom7's: What We Changed and Why

**TL;DR:** We kept Tom7's crypto protocol intact but automated all the manual work. Same math, way less suffering.

---

## The Big Picture

**Tom7's vision:** Math nerds manually doing 300-digit modular arithmetic, passing encrypted keys via email, taking days to complete.

**Our version:** Click button, get assignment. Same crypto, zero manual math.

**What stayed the same:** ElGamal parameters, quadratic residue fix, end-to-end encryption, assignment algorithm.

**What changed:** Everything else (automation, infrastructure, UX).

---

## 1. CORE PROTOCOL: AUTOMATED BUT IDENTICAL

### Public Key Collection

**Tom7:** Manual chain passing. Person 1 encrypts → shuffles → sends to Person 2 → Person 2 encrypts → shuffles → sends to Person 3... eventually reaches Chair who decrypts everything.

**Us:** Server encrypts all keys at once, shuffles once (cryptographically secure), Chair decrypts. Same result, way faster.

**Why:** Automation requires a server, but the server can't decrypt without the session private key. We lose the distributed chain passing, but gain speed and eliminate copy-paste errors (which Tom7 mentioned were a problem).

### Key Generation

**Tom7:** Creative randomness! Wikidata Q-IDs, train station passenger counts, robot drawings, etc. Fun but... not cryptographically secure.

**Us:** `crypto.getRandomValues()` - boring but actually secure. Still 309-digit numbers, still multiplied by 2 for quadratic residues (Tom7's fix).

**Why:** Cryptographically secure randomness > creative randomness. We kept the quadratic residue fix because it's necessary.

### Sorting & Assignments

**Tom7:** Chair manually sorts 13+ keys, creates cycle, publishes list.

**Us:** `array.sort()` with BigInt comparison. Done in milliseconds.

**Why:** Server knows the assignment mapping, but can't decrypt messages without private keys. Trade-off for automation.

---

## 2. MESSAGES: PRE-ENCRYPTED FOR SPEED

### Message Encoding

**Tom7:** Manual byte-level encoding. Participants manually pack name/address/message into a bigint with length prefixes.

**Us:** `encodeMessage()` does it automatically. Same format, same 100-byte limit (slightly conservative vs Tom7's 128 bytes to account for encoding overhead).

**Why:** Users shouldn't need to understand byte encoding. We catch size issues before encryption with helpful error messages.

### Pre-Encryption (The Big Difference)

**Tom7:** Encrypt messages on-the-fly during cycle initiation. Everyone encrypts with their Santa's public key, publishes encrypted messages, tries decrypting all of them.

**Us:** Pre-encrypt during join. When you join, you encrypt your data with everyone's public keys. When new people join, existing members backfill by encrypting for them. Server stores pre-encrypted messages, looks them up during cycle initiation.

**Why:** Performance. Spreading encryption work across time prevents timeouts with large groups. Trade-off: adds complexity (backfill system). Early joiners can't encrypt for later joiners until backfill happens - that's the "ready" status you see.

### Decryption

**Tom7:** Manually try decrypting each message until one works.

**Us:** Client automatically tries all messages, shows you the one that decrypts. Server never sees plaintext.

**Why:** Same privacy guarantees, way less manual work.

---

## 3. INFRASTRUCTURE: WEB APP VS STANDALONE HTML

### Platform

**Tom7:** Standalone HTML file. No server, no database. Everything client-side. Manual copy-paste coordination.

**Us:** Next.js app with SQLite database. Server coordinates everything. RESTful API.

**Why:** Automation needs persistence and coordination. Can't automate without a server. Trade-off: requires infrastructure, but enables async participation (no time zone coordination nightmares).

### Data Storage

**Tom7:** No storage. Participants keep their own keys (paper, files, etc.).

**Us:** SQLite database. Private keys encrypted with AES-256-GCM using passwords. Server never sees plaintext keys.

**Why:** Convenience. Members don't lose keys. Server can't decrypt without passwords anyway. Password reset exists but requires re-encryption (we warn about this).

### Authentication

**Tom7:** None. Identify by public key. Trust-based.

**Us:** Email + password per group. Bcrypt hashing. Rate limiting.

**Why:** Web apps need auth. Prevents unauthorized access. Tracks who did what. Trade-off: password management, but necessary for web app.

---

## 4. CRYPTO: IDENTICAL TO TOM7

### Parameters

**Both:** RFC 5114 MODP Group 2 (1024-bit safe prime), generator 7, private keys × 2 for quadratic residues, 309-digit numbers.

**Why:** No reason to change what works. Same security guarantees.

### Operations

**Tom7:** Manual calculations (or uses his website for the math).

**Us:** `bigint-crypto-utils` library (`modPow`, `modInv`). Native BigInt, no precision loss. Mathematically identical.

**Why:** Well-tested library > manual calculations. Less educational, but same math.

### Message Limits

**Tom7:** 128 bytes max (manual checking).

**Us:** 100 bytes max (automatic checking with helpful errors). Slightly more restrictive to account for encoding overhead.

**Why:** Better UX. Users get clear errors instead of silent failures.

---

## 5. PROTOCOL FLOW: STRUCTURED VS AD-HOC

### Group Creation

**Tom7:** Agree on order via email/chat. No formal group.

**Us:** Creator makes group, gets unique URL. Members join via URL. Status tracking: `open` → `closed` → `ready` → `messages_ready` → `complete`.

**Why:** Structure enables automation. Server needs to track state.

### Cycle Initiation

**Tom7:** Multi-day manual process. Chair generates session key, shares it, chain passing happens, chair decrypts/sorts/publishes, everyone encrypts messages, everyone decrypts.

**Us:** Click "Initiate Cycle". Server does everything: shuffle members, pick chair, generate session key, encrypt all keys, shuffle encrypted keys, decrypt, sort, create assignments, look up pre-encrypted messages. Done in seconds.

**Why:** Automation. Server can't decrypt without private keys, so security is preserved.

### Assignment Reveal

**Tom7:** Manually decrypt each message until one works.

**Us:** Click "Reveal Assignment". Client fetches messages, tries decrypting, shows result. Server sends email backup (but only after client decrypts first).

**Why:** Convenience. Server never sees plaintext.

---

## 6. SECURITY: SAME GUARANTEES, DIFFERENT TRUST MODEL

### Server Trust

**Tom7:** Fully distributed. No server. Trust only the crypto protocol.

**Us:** Centralized server coordinates everything. But:
- ✓ Server can't decrypt without private keys
- ✓ Server can't see plaintext assignments
- ✓ Server can't modify assignments (would break decryption)
- ⚠️ Server could log encrypted keys (but can't decrypt them)
- ✓ We do shuffle (cryptographically secure)

**Why:** Automation needs a server. But the server can't break security - it can't decrypt without keys. Open source code lets you verify.

### Private Key Storage

**Tom7:** Participants store keys themselves (paper, files, etc.).

**Us:** Encrypted with AES-256-GCM using passwords, stored in database. Server never sees plaintext. Client decrypts with password.

**Why:** Convenience. Server can't decrypt without passwords anyway.

### Message Privacy

**Both:** End-to-end ElGamal encryption. Server never sees plaintext. Only Santa can decrypt their santee's message.

**Us bonus:** Email backup sent, but only after client decrypts first.

**Why:** Same privacy guarantees as Tom7. Email is just convenience.

---

## 7. UX: FROM MANUAL TO AUTOMATED

### User Experience

**Tom7:** Manual, educational, takes days. High barrier (need to understand crypto).

**Us:** Automated, fast, takes minutes. Low barrier (just fill forms).

**Why:** Accessibility. Makes it usable by non-mathematicians. Trade-off: loses educational value, but we kept the crypto protocol itself.

### Error Handling

**Tom7:** Manual error catching. Copy-paste errors common (Tom7 mentioned this).

**Us:** Automatic validation, clear error messages, input checking.

**Why:** Reliability. Prevents common errors. Automated checks > manual verification.

### Coordination

**Tom7:** Manual email/chat. Need to be online simultaneously. Time zone nightmares.

**Us:** Server coordinates automatically. Async participation. No time zone issues.

**Why:** Convenience. Server enables async participation.

---

## 8. TECHNICAL DETAILS

### Database

SQLite with tables: `groups`, `members`, `assignments`, `encrypted_messages`, `pre_encrypted_messages`, `shipment_confirmations`.

**Why:** Persistence, state tracking, efficiency (pre-encryption avoids re-encryption).

### API

RESTful endpoints: create group, join, get public keys, backfill, close, initiate cycle, get encrypted messages, decrypt assignment.

**Why:** Separation of concerns, stateless, standard HTTP.

### Client vs Server Crypto

**Client:** Key generation (during join), message decryption, AES encryption/decryption of private keys.

**Server:** ElGamal encryption/decryption, session key generation, cycle initiation.

**Why:** Privacy (keys stay on client), performance (server faster for bulk ops), security (client decryption = server never sees plaintext).

### Chain Passing

**Tom7:** Actual chain. Person 1 → Person 2 → ... → Chair. Each shuffles.

**Us:** Simulated. Server encrypts all keys, shuffles once (Fisher-Yates). Same result (random order), way faster.

**Why:** Efficiency. Mathematically equivalent, loses distributed nature but gains speed.

### Status Management

**Tom7:** None. Coordinate via email/chat.

**Us:** `open` → `closed` → `ready` → `messages_ready` → `complete`. Auto-transitions.

**Why:** Clarity. Server enforces correct order. Necessary for automation.

---

## THE BOTTOM LINE

### What We Kept (Identical to Tom7)

- ✅ ElGamal parameters (1024-bit prime, generator 7)
- ✅ Quadratic residue fix (private key × 2)
- ✅ Cycle creation algorithm (sort keys, pair each with next)
- ✅ Message encryption (same ElGamal)
- ✅ End-to-end privacy (server never sees plaintext)
- ✅ Assignment logic (key before yours = your Santa)

### What We Changed

- 🤖 **Automation**: Manual → automated
- 🏗️ **Infrastructure**: Standalone HTML → web app + database
- 🎯 **Coordination**: Manual email/chat → server coordinates
- ⚡ **Pre-encryption**: On-the-fly → pre-encrypt during join
- 🎨 **UX**: Copy-paste → forms and buttons

### Security Guarantees (Same as Tom7)

- ✅ Same crypto protocol
- ✅ Same end-to-end encryption
- ✅ Server can't decrypt without private keys
- ✅ Server can't modify assignments (would break decryption)

### Trade-offs

- **Distributed → Centralized**: Server coordinates (but can't break security)
- **Manual → Automated**: Everything automated (but loses educational value)
- **Standalone → Web App**: Needs server (but enables async participation)

**TL;DR:** Same crypto, way less work. We automated execution, didn't simplify cryptography.

---

## QUICK REFERENCE

**Protocol:** Tom7 = manual chain passing, Us = automated simulated chain  
**Keys:** Tom7 = creative randomness, Us = Web Crypto API  
**Messages:** Tom7 = encrypt on-the-fly, Us = pre-encrypt during join  
**Infrastructure:** Tom7 = standalone HTML, Us = Next.js + SQLite  
**Auth:** Tom7 = none, Us = email + password  
**Crypto:** **IDENTICAL** (same prime, generator, fix)  
**Security:** **PRESERVED** (same guarantees)

