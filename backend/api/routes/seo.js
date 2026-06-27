const express = require('express');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { generateAdSuggestions, generateWebsiteSuggestions } = require('../services/seoService');
const analyticsService = require('../services/analyticsService');

const router = express.Router();
router.use(authenticate);

// Get SEO overview for a site
router.get('/score/:siteId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (path) *
       FROM seo_snapshots
       WHERE site_id = $1
       ORDER BY path, captured_at DESC`,
      [req.params.siteId]
    );

    const pages = result.rows;
    const avgScore = pages.length > 0
      ? Math.round(pages.reduce((sum, p) => sum + (p.seo_score || 0), 0) / pages.length)
      : 0;

    const allRecommendations = [];
    pages.forEach(page => {
      const recs = typeof page.recommendations === 'string'
        ? JSON.parse(page.recommendations)
        : (page.recommendations || []);
      recs.forEach(r => {
        allRecommendations.push({ ...r, page: page.path });
      });
    });

    res.json({
      overallScore: avgScore,
      pagesAnalyzed: pages.length,
      pages: pages.map(p => ({
        path: p.path,
        url: p.url,
        title: p.title,
        score: p.seo_score,
        issues: (typeof p.recommendations === 'string'
          ? JSON.parse(p.recommendations)
          : (p.recommendations || [])).length,
      })),
      recommendations: allRecommendations,
    });
  } catch (error) {
    console.error('SEO score error:', error);
    res.status(500).json({ error: 'Failed to fetch SEO data' });
  }
});

// Get SEO details for a specific page
router.get('/page/:siteId', async (req, res) => {
  try {
    const { path } = req.query;
    const result = await pool.query(
      `SELECT * FROM seo_snapshots
       WHERE site_id = $1 AND path = $2
       ORDER BY captured_at DESC
       LIMIT 1`,
      [req.params.siteId, path]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No SEO data found for this page' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('SEO page error:', error);
    res.status(500).json({ error: 'Failed to fetch SEO page data' });
  }
});

// Get ad placement suggestions
router.get('/ads/:siteId', async (req, res) => {
  try {
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();

    const topPages = await analyticsService.getTopPages(req.params.siteId, startDate, endDate, 20);
    const overview = await analyticsService.getOverview(req.params.siteId, startDate, endDate);

    const suggestions = generateAdSuggestions({
      topPages,
      avgTimeOnPage: overview.avgTimeOnPage,
      avgScrollDepth: overview.avgScrollDepth,
      totalPageviews: overview.totalPageviews,
    }, {});

    // Also fetch stored suggestions
    const stored = await pool.query(
      'SELECT * FROM ad_suggestions WHERE site_id = $1 ORDER BY priority DESC',
      [req.params.siteId]
    );

    res.json({
      generated: suggestions,
      saved: stored.rows,
    });
  } catch (error) {
    console.error('Ad suggestions error:', error);
    res.status(500).json({ error: 'Failed to generate ad suggestions' });
  }
});

// Get website improvement suggestions
router.get('/suggestions/:siteId', async (req, res) => {
  try {
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = new Date().toISOString();

    const performanceData = await analyticsService.getPerformanceMetrics(
      req.params.siteId, startDate, endDate
    );

    const seoResult = await pool.query(
      `SELECT * FROM seo_snapshots
       WHERE site_id = $1
       ORDER BY captured_at DESC LIMIT 1`,
      [req.params.siteId]
    );

    const suggestions = generateWebsiteSuggestions(
      seoResult.rows[0] || {},
      performanceData
    );

    const stored = await pool.query(
      'SELECT * FROM website_suggestions WHERE site_id = $1 AND is_resolved = false ORDER BY priority DESC',
      [req.params.siteId]
    );

    res.json({
      generated: suggestions,
      saved: stored.rows,
    });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

module.exports = router;
