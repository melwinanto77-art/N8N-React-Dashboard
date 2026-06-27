const express = require('express');
const geoip = require('geoip-lite');
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const analyticsService = require('../services/analyticsService');

const router = express.Router();

// Collect endpoint (no auth - called by tracker script)
router.post('/collect', async (req, res) => {
  try {
    const data = req.body;

    // Get geo data from IP
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const geo = geoip.lookup(ip) || {};

    const eventData = {
      site_id: data.site_id,
      visitor_id: data.visitor_id,
      session_id: data.session_id,
      event_type: data.event_type,
      timestamp: data.timestamp || new Date().toISOString(),
      url: data.url,
      path: data.path,
      hostname: data.hostname,
      referrer: data.referrer,
      user_agent: data.user_agent,
      screen_resolution: data.screen_resolution,
      viewport: data.viewport,
      language: data.language,
      timezone: data.timezone,
      device_type: data.device_type,
      browser: data.browser,
      os: data.os,
      country: geo.country || null,
      city: geo.city || null,
      region: geo.region || null,
      utm_source: data.utm ? data.utm.utm_source : null,
      utm_medium: data.utm ? data.utm.utm_medium : null,
      utm_campaign: data.utm ? data.utm.utm_campaign : null,
      utm_term: data.utm ? data.utm.utm_term : null,
      utm_content: data.utm ? data.utm.utm_content : null,
      time_on_page: data.time_on_page || null,
      scroll_depth: data.scroll_depth || null,
      click_count: data.click_count || null,
      page_load_time: data.performance ? data.performance.page_load_time : null,
      dom_ready_time: data.performance ? data.performance.dom_ready_time : null,
      ttfb: data.performance ? data.performance.ttfb : null,
      meta_data: JSON.stringify({}),
    };

    // Insert event
    await pool.query(
      `INSERT INTO events (
        site_id, visitor_id, session_id, event_type, timestamp,
        url, path, hostname, referrer, user_agent,
        screen_resolution, viewport, language, timezone,
        device_type, browser, os, country, city, region,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        time_on_page, scroll_depth, click_count,
        page_load_time, dom_ready_time, ttfb, meta_data
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
        $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
      )`,
      Object.values(eventData)
    );

    // Process SEO data if pageview
    if (data.event_type === 'pageview' && data.seo) {
      const { calculateSEOScore } = require('../services/seoService');
      const seoResult = calculateSEOScore(data.seo);

      await pool.query(
        `INSERT INTO seo_snapshots (
          site_id, url, path, title, title_length,
          meta_description, meta_description_length, meta_keywords,
          og_title, og_description, og_image, canonical_url,
          h1_count, h2_count, h1_text, total_images,
          images_without_alt, internal_links, external_links,
          has_viewport_meta, word_count, seo_score, recommendations
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        ON CONFLICT DO NOTHING`,
        [
          data.site_id, data.url, data.path,
          data.seo.title, data.seo.title_length,
          data.seo.meta_description, data.seo.meta_description_length,
          data.seo.meta_keywords, data.seo.og_title,
          data.seo.og_description, data.seo.og_image,
          data.seo.canonical_url, data.seo.h1_count,
          data.seo.h2_count, data.seo.h1_text,
          data.seo.total_images, data.seo.images_without_alt,
          data.seo.internal_links, data.seo.external_links,
          data.seo.has_viewport_meta, data.seo.word_count,
          seoResult.score, JSON.stringify(seoResult.recommendations),
        ]
      );
    }

    // Notify WebSocket clients
    if (req.app.wsBroadcast) {
      req.app.wsBroadcast(data.site_id, {
        type: 'realtime_event',
        event_type: data.event_type,
        path: data.path,
        visitor_id: data.visitor_id,
        country: geo.country,
        device: data.device_type,
        timestamp: data.timestamp,
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Collection error:', error);
    res.status(500).json({ error: 'Failed to collect data' });
  }
});

// ---- Protected Analytics Endpoints ----

// Overview
router.get('/overview/:siteId', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const overview = await analyticsService.getOverview(req.params.siteId, start, end);
    res.json(overview);
  } catch (error) {
    console.error('Overview error:', error);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// Visitors over time
router.get('/visitors/:siteId', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, interval } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const data = await analyticsService.getVisitorsOverTime(
      req.params.siteId, start, end, interval || 'day'
    );
    res.json(data);
  } catch (error) {
    console.error('Visitors error:', error);
    res.status(500).json({ error: 'Failed to fetch visitor data' });
  }
});

// Top pages
router.get('/pages/:siteId', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const data = await analyticsService.getTopPages(
      req.params.siteId, start, end, parseInt(limit) || 10
    );
    res.json(data);
  } catch (error) {
    console.error('Pages error:', error);
    res.status(500).json({ error: 'Failed to fetch page data' });
  }
});

// Traffic sources
router.get('/sources/:siteId', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const data = await analyticsService.getTrafficSources(req.params.siteId, start, end);
    res.json(data);
  } catch (error) {
    console.error('Sources error:', error);
    res.status(500).json({ error: 'Failed to fetch source data' });
  }
});

// Device breakdown
router.get('/devices/:siteId', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const data = await analyticsService.getDeviceBreakdown(req.params.siteId, start, end);
    res.json(data);
  } catch (error) {
    console.error('Devices error:', error);
    res.status(500).json({ error: 'Failed to fetch device data' });
  }
});

// Geo data
router.get('/geo/:siteId', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const data = await analyticsService.getGeoData(req.params.siteId, start, end);
    res.json(data);
  } catch (error) {
    console.error('Geo error:', error);
    res.status(500).json({ error: 'Failed to fetch geo data' });
  }
});

// Real-time
router.get('/realtime/:siteId', authenticate, async (req, res) => {
  try {
    const data = await analyticsService.getRealTimeVisitors(req.params.siteId);
    res.json(data);
  } catch (error) {
    console.error('Realtime error:', error);
    res.status(500).json({ error: 'Failed to fetch realtime data' });
  }
});

// Performance
router.get('/performance/:siteId', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const data = await analyticsService.getPerformanceMetrics(req.params.siteId, start, end);
    res.json(data);
  } catch (error) {
    console.error('Performance error:', error);
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
});

module.exports = router;
