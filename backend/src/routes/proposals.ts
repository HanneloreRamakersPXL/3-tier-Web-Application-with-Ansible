import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { searchMovies, discoverMovies } from '../services/tmdb.js';
import { submitProposal, listProposals } from '../services/proposal-service.js';
import { logger } from '../services/logger.js';
import { emitToRound, emitToGroup } from '../services/socket.js';

const router = Router();

router.get('/movies/popular', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const genreId = req.query.genre ? parseInt(req.query.genre as string) : undefined;

    const results = await discoverMovies(page, genreId);
    res.json({
      movies: results.results.map(m => ({
        tmdb_id: m.id,
        title: m.title,
        release_year: m.release_date ? parseInt(m.release_date.split('-')[0]) : null,
        poster_path: m.poster_path,
        genres: m.genre_ids,
        overview: m.overview,
      })),
      page: results.page,
      total_pages: results.total_pages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Movie service unavailable';
    logger.error('Popular movies error', { message });
    res.status(503).json({ error: message });
  }
});

router.get('/search/movies', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;

    if (!query || query.trim().length === 0) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    if (query.length > 200) {
      res.status(400).json({ error: 'Search query exceeds 200 characters' });
      return;
    }

    const results = await searchMovies(query);

    res.json({
      movies: results.results.map(m => ({
        tmdb_id: m.id,
        title: m.title,
        release_year: m.release_date ? parseInt(m.release_date.split('-')[0]) : null,
        poster_path: m.poster_path,
        genres: m.genre_ids,
        overview: m.overview,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Movie search service unavailable';
    logger.error('Search movies error', { message });
    res.status(503).json({ error: message });
  }
});

router.post('/rounds/:roundId/proposals', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      group_id: z.string().uuid(),
      member_id: z.string().uuid(),
      tmdb_movie_id: z.number(),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Validation failed', details: validation.error.issues });
      return;
    }

    const { group_id, member_id, tmdb_movie_id } = validation.data;
    const { roundId } = req.params;

    const proposal = await submitProposal({
      groupId: group_id,
      roundId,
      memberId: member_id,
      tmdbMovieId: tmdb_movie_id,
    });

    emitToRound(roundId, 'proposal_added', { roundId, groupId: group_id, proposal });
    emitToGroup(group_id, 'proposal_added', { roundId, groupId: group_id, proposal });

    res.status(201).json(proposal);
  } catch (error) {
    logger.error('Submit proposal error', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('not in proposing state')) {
      res.status(409).json({ error: message });
      return;
    }

    if (message.includes('proposal limit')) {
      res.status(409).json({ error: message });
      return;
    }

    if (message.includes('already proposed')) {
      res.status(409).json({ error: message });
      return;
    }

    if (message.includes('Invalid TMDB')) {
      res.status(400).json({ error: message });
      return;
    }

    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rounds/:roundId/proposals', async (req: Request, res: Response) => {
  try {
    const { roundId } = req.params;
    const memberId = req.query.memberId as string | undefined;

    const proposals = await listProposals(roundId, memberId);
    res.json({ proposals });
  } catch (error) {
    logger.error('List proposals error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;