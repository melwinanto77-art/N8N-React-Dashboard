const mongoose = require('mongoose');

const Schema = mongoose.Schema;

// Recreate schemas locally for seeding
const TimelineEntrySchema = new Schema({
  path: String,
  label: String,
  intent: String,
  durationSec: Number,
  ts: Date,
  device: String,
  browser: String,
  os: String,
  referrer: String,
  country: String,
  city: String,
  email: String
});

const ClientSnapshotSchema = new Schema({
  device: String,
  browser: String,
  os: String,
  language: String,
  referrer: String
});

const CompanySchema = new Schema({
  domain: String,
  name: String,
  industry: String,
  size: String,
  country: String,
  city: String,
  region: String,
  isp: String,
  asn: String,
  logo: String
});

const SessionSchema = new Schema({
  id: String,
  site: String,
  company: CompanySchema,
  firstSeen: Date,
  lastSeen: Date,
  totalSeconds: Number,
  pageViews: Number,
  timeline: [TimelineEntrySchema],
  client: ClientSnapshotSchema,
  score: Number,
  hot: Boolean,
  hasContacts: Boolean,
  identifiedEmail: String
}, { timestamps: true });

const VisitSchema = new Schema({
  clientId: String,
  site: String,
  page: String,
  url: String,
  durationSec: Number,
  ts: Date,
  ip: String,
  device: String,
  browser: String,
  os: String,
  screen: String,
  viewport: String,
  language: String,
  timezone: String,
  referrer: String,
  scrollDepth: Number,
  utm: {
    source: String,
    medium: String,
    campaign: String
  },
  performance: {
    pageLoadMs: Number,
    domReadyMs: Number,
    ttfbMs: Number
  },
  company: CompanySchema,
  score: Number,
  hot: Boolean,
  email: String
}, { timestamps: true });

const SeoSnapshotSchema = new Schema({
  site: String,
  path: String,
  url: String,
  title: String,
  capturedAt: Date,
  seo: Schema.Types.Mixed,
  score: Number,
  recommendations: Schema.Types.Mixed
}, { timestamps: true });

const SessionModel = mongoose.model("Session", SessionSchema);
const VisitModel = mongoose.model("Visit", VisitSchema);
const SeoSnapshotModel = mongoose.model("SeoSnapshot", SeoSnapshotSchema);

const COMPANIES = [
  { name: 'Stripe', domain: 'stripe.com', industry: 'Financial Services', size: '5,000-10,000', country: 'US', city: 'San Francisco', logo: 'https://logo.clearbit.com/stripe.com', asn: 'AS3214' },
  { name: 'Shopify', domain: 'shopify.com', industry: 'E-Commerce', size: '10,000+', country: 'CA', city: 'Ottawa', logo: 'https://logo.clearbit.com/shopify.com', asn: 'AS1342' },
  { name: 'Datadog', domain: 'datadoghq.com', industry: 'Cloud & DevOps', size: '1,000-5,000', country: 'US', city: 'New York', logo: 'https://logo.clearbit.com/datadoghq.com', asn: 'AS5432' },
  { name: 'HashiCorp', domain: 'hashicorp.com', industry: 'Software & Cloud', size: '1,000-5,000', country: 'US', city: 'San Francisco', logo: 'https://logo.clearbit.com/hashicorp.com', asn: 'AS8976' },
  { name: 'Atlassian', domain: 'atlassian.com', industry: 'Collaboration Software', size: '5,000-10,000', country: 'AU', city: 'Sydney', logo: 'https://logo.clearbit.com/atlassian.com', asn: 'AS6543' },
  { name: 'GitHub', domain: 'github.com', industry: 'Software Development', size: '1,000-5,000', country: 'US', city: 'San Francisco', logo: 'https://logo.clearbit.com/github.com', asn: 'AS3421' },
  { name: 'Plaid', domain: 'plaid.com', industry: 'Financial Tech', size: '500-1,000', country: 'US', city: 'San Francisco', logo: 'https://logo.clearbit.com/plaid.com', asn: 'AS2311' },
  { name: 'Snowflake', domain: 'snowflake.com', industry: 'Data Analytics', size: '5,000-10,000', country: 'US', city: 'Bozeman', logo: 'https://logo.clearbit.com/snowflake.com', asn: 'AS9876' }
];

const PAGES = [
  { path: '/', label: 'Home Page', intent: 'low' },
  { path: '/courses/react-native', label: 'React Native Masterclass', intent: 'high' },
  { path: '/courses/fullstack-node', label: 'Node.js & Express Course', intent: 'high' },
  { path: '/pricing', label: 'Pricing Plans', intent: 'medium' },
  { path: '/docs/api', label: 'Developer API Docs', intent: 'medium' },
  { path: '/blog/ai-trends-2026', label: 'AI Trends 2026 Blog', intent: 'low' }
];

async function seed() {
  await mongoose.connect("mongodb://127.0.0.1:27017/b2b-radar");
  console.log('Connected to MongoDB.');

  // Clean existing sashainfinity.com data
  await SessionModel.deleteMany({ site: 'sashainfinity.com' });
  await VisitModel.deleteMany({ site: 'sashainfinity.com' });
  await SeoSnapshotModel.deleteMany({ site: 'sashainfinity.com' });
  console.log('Cleared old sashainfinity.com data.');

  const now = new Date();

  // 1. Create sessions and visits
  for (const company of COMPANIES) {
    const totalViews = Math.floor(Math.random() * 8) + 3;
    const timeline = [];
    let totalSeconds = 0;
    
    const firstSeen = new Date(now.getTime() - (Math.random() * 5 * 24 * 60 * 60 * 1000)); // within last 5 days
    let lastSeen = firstSeen;

    const email = Math.random() < 0.4 ? `lead-architect@${company.domain}` : null;

    for (let i = 0; i < totalViews; i++) {
      const page = PAGES[Math.floor(Math.random() * PAGES.length)];
      const durationSec = Math.floor(Math.random() * 120) + 15;
      totalSeconds += durationSec;
      
      const ts = new Date(firstSeen.getTime() + (i * 30 * 60 * 1000)); // spread by 30 mins
      if (ts > lastSeen) lastSeen = ts;

      const timelineEntry = {
        path: page.path,
        label: page.label,
        intent: page.intent,
        durationSec,
        ts,
        device: 'desktop',
        browser: 'Chrome',
        os: 'Windows',
        referrer: 'https://google.com',
        country: company.country,
        city: company.city,
        email: i === 0 ? email : null
      };
      
      timeline.unshift(timelineEntry);

      // Create Visit record
      const visit = new VisitModel({
        clientId: 'client_12345',
        site: 'sashainfinity.com',
        page: page.path,
        url: `https://sashainfinity.com${page.path}`,
        durationSec,
        ts,
        ip: '8.8.8.8',
        device: 'desktop',
        browser: 'Chrome',
        os: 'Windows',
        screen: '1920x1080',
        viewport: '1920x950',
        language: 'en-US',
        timezone: 'America/New_York',
        referrer: 'https://google.com',
        scrollDepth: 80,
        utm: { source: 'google', medium: 'organic', campaign: '' },
        performance: { pageLoadMs: 450, domReadyMs: 210, ttfbMs: 45 },
        company,
        score: 40 + (totalViews * 5),
        hot: (40 + (totalViews * 5)) >= 60,
        email: i === 0 ? email : null
      });
      await visit.save();
    }

    const score = Math.min(100, 30 + (totalViews * 8) + Math.floor(totalSeconds / 60));

    const session = new SessionModel({
      id: company.domain,
      site: 'sashainfinity.com',
      company,
      firstSeen,
      lastSeen,
      totalSeconds,
      pageViews: totalViews,
      timeline,
      client: {
        device: 'desktop',
        browser: 'Chrome',
        os: 'Windows',
        language: 'en-US',
        referrer: 'https://google.com'
      },
      score,
      hot: score >= 60,
      hasContacts: true,
      identifiedEmail: email
    });
    await session.save();
  }
  console.log('Seeded 8 Company Sessions and Visit logs.');

  // 2. Seed SEO, AEO, GEO snapshots for sashainfinity.com
  const seoData = [
    {
      path: '/',
      title: 'SashaInfinity - Premium Technology Learning Platform',
      score: 95,
      recommendations: [],
      aeoScore: 90,
      aeoRecommendations: [
        { category: 'aeo', severity: 'info', message: 'Add a conversational FAQ block to target voice searches.', fix: 'Add a section with headers like "How do I get started with SashaInfinity?"' }
      ],
      geoScore: 88,
      geoRecommendations: [
        { category: 'geo', severity: 'warning', message: 'No external authority citations found.', fix: 'Link to official documentation or industry stats to back up claims.' }
      ]
    },
    {
      path: '/courses/react-native',
      title: 'React Native Masterclass | SashaInfinity',
      score: 82,
      recommendations: [
        { category: 'title', severity: 'warning', message: 'Add meta keywords tag', fix: 'Add meta keywords related to React Native.' },
        { category: 'images', severity: 'warning', message: 'Improve image alt tags (2 missing)', fix: 'Add alt descriptions to your course thumbnails.' }
      ],
      aeoScore: 75,
      aeoRecommendations: [
        { category: 'aeo', severity: 'warning', message: 'Low heading structure depth.', fix: 'Add H2/H3 tags phrasing course questions, e.g. "What will I learn in this course?"' }
      ],
      geoScore: 80,
      geoRecommendations: [
        { category: 'geo', severity: 'info', message: 'Increase factual density with statistics.', fix: 'Mention salary figures or job market stats for React Native developers.' }
      ]
    },
    {
      path: '/pricing',
      title: 'SashaInfinity Pricing - Premium Membership Plans',
      score: 88,
      recommendations: [
        { category: 'meta_description', severity: 'warning', message: 'Meta description is slightly too long', fix: 'Shorten the meta description to under 160 characters.' }
      ],
      aeoScore: 92,
      aeoRecommendations: [],
      geoScore: 75,
      geoRecommendations: [
        { category: 'geo', severity: 'warning', message: 'Factual density is low. Add comparisons.', fix: 'Add a detailed feature comparison table showing the value of each plan.' }
      ]
    }
  ];

  for (const item of seoData) {
    const seo = new SeoSnapshotModel({
      site: 'sashainfinity.com',
      path: item.path,
      url: `https://sashainfinity.com${item.path}`,
      title: item.title,
      capturedAt: now,
      score: item.score,
      aeoScore: item.aeoScore,
      geoScore: item.geoScore,
      seo: {
        title: item.title,
        titleLength: item.title.length,
        metaDescription: 'Learn cutting-edge technologies with expert-led courses.',
        metaDescriptionLength: 55,
        h1Count: 1,
        h2Count: 4,
        totalImages: 12,
        imagesWithoutAlt: 1,
        internalLinks: 18,
        externalLinks: 3,
        hasViewportMeta: true,
        wordCount: 750
      },
      recommendations: item.recommendations,
      aeoRecommendations: item.aeoRecommendations,
      geoRecommendations: item.geoRecommendations
    });
    await seo.save();
  }
  console.log('Seeded 3 SEO/AEO/GEO Snapshots.');

  console.log('✅ Seeding completed successfully!');
  await mongoose.disconnect();
}

seed();
