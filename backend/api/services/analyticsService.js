const pool = require('../db');

class AnalyticsService {
  async getOverview(siteId, startDate, endDate) {
    const queries = await Promise.all([
      // Total page views
      pool.query(
        `SELECT COUNT(*) as total_pageviews
         FROM events
         WHERE site_id = $1 AND event_type = 'pageview'
         AND timestamp BETWEEN $2 AND $3`,
        [siteId, startDate, endDate]
      ),

      // Unique visitors
      pool.query(
        `SELECT COUNT(DISTINCT visitor_id) as unique_visitors
         FROM events
         WHERE site_id = $1 AND event_type = 'pageview'
         AND timestamp BETWEEN $2 AND $3`,
        [siteId, startDate, endDate]
      ),

      // Total sessions
      pool.query(
        `SELECT COUNT(DISTINCT session_id) as total_sessions
         FROM events
         WHERE site_id = $1 AND event_type = 'pageview'
         AND timestamp BETWEEN $2 AND $3`,
        [siteId, startDate, endDate]
      ),

      // Average time on page
      pool.query(
        `SELECT AVG(time_on_page) as avg_time_on_page
         FROM events
         WHERE site_id = $1 AND event_type = 'pageexit'
         AND time_on_page IS NOT NULL AND time_on_page > 0
         AND timestamp BETWEEN $2 AND $3`,
        [siteId, startDate, endDate]
      ),

      // Average scroll depth
      pool.query(
        `SELECT AVG(scroll_depth) as avg_scroll_depth
         FROM events
         WHERE site_id = $1 AND event_type = 'pageexit'
         AND scroll_depth IS NOT NULL
         AND timestamp BETWEEN $2 AND $3`,
        [siteId, startDate, endDate]
      ),

      // Bounce rate (sessions with only 1 pageview)
      pool.query(
        `SELECT
           COUNT(CASE WHEN pv_count = 1 THEN 1 END)::float / NULLIF(COUNT(*), 0) * 100 as bounce_rate
         FROM (
           SELECT session_id, COUNT(*) as pv_count
           FROM events
           WHERE site_id = $1 AND event_type = 'pageview'
           AND timestamp BETWEEN $2 AND $3
           GROUP BY session_id
         ) sessions`,
        [siteId, startDate, endDate]
      ),

      // Previous period for growth calculation
      pool.query(
        `SELECT COUNT(*) as prev_pageviews, COUNT(DISTINCT visitor_id) as prev_visitors
         FROM events
         WHERE site_id = $1 AND event_type = 'pageview'
         AND timestamp BETWEEN ($2::timestamp - ($3::timestamp - $2::timestamp)) AND $2`,
        [siteId, startDate, endDate]
      ),
    ]);

    const totalPageviews = parseInt(queries[0].rows[0].total_pageviews);
    const uniqueVisitors = parseInt(queries[1].rows[0].unique_visitors);
    const totalSessions = parseInt(queries[2].rows[0].total_sessions);
    const avgTimeOnPage = Math.round(parseFloat(queries[3].rows[0].avg_time_on_page || 0));
    const avgScrollDepth = Math.round(parseFloat(queries[4].rows[0].avg_scroll_depth || 0));
    const bounceRate = Math.round(parseFloat(queries[5].rows[0].bounce_rate || 0));
    const prevPageviews = parseInt(queries[6].rows[0].prev_pageviews);
    const prevVisitors = parseInt(queries[6].rows[0].prev_visitors);

    const pageviewGrowth = prevPageviews > 0
      ? ((totalPageviews - prevPageviews) / prevPageviews * 100).toFixed(1)
      : 0;
    const visitorGrowth = prevVisitors > 0
      ? ((uniqueVisitors - prevVisitors) / prevVisitors * 100).toFixed(1)
      : 0;

    return {
      totalPageviews,
      uniqueVisitors,
      totalSessions,
      avgTimeOnPage,
      avgScrollDepth,
      bounceRate,
      growth: {
        pageviews: parseFloat(pageviewGrowth),
        visitors: parseFloat(visitorGrowth),
      },
    };
  }

  async getVisitorsOverTime(siteId, startDate, endDate, interval = 'day') {
    const intervalMap = {
      hour: "date_trunc('hour', timestamp)",
      day: "date_trunc('day', timestamp)",
      week: "date_trunc('week', timestamp)",
      month: "date_trunc('month', timestamp)",
    };

    const trunc = intervalMap[interval] || intervalMap.day;

    const result = await pool.query(
      `SELECT
         ${trunc} as date,
         COUNT(*) as pageviews,
         COUNT(DISTINCT visitor_id) as unique_visitors,
         COUNT(DISTINCT session_id) as sessions
       FROM events
       WHERE site_id = $1 AND event_type = 'pageview'
       AND timestamp BETWEEN $2 AND $3
       GROUP BY date
       ORDER BY date`,
      [siteId, startDate, endDate]
    );

    return result.rows;
  }

  async getTopPages(siteId, startDate, endDate, limit = 10) {
    const result = await pool.query(
      `SELECT
         path,
         COUNT(*) as views,
         COUNT(DISTINCT visitor_id) as unique_views,
         AVG(e2.time_on_page) as avg_time
       FROM events e1
       LEFT JOIN events e2 ON e1.session_id = e2.session_id
         AND e1.path = e2.path AND e2.event_type = 'pageexit'
       WHERE e1.site_id = $1 AND e1.event_type = 'pageview'
       AND e1.timestamp BETWEEN $2 AND $3
       GROUP BY path
       ORDER BY views DESC
       LIMIT $4`,
      [siteId, startDate, endDate, limit]
    );

    return result.rows;
  }

  async getTrafficSources(siteId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
         CASE
           WHEN referrer IS NULL OR referrer = '' THEN 'Direct'
           WHEN referrer LIKE '%google%' THEN 'Google'
           WHEN referrer LIKE '%facebook%' OR referrer LIKE '%fb.%' THEN 'Facebook'
           WHEN referrer LIKE '%twitter%' OR referrer LIKE '%t.co%' THEN 'Twitter'
           WHEN referrer LIKE '%linkedin%' THEN 'LinkedIn'
           WHEN referrer LIKE '%youtube%' THEN 'YouTube'
           WHEN utm_source IS NOT NULL THEN utm_source
           ELSE 'Other'
         END as source,
         COUNT(*) as visits,
         COUNT(DISTINCT visitor_id) as unique_visitors
       FROM events
       WHERE site_id = $1 AND event_type = 'pageview'
       AND timestamp BETWEEN $2 AND $3
       GROUP BY source
       ORDER BY visits DESC`,
      [siteId, startDate, endDate]
    );

    return result.rows;
  }

  async getDeviceBreakdown(siteId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
         device_type,
         browser,
         os,
         COUNT(*) as count
       FROM events
       WHERE site_id = $1 AND event_type = 'pageview'
       AND timestamp BETWEEN $2 AND $3
       GROUP BY device_type, browser, os
       ORDER BY count DESC`,
      [siteId, startDate, endDate]
    );

    return result.rows;
  }

  async getGeoData(siteId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
         country,
         city,
         COUNT(*) as visits,
         COUNT(DISTINCT visitor_id) as unique_visitors
       FROM events
       WHERE site_id = $1 AND event_type = 'pageview'
       AND country IS NOT NULL
       AND timestamp BETWEEN $2 AND $3
       GROUP BY country, city
       ORDER BY visits DESC
       LIMIT 50`,
      [siteId, startDate, endDate]
    );

    return result.rows;
  }

  async getRealTimeVisitors(siteId) {
    const result = await pool.query(
      `SELECT
         COUNT(DISTINCT visitor_id) as active_visitors,
         COUNT(DISTINCT session_id) as active_sessions
       FROM events
       WHERE site_id = $1
       AND event_type IN ('pageview', 'heartbeat')
       AND timestamp > NOW() - INTERVAL '5 minutes'`,
      [siteId]
    );

    const activePages = await pool.query(
      `SELECT
         path,
         COUNT(DISTINCT visitor_id) as visitors
       FROM events
       WHERE site_id = $1
       AND event_type IN ('pageview', 'heartbeat')
       AND timestamp > NOW() - INTERVAL '5 minutes'
       GROUP BY path
       ORDER BY visitors DESC
       LIMIT 10`,
      [siteId]
    );

    return {
      ...result.rows[0],
      activePages: activePages.rows,
    };
  }

  async getPerformanceMetrics(siteId, startDate, endDate) {
    const result = await pool.query(
      `SELECT
         AVG(page_load_time) as avg_page_load,
         AVG(dom_ready_time) as avg_dom_ready,
         AVG(ttfb) as avg_ttfb,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY page_load_time) as median_page_load,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY page_load_time) as p95_page_load
       FROM events
       WHERE site_id = $1 AND event_type = 'pageview'
       AND page_load_time IS NOT NULL AND page_load_time > 0
       AND timestamp BETWEEN $2 AND $3`,
      [siteId, startDate, endDate]
    );

    return result.rows[0];
  }
}

module.exports = new AnalyticsService();
