import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import masterDataRoutes from './routes/masterData.routes';
import permitRoutes from './routes/permit.routes';
import { errorHandler } from './middlewares/error.middleware';

export const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/permits', permitRoutes);
app.use('/api', masterDataRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(errorHandler);

export default app;
