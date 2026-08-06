# Notin — Backend (coming soon)

This folder will hold the Notin backend.

## Planned contents

- **API** — REST/GraphQL endpoints for notes, notebooks, tags, tasks
- **Storage** — database schema & migrations (notes, users, sync state)
- **Sync** — real-time cross-device note sync + offline conflict resolution
- **Search** — full-text search service (instant, PDF-aware)
- **AI features** — AI search / rewrite / meeting-notes services

## Status

- [ ] Scaffold API server
- [ ] Database schema
- [x] Standalone auth + protected notes service (implemented in `../authentication/`)
- [ ] Integrate future sync APIs with the existing auth service
- [ ] Sync protocol
- [ ] Search service

Nothing has been built yet — the frontend is the current focus.
