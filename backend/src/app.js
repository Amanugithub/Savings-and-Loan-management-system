import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import membersRouter from './routes/members.js';
import administratorsRouter from './routes/administrators.js';
import authRouter from './routes/auth.js';
// import transactionsRouter from './routes/transactions.js';
// import loansRouter from './routes/loans.js';
// import expensesRouter from './routes/expenses.js';
// import syncRouter from './routes/sync.js';

import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/members', membersRouter);
app.use('/api/administrators', administratorsRouter);
app.use('/api/auth', authRouter);
// app.use('/api/transactions', transactionsRouter);
// app.use('/api/loans', loansRouter);
// app.use('/api/expenses', expensesRouter);
// app.use('/api/sync', syncRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
