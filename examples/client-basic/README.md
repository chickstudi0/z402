# Example: Calling a Paid Route Using `z402-client`

This example shows how a client application interacts with a z402-protected server.

- Uses the `z402-client` library
- Automatically detects `HTTP 402 Payment Required`
- Builds, signs, and resends the payment transaction
- Demonstrates basic `GET` request flow

This is useful for:
- Server-to-server calls
- Backend workers
- Command-line payment automation
- Testing wallet signing logic

Run:
```ts
npm start
```