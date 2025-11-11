# z402

Express middleware for **HTTP 402-based Solana payments**.

## Install

```sh
npm install z402
```

## Basic Example (Express)
```ts
import express from "express";
import { createPaymentContext } from "z402/express";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const app = express();

(async () => {
  const z402 = await createPaymentContext({
    connection: new Connection(clusterApiUrl("devnet")),
  });

  app.get("/premium", z402.route("DEST_WALLET", "1000000"), (req, res) => 
    res.send({"message": "Paid content unlocked!", payment: res.locals.payment})
  );

  app.listen(3000);
})();
```

### Server (Hono)
```ts
import { Hono } from "hono";
import { createPaymentContext } from "z402/hono";
import { Connection } from "@solana/web3.js";

const app = new Hono();

(async () => {
  const z402 = await createPaymentContext({connection: new Connection("https://api.devnet.solana.com")});

  app.get("/paid", z402.route("DestinationWalletPubkeyHere", "1000000"), (c) => 
      c.json({"message": "Paid content unlocked!", payment: c.get("payment")})
  );
})();
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

## Status codes
- `200`: finalized payment, 
    - for express `res.locals.payment` contains tx details.
    - for hono `c.get("payment")` contains tx details.
    - `signature`: tx signature
    - `signer`: payer public key
    - `destination`: destination public key
    - `amount`: amount in lamports or raw token units
    - `mint`: null for SOL, mint address for SPL
- `202`: pending (timeout reached). Retry the same request.
- `400`: invalid tx / already pending.
- `500`: final error on-chain (rebuild a new tx)