// =====================================================
// Weather Routes
// =====================================================
const express = require('express');
const weatherService = require('../services/weatherService');

const router = express.Router();

// GET /api/weather — Current weather + forecast
router.get('/', async (req, res) => {
  try {
    const data = await weatherService.getWeather();
    res.json(data);
  } catch (error) {
    console.error('[Weather] Error:', error);
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

// GET /api/weather/refresh — Force refresh
router.get('/refresh', async (req, res) => {
  try {
    await weatherService.refreshWeather();
    const data = await weatherService.getWeather();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Weather refresh failed' });
  }
});

module.exports = router;
