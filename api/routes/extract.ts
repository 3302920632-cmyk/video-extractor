import { Router } from 'express';
import { extractVideo, initBrowser } from '../services/extractService';

export const extractRouter = Router();

extractRouter.post('/init-browser', async (req, res) => {
  try {
    const result = await initBrowser();
    res.json(result);
  } catch (error) {
    console.error('Browser init error:', error);
    res.status(500).json({ success: false, message: 'Failed to start browser' });
  }
});

extractRouter.post('/', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, message: 'Please provide video URL' });
    }

    const result = await extractVideo(url);
    res.json(result);
  } catch (error) {
    console.error('Video extraction error:', error);
    res.status(500).json({ success: false, message: 'Video extraction failed, please try again later' });
  }
});