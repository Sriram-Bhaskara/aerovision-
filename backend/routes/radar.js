// =====================================================
// Radar Routes — Live aircraft positions via OpenSky
// =====================================================
const express = require('express');
const radarService = require('../services/radarService');

const router = express.Router();

// GET /api/radar — Live aircraft positions
router.get('/', async (req, res) => {
  try {
    const { altitude, callsign } = req.query;
    const data = await radarService.getRadarData({ altitude, callsign });
    res.json(data);
  } catch (error) {
    console.error('[Radar] Error:', error);
    res.status(500).json({ error: 'Failed to fetch radar data' });
  }
});

module.exports = router;
