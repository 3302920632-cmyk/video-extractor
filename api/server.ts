import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { extractRouter } from './routes/extract';
import { historyRouter } from './routes/history';

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || 'your-service-key';

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

app.use(cors());
app.use(express.json());

app.use('/api/extract', extractRouter);
app.use('/api/history', historyRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Video Extractor API is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});