import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import config from './config/index.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { securityHeaders } from './middleware/security.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import groupsRouter from './routes/groups.js';
import groupsJoinRouter from './routes/groups.join.js';
import sessionRouter from './routes/session.js';
import proposalsRouter from './routes/proposals.js';
import proposalsCloseRouter from './routes/proposals.close.js';
import votesRouter from './routes/votes.js';
import stateRouter from './routes/state.js';
import ratingsRouter from './routes/ratings.js';
import dashboardRouter from './routes/dashboard.js';
import roundsRouter from './routes/rounds.js';
import watchedRouter from './routes/watched.js';

const app: Application = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use(requestLogger);
app.use(securityHeaders);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/groups/join', groupsJoinRouter);
app.use('/api/groups/resume', sessionRouter);
app.use('/api/groups', groupsRouter);
app.use('/api', proposalsRouter);
app.use('/api', votesRouter);
app.use('/api', stateRouter);
app.use('/api', ratingsRouter);
app.use('/api', dashboardRouter);
app.use('/api', roundsRouter);
app.use('/api/rounds', proposalsCloseRouter);
app.use('/api', watchedRouter);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

app.use(errorHandler);

export default app;
