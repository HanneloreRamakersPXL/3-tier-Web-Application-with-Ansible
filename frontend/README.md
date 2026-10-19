# CineVote Frontend

## Prerequisites

- Node.js 18+
- npm or yarn

## Installation

```bash
npm install
```

## Configuration

Create `.env` file:

```
VITE_API_URL=http://localhost:3000/api
VITE_TMDB_IMAGE_URL=https://image.tmdb.org/t/p
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Type Check

```bash
npm run type-check
```

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Entry point |
| `/create` | CreateGroup | Create a new group with a display name |
| `/join` | JoinGroup | Join an existing group via invite code |
| `/resume` | ResumeSession | Resume a session with member ID |
| `/dashboard/:groupId` | Dashboard | Group overview, rounds, and activity |
| `/rounds/:roundId` | RoundDetails | Round proposals and ratings |
| `/rounds/:roundId/voting` | VotingInterface | Cast a vote for a proposal |

## Components

- `RatingInput` — 5-star interactive rating widget with hover preview
- `ProposalCard` — Movie proposal with poster, metadata, and optional rating

## Services

- `api.ts` — Axios-based API client for all backend endpoints
