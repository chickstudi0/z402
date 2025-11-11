# z402-client

Minimal client helper for services that require Z402 payment authentication.

Automatically:
- Detects `402 Payment Required` responses
- Builds + signs SOL / SPL transfers
- Resends request with `x-payment` header

## Install

```sh
npm install z402-client
```

## Usage
```ts
import { Z402Client } from "z402-client";
import { Connection, clusterApiUrl, Keypair } from "@solana/web3.js";

const connection = new Connection(clusterApiUrl("devnet"));
const wallet = {
  publicKey: keypair.publicKey,
  signTransaction: (tx) => connection.sendTransaction(tx, [keypair]),
};

const client = new Z402Client({ connection, wallet });

const res = await client.get("http://localhost:3000/paid", {}, {
    computeUnits: 300_000,
    priorityMicroLamports: 200_000,
});

console.log(await res.text());

```