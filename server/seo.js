// server/seo.js
//
// Pure on-page SEO scoring. Takes a real SEO snapshot captured from the page DOM
// by the tracker and returns a 0-100 score plus prioritized recommendations.
// No I/O, no state — adapted from the reference analytics platform's seoService.

export function scoreSeo(seo = {}) {
  let score = 0;
  const max = 100;
  const recs = [];

  // Title (20)
  if (seo.title) {
    score += 5;
    if (seo.titleLength >= 30 && seo.titleLength <= 60) {
      score += 15;
    } else {
      score += 7;
      recs.push({
        category: "title",
        severity: "warning",
        message: `Title length ${seo.titleLength} is outside the ideal 30-60 characters.`,
        fix: "Adjust the <title> so search engines display it in full (30-60 chars).",
      });
    }
  } else {
    recs.push({
      category: "title",
      severity: "critical",
      message: "Page is missing a <title> tag.",
      fix: "Add a descriptive <title> with your primary keyword.",
    });
  }

  // Meta description (15)
  if (seo.metaDescription) {
    score += 5;
    if (seo.metaDescriptionLength >= 120 && seo.metaDescriptionLength <= 160) {
      score += 10;
    } else {
      score += 5;
      recs.push({
        category: "meta_description",
        severity: "warning",
        message: `Meta description length ${seo.metaDescriptionLength} is not optimal (aim 120-160).`,
        fix: "Tune the meta description to 120-160 characters.",
      });
    }
  } else {
    recs.push({
      category: "meta_description",
      severity: "critical",
      message: "Page is missing a meta description.",
      fix: "Add a compelling meta description summarizing the page.",
    });
  }

  // H1 (10)
  if (seo.h1Count === 1) {
    score += 10;
  } else if (seo.h1Count > 1) {
    score += 5;
    recs.push({
      category: "headings",
      severity: "warning",
      message: `Page has ${seo.h1Count} H1 tags; use exactly one.`,
      fix: "Keep a single H1 for the main heading; demote the rest to H2.",
    });
  } else {
    recs.push({
      category: "headings",
      severity: "critical",
      message: "Page is missing an H1 tag.",
      fix: "Add one H1 with the page's primary keyword.",
    });
  }

  // H2 (5)
  if (seo.h2Count >= 2) {
    score += 5;
  } else {
    score += seo.h2Count === 1 ? 3 : 0;
    recs.push({
      category: "headings",
      severity: "info",
      message: "Few or no H2 subheadings.",
      fix: "Break content into sections with H2 subheadings.",
    });
  }

  // Open Graph (10)
  if (seo.ogTitle && seo.ogDescription && seo.ogImage) {
    score += 10;
  } else {
    const missing = [];
    if (!seo.ogTitle) missing.push("og:title");
    if (!seo.ogDescription) missing.push("og:description");
    if (!seo.ogImage) missing.push("og:image");
    score += Math.max(0, 10 - missing.length * 3);
    recs.push({
      category: "social",
      severity: "warning",
      message: `Missing Open Graph tags: ${missing.join(", ")}.`,
      fix: "Add og: tags for richer social sharing previews.",
    });
  }

  // Canonical (5)
  if (seo.canonicalUrl) {
    score += 5;
  } else {
    recs.push({
      category: "technical",
      severity: "warning",
      message: "No canonical URL.",
      fix: "Add <link rel=\"canonical\"> to avoid duplicate-content issues.",
    });
  }

  // Image alt text (10)
  if (seo.totalImages > 0) {
    const withAlt = seo.totalImages - (seo.imagesWithoutAlt || 0);
    score += Math.round((withAlt / seo.totalImages) * 10);
    if (seo.imagesWithoutAlt > 0) {
      recs.push({
        category: "images",
        severity: "warning",
        message: `${seo.imagesWithoutAlt} of ${seo.totalImages} images missing alt text.`,
        fix: "Add descriptive alt attributes to every image.",
      });
    }
  } else {
    score += 5;
  }

  // Mobile viewport (10)
  if (seo.hasViewportMeta) {
    score += 10;
  } else {
    recs.push({
      category: "mobile",
      severity: "critical",
      message: "Missing viewport meta tag.",
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    });
  }

  // Content length (10)
  if (seo.wordCount >= 300) {
    score += 10;
  } else if (seo.wordCount >= 100) {
    score += 5;
    recs.push({
      category: "content",
      severity: "warning",
      message: `Thin content (${seo.wordCount} words).`,
      fix: "Expand to 300+ words of valuable content.",
    });
  } else {
    recs.push({
      category: "content",
      severity: "critical",
      message: `Very thin content (${seo.wordCount || 0} words).`,
      fix: "Add substantial content; aim for 300+ words.",
    });
  }

  // Links (5)
  if (seo.internalLinks >= 3 && seo.externalLinks >= 1) {
    score += 5;
  } else {
    score += 2;
    recs.push({
      category: "links",
      severity: "info",
      message: "Few internal/external links.",
      fix: "Add internal links to related pages and cite external sources.",
    });
  }

  const severityRank = { critical: 0, warning: 1, info: 2 };
  recs.sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));

  return { score: Math.min(score, max), recommendations: recs };
}
