const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'analytics',
  });

  try {
    await client.connect();
    console.log('Seeding local PostgreSQL database...');

    // 1. Clear existing data
    await client.query('DELETE FROM website_suggestions');
    await client.query('DELETE FROM seo_snapshots');
    await client.query('DELETE FROM events');
    await client.query('DELETE FROM sites');
    await client.query('DELETE FROM users');

    // 2. Insert mock user (using a valid UUID)
    const userId = 'a0000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO users (id, email, password_hash, name, company) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, 'melwinanto77@gmail.com', 'dummy_hash', 'Melwin', 'Acme Corp']
    );
    console.log('Mock user inserted.');

    // 3. Insert mock site
    const siteId = 'site_12345';
    await client.query(
      `INSERT INTO sites (user_id, site_id, domain, name, is_active) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, siteId, 'acme.com', 'Acme Corp Website', true]
    );
    console.log('Mock site inserted.');

    // 4. Insert mock events in the last hour
    const now = new Date();
    const eventTypes = ['pageview', 'click', 'scroll'];
    const paths = ['/', '/pricing', '/docs', '/blog/post-1', '/contact'];
    const referrers = ['https://google.com', 'https://github.com', 'https://twitter.com', ''];
    const deviceTypes = ['desktop', 'mobile', 'tablet'];
    const browsers = ['Chrome', 'Safari', 'Firefox'];
    const oses = ['Windows', 'macOS', 'iOS', 'Android'];
    const countries = ['US', 'CA', 'GB', 'DE', 'IN'];

    console.log('Inserting mock events...');
    for (let i = 0; i < 150; i++) {
      const offsetSeconds = Math.floor(Math.random() * 3600); // within last hour
      const timestamp = new Date(now.getTime() - offsetSeconds * 1000).toISOString();
      const visitorId = `visitor_${Math.floor(Math.random() * 20)}`;
      const sessionId = `session_${Math.floor(Math.random() * 40)}`;
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const path = paths[Math.floor(Math.random() * paths.length)];
      const referrer = referrers[Math.floor(Math.random() * referrers.length)];
      const deviceType = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];
      const browser = browsers[Math.floor(Math.random() * browsers.length)];
      const os = oses[Math.floor(Math.random() * oses.length)];
      const country = countries[Math.floor(Math.random() * countries.length)];
      const timeOnPage = eventType === 'pageview' ? Math.floor(Math.random() * 120000) + 5000 : null;
      const scrollDepth = eventType === 'pageview' ? Math.floor(Math.random() * 100) : null;
      const clickCount = eventType === 'pageview' ? Math.floor(Math.random() * 10) : null;

      await client.query(
        `INSERT INTO events (
          site_id, visitor_id, session_id, event_type, timestamp,
          url, path, hostname, referrer, user_agent,
          screen_resolution, viewport, language, timezone,
          device_type, browser, os, country, city, region,
          time_on_page, scroll_depth, click_count, meta_data
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24
        )`,
        [
          siteId, visitorId, sessionId, eventType, timestamp,
          `https://acme.com${path}`, path, 'acme.com', referrer, 'Mozilla/5.0...',
          '1920x1080', '1920x950', 'en-US', 'America/New_York',
          deviceType, browser, os, country, 'New York', 'NY',
          timeOnPage, scrollDepth, clickCount, '{}'
        ]
      );
    }

    // 5. Insert mock SEO snapshots
    console.log('Inserting mock SEO snapshot...');
    await client.query(
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
        siteId, 'https://acme.com/', '/', 'Acme Corp - B2B Inbound Analytics Solution', 42,
        'Acme Corp offers state of the art analytics mapping B2B IP to company names.', 76,
        'b2b,analytics,reverse-ip', 'Acme Corp B2B',
        'Acme Corp offers state of the art analytics', 'https://acme.com/og.png', 'https://acme.com/',
        1, 4, 'Welcome to Acme Corp', 5,
        1, 10, 5,
        true, 850, 92, '[]'
      ]
    );

    console.log('✅ PostgreSQL database seeding completed successfully!');
  } catch (err) {
    console.error('Error during seeding:', err.message);
  } finally {
    await client.end();
  }
}

run();
