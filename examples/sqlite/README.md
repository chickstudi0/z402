# Example: Express with Postgres Persistence

This example demonstrates using z402 with `z402-storage-postgres`.

- Works with Neon, Vercel Postgres, Supabase, RDS, Timescale, etc.
- Safe for production-scale deployments
- Enables distributed / multi-instance servers to share payment state
- Allows horizontal scaling and job workers

This is the recommended setup for:
- Public SaaS APIs
- Commercial premium content endpoints
- Multiplayer backends / game servers

Run:
```ts
npm start
```