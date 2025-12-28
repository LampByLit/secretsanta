# Video Script: Implementing Tom7's Secret Santa in TypeScript

## Introduction

So Tom7 had this idea for a distributed secret Santa protocol. The problem is simple: you want to arrange gift giving among friends without anyone being in charge, and without anyone knowing who's giving to whom until the very end.

Tom7's solution uses ElGamal public key cryptography. Each person generates a key pair, encrypts their public key with a session key, passes it around in a chain, then the chair decrypts everything, sorts the keys numerically, and creates a cycle. The person whose key comes before yours in the sorted list is your Santa.

The catch? Tom7 made his friends do all of this by hand. They had to generate 300-digit random numbers, perform modular exponentiations, handle encrypted messages, and pass everything around manually. That's what I call naughty.

## The Vision

I wanted to take Tom7's entire protocol and make it work in a web app. Not simplify it, not replace the cryptography with something easier. I wanted to preserve every bit of that beautiful over-complication while making it actually usable by normal humans who don't want to spend an afternoon doing modular arithmetic.

## The Implementation

I built this in TypeScript using Next.js. The core cryptographic operations live in a custom ElGamal implementation. We're using the same 1024-bit safe prime from RFC 5114, generator 7, and we even kept Tom7's fix for quadratic residues where you multiply the private key by two.

The protocol works exactly like Tom7 described. Phase one: everyone generates a key pair. Their public key gets encrypted with a session public key. Those encrypted keys get shuffled and passed to the chair. The chair decrypts everything, sorts numerically, and creates the cycle.

But here's where it gets different.

## The Trade-offs

In Tom7's version, every person manually generates their keys, manually encrypts their public key, manually passes it to the next person in the chain, manually shuffles, and so on. The chair manually decrypts everything and manually sorts.

In my version, all of that happens automatically on the server. When you join a group, your browser generates your key pair client-side using the Web Crypto API. Your private key gets encrypted with your password and stored on the server. When the creator initiates the cycle, the server handles all the encryption, shuffling, decryption, and sorting.

This means you're trusting the server to do the protocol correctly. But honestly, you're already trusting Tom7's standalone tool, or trusting yourself not to make a copy-paste error with 300-digit numbers. The server approach eliminates human error entirely.

## What We Preserved

We kept all the cryptographic complexity. We're still using ElGamal, still dealing with 1024-bit numbers, still doing modular exponentiations. We still encrypt public keys with a session key. We still sort numerically. We still create a cycle where the key before yours is your Santa.

We even kept the quadratic residue fix. If you don't ensure all public keys are quadratic residues, someone could look at encrypted keys during the chain passing phase and rule out certain correspondences. Tom7 fixed this by multiplying private keys by two, and we do the same thing.

## What We Changed

The biggest change is that we eliminated manual cryptographic operations. No one needs to generate random numbers by counting letters in books or using train station passenger statistics. No one needs to copy-paste 300-digit numbers between emails. No one needs to manually decrypt messages by trying each encrypted blob.

Instead, when you want to see your assignment, you log in with your password. The server retrieves your encrypted private key, decrypts it with your password, and sends it to your browser. Your browser then tries decrypting each encrypted message until one works. That's your assignment.

We also added some practical features. Email notifications when assignments are ready. Shipment tracking. The ability to exclude people from the cycle. Multiple independent groups. But the core protocol is identical.

## Why This Matters

Tom7's protocol is mathematically elegant. It solves a real problem using public key cryptography in a way that's both secure and distributed. But forcing people to handle cryptographic material by hand is, as I said, naughty.

My implementation preserves that elegance while making it accessible. You still get all the cryptographic guarantees. You still get the distributed nature where no single person can cheat. But you don't need to be a math YouTuber with an afternoon to spare.

The trade-off is trust in the server. But if you're already trusting a standalone tool or trusting yourself not to make errors, trusting a server that executes the protocol correctly isn't much of a leap. And it eliminates the most common failure mode: human error.

## Conclusion

So that's how I implemented Tom7's idea in TypeScript. Same protocol, same cryptography, same mathematical complexity. Just without the manual labor. Because sometimes the best way to preserve over-complication is to automate it.

