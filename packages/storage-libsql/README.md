# z402-storage-libsql

Storage backend for `z402`.

Provides:
- Crash-safe payment tracking
- Double-spend resistance
- Idempotent transaction recovery

## Install

```sh
npm install z402-storage-libsql
```

## Basic Example
```ts
import express from "express";
import { createPaymentContext, type PaymentResult } from "z402/express";
import { initLibsqlDb } from "z402-storage-libsql";
import { Connection, clusterApiUrl } from "@solana/web3.js";

async function main() {
  const app = express();

  const db = await initLibsqlDb({
    url: process.env.LIBSQL_URL!,       // e.g. "libsql://something.turso.dev"
    authToken: process.env.LIBSQL_AUTH, // optional
  });

  const z402 = await createPaymentContext({
    connection: new Connection(clusterApiUrl("devnet")),
    db,
  });

  // Example paid endpoint
  app.get("/paid", z402.route("DestinationWalletPubkeyHere", "1000000"), (req, res) => {
    console.log(res.locals.payment as PaymentResult)
    res.send({"message": "Payment accepted! here is your paid content.", payment: res.locals.payment });
  });

  app.listen(3000, () => console.log("Example server running on http://localhost:3000"));
}

main();


```
