# Forma

Personal AI coaching intelligence for elite amateur endurance athletes.

Forma reasons like a coach. Runna and Training Peaks deliver plans. Forma thinks.

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Supabase** (Postgres — data layer and source of truth for hosted app)
- **Vercel** (deployment)
- **Anthropic API** (claude-sonnet-4-20250514 — coaching brain)
- **garmin_mcp** (local Garmin data layer — 110+ tools via taxuspt/garmin_mcp)
- **Python sync script** (local Garmin → Supabase bridge)

## Architecture

All Garmin authentication stays local. A scheduled Python script pulls from Garmin Connect via garmin_mcp and writes to Supabase. The hosted Vercel app reads only from Supabase — Garmin credentials never leave the athlete's machine.

```
Garmin Connect
      │
      ▼ (local, authenticated)
 garmin_mcp
      │
      ▼
 sync.py (Python, runs locally or via cron)
      │
      ▼
 Supabase (Postgres) ◄──── Vercel (Next.js)
                                   │
                                   ▼
                          Anthropic API (coaching brain)
```

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

```bash
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Copy `.env.local.example` to `.env.local` and fill in values.

## Project Structure

```
app/
├── page.tsx          # / — Weekly coaching view
├── goals/            # /goals — Goal management
├── history/          # /history — Training history
├── chat/             # /chat — Open coaching chat
└── sync/             # /sync — Data sync status
```
