const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// List user's sites
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sites WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ sites: result.rows });
  } catch (error) {
    console.error('Error fetching sites:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new site
router.post('/', async (req, res) => {
  try {
    const { domain, name } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const siteId = 'site_' + uuidv4().split('-')[0];

    const result = await pool.query(
      'INSERT INTO sites (user_id, site_id, domain, name) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, siteId, domain, name || domain]
    );

    const site = result.rows[0];

    // Generate the tracking script snippet
    const trackingScript = `<script src="https://your-domain.com/tracker/analytics.js" data-site-id="${siteId}" defer></script>`;

    res.status(201).json({ site, trackingScript });
  } catch (error) {
    console.error('Error creating site:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a site
router.delete('/:siteId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM sites WHERE site_id = $1 AND user_id = $2',
      [req.params.siteId, req.user.id]
    );
    res.json({ message: 'Site deleted' });
  } catch (error) {
    console.error('Error deleting site:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
