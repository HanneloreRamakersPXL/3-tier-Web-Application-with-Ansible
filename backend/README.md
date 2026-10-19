# CineVote Backend

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Installation

```bash
npm install
```

## Configuration

Create `.env` file:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/cinevote
PORT=3000
NODE_ENV=development
TMDB_API_KEY=your_tmdb_key
JWT_SECRET=your_jwt_secret
```

## Database Setup

```bash
npm run db:migrate
```

## Development

```bash
npm run dev
```

## Testing

```bash
npm test
npm run test:coverage
```

## Build

```bash
npm run build
```

## API Endpoints

### Health
- `GET /api/health` - Health check

### Groups
- `POST /api/groups` - Create group
- `GET /api/groups/:id` - Get group
- `POST /api/groups/join` - Join group by invite code
- `POST /api/groups/resume` - Resume session

### Rounds
- `POST /api/groups/:id/rounds` - Create round
- `GET /api/rounds/:id` - Get round
- `POST /api/rounds/:id/transition` - Transition state

### Proposals
- `POST /api/rounds/:id/proposals` - Create proposal
- `GET /api/rounds/:id/proposals` - List proposals
- `POST /api/rounds/:id/close` - Close proposals phase

### Votes
- `POST /api/rounds/:id/votes` - Cast vote
- `GET /api/rounds/:id/votes/status` - Get voting status

### Ratings
- `POST /api/proposals/:id/rating` - Rate proposal
- `GET /api/proposals/:id/ratings` - Get ratings

### Dashboard
- `GET /api/groups/:id/dashboard` - Get group dashboard
- `GET /api/groups/:id/stats/genres` - Get genre stats
- `GET /api/groups/:id/suggestions/genres` - Get genre suggestions

## Database Tables

| Table | Description |
|-------|-------------|
| `groups` | User groups |
| `members` | Group members |
| `rounds` | Voting rounds |
| `proposals` | Movie proposals |
| `votes` | Member votes |
| `ratings` | Movie ratings |
| `state_transition_log` | Audit log |
