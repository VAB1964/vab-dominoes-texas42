# VAB Moon & Texas 42

Responsive multiplayer Moon and Texas 42 dominoes for VABGames.com. Private invite-link rooms support human players, AI seat filling, reconnection, configurable Moon house rules, and standard four-player partnership Texas 42. The rules engine and room state are server-authoritative.

Texas 42 includes all 28 dominoes, across-the-table teams, 30–42 point bids and multi-mark bids, numbered/doubles/follow-me trump choices, the five count dominoes worth 35 total points, seven trick points, forced dealer bidding after three passes, and first team to seven marks.

## Development

Run `npm install`, then `npm run build` and `npm test`. Use `npx wrangler dev` for the full Worker and asset server.

The Worker test suite uses Cloudflare's local Durable Object runtime to complete full mixed human/AI hands in both Moon and Texas 42. Use `npx wrangler dev --config wrangler.local.jsonc` when testing locally without production routes.
