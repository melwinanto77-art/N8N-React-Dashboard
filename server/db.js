import mongoose from "mongoose";

const Schema = mongoose.Schema;

// Timeline entry schema
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
  city: String
});

// Client snapshot schema
const ClientSnapshotSchema = new Schema({
  device: String,
  browser: String,
  os: String,
  language: String,
  referrer: String
});

// Company info schema
const CompanySchema = new Schema({
  domain: { type: String, required: true },
  name: { type: String, required: true },
  industry: String,
  size: String,
  country: String,
  city: String,
  region: String,
  isp: String,
  asn: String,
  logo: String
});

// Session schema
const SessionSchema = new Schema({
  id: { type: String, required: true }, // company.domain
  site: { type: String, required: true }, // normalized site
  company: CompanySchema,
  firstSeen: Date,
  lastSeen: Date,
  totalSeconds: { type: Number, default: 0 },
  pageViews: { type: Number, default: 0 },
  timeline: [TimelineEntrySchema],
  client: ClientSnapshotSchema,
  score: { type: Number, default: 0 },
  hot: { type: Boolean, default: false },
  hasContacts: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Compound unique index for (site, company.domain)
SessionSchema.index({ site: 1, "company.domain": 1 }, { unique: true });

// Visit/Event schema for individual pageviews (high volume)
const VisitSchema = new Schema({
  clientId: String,
  site: { type: String, required: true },
  page: { type: String, required: true },
  url: String,
  durationSec: { type: Number, default: 0 },
  ts: { type: Date, default: Date.now },
  ip: String,
  device: String,
  browser: String,
  os: String,
  screen: String,
  viewport: String,
  language: String,
  timezone: String,
  referrer: String,
  scrollDepth: { type: Number, default: 0 },
  utm: {
    source: String,
    medium: String,
    campaign: String,
    term: String,
    content: String
  },
  performance: {
    pageLoadMs: Number,
    domReadyMs: Number,
    ttfbMs: Number
  },
  company: CompanySchema,
  score: Number,
  hot: Boolean
}, {
  timestamps: true
});

VisitSchema.index({ site: 1, ts: -1 });
VisitSchema.index({ "company.domain": 1 });
VisitSchema.index({ ts: -1 });

// SEO Snapshot schema
const SeoSnapshotSchema = new Schema({
  site: { type: String, required: true },
  path: { type: String, required: true },
  url: String,
  title: String,
  capturedAt: { type: Date, default: Date.now },
  seo: Schema.Types.Mixed,
  score: Number,
  recommendations: Schema.Types.Mixed
}, {
  timestamps: true
});

SeoSnapshotSchema.index({ site: 1, path: 1 }, { unique: true });

export const SessionModel = mongoose.model("Session", SessionSchema);
export const VisitModel = mongoose.model("Visit", VisitSchema);
export const SeoSnapshotModel = mongoose.model("SeoSnapshot", SeoSnapshotSchema);

export async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/b2b-radar";
  await mongoose.connect(uri);
  console.log("Connected to MongoDB at", uri);
}
