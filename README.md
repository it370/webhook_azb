## Aizawl Bazaar WhatsApp AI (RAG)

Node.js + Express backend that bridges Meta WhatsApp Cloud to an AI shopping assistant for Aizawl, using OpenAI for parsing/answering and Supabase (Postgres + pgvector) for product search.

### Prerequisites
- Node 18+
- Supabase project with `vector` extension enabled
- OpenAI API key

### Quick start
1) Install deps: `npm install`
2) Copy env: `cp env.sample .env` and fill values
3) Start server: `npm run dev` (defaults to port 3000)
4) Expose to Meta via tunnel (e.g., `ngrok http 3000`) and set your WhatsApp webhook to `<public_url>/webhook`

### Environment
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (service role key recommended for RLS bypass on RPC)
- `WHATSAPP_VERIFY_TOKEN` (must match the token configured in Meta)
- `PORT` (optional)

See `.env.example` for a template.

### Webhook
- `GET /webhook`: Meta verification. Expects `hub.verify_token` and returns `hub.challenge` when valid.
- `POST /webhook`: Accepts WhatsApp inbound payload (or `{ "text": "..." }` for local testing). Detects order intent, otherwise runs product search + RAG response. Returns `{ reply, products }`.

### Supabase schema
Run the production-ready catalog script in SQL editor (or `psql`):
```
scripts/sql/001_product_catalog.sql
```

It provisions categories, subcategories, tags, richer product metadata (display vs. internal descriptions, search keywords), image variants, commissions, a dedicated `product_embeddings` table, a `product_catalog_view` for admin/API reads, and an updated `match_products` RPC that joins vendor + taxonomy info.

### How it works
- Message parsing: LLM classifies intent (`search` vs `order`) and extracts query text (supports Mizo + English mix).
- Embedding: `text-embedding-3-small` on the query.
- Retrieval: calls `match_products` RPC with similarity threshold 0.5 and top 5.
- Response: `gpt-4o-mini` generates a concise WhatsApp-friendly bullet list with bold product names and shop info. If intent is order, logs a mock pending order and returns a confirmation.
- Safety: System prompt refuses non-shopping or non-Aizawl topics.

### Local testing
`curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d "{\"text\": \"Chanmari-ah cake a awm em?\"}"`

### Next steps
- Persist orders into Supabase
- Add auth/verification for Meta signatures
- Add monitoring + request logging

