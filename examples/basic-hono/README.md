# Example: Basic Express Usage (No Database)

This example demonstrates the simplest possible z402 setup.

- Uses `z402/hono` middleware
- Requires payment before returning protected content
- Does **not** use a database, so payments are processed directly when submitted
- Intended for **testing, prototyping, and learning**

This mode is crash-unsafe:
- If the server restarts during payment finalization, the payment may not be retried.
- Use a storage backend (SQLite / Postgres / LibSQL) for production-grade reliability.

Run:
```ts
npm start
```