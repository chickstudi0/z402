import express from "express";
import { createPaymentContext } from "z402/express";
import { type PaymentResult } from "z402";
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
