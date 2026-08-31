import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRouter from './routes/auth.js';
import membersRouter from './routes/members.js';
import loansRouter from './routes/loans.js';
import transactionsRouter from './routes/transactions.js';
import dividendsRouter from './routes/dividends.js';
import notificationsRouter from './routes/notifications.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/members', membersRouter);
app.use('/api/loans', loansRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/dividends', dividendsRouter);
app.use('/api/notifications', notificationsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`Mobile API running on port ${PORT}`);
});