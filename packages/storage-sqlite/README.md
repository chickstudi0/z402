# z402-storage-sqlite

Storage backend for `z402`.

Provides:
- Crash-safe payment tracking
- Double-spend resistance
- Idempotent transaction recovery

## Install

```sh
npm install z402-storage-sqlite
```

## Basic Example
```ts
import express from "express";
import { createPaymentContext, type PaymentResult } from "z402/express";
import { initSqliteDb } from "z402-storage-sqlite";
import { Connection, clusterApiUrl } from "@solana/web3.js";

async function main() {
  const app = express();
  const db = initSqliteDb("payments.db"); // creates file locally

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

## Persistence (Optional)
To enable crash-proof idempotence:
```ts
import { initSqliteDb } from "z402-storage-sqlite";

const z402 = await createPaymentContext({
  connection,
  db: initSqliteDb("./payments.db"),
});
```