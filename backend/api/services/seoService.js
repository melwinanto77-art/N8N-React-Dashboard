function calculateSEOScore(seoData) {
  let score = 0;
  const maxScore = 100;
  const recommendations = [];

  // Title checks (20 points)
  if (seoData.title) {
    score += 5;
    if (seoData.title_length >= 30 && seoData.title_length <= 60) {
      score += 15;
    } else if (seoData.title_length > 0) {
      score += 7;
      if (seoData.title_length < 30) {
        recommendations.push({
          category: 'title',
          severity: 'warning',
          message: `Title is too short (${seoData.title_length} chars). Aim for 30-60 characters.`,
          fix: 'Expand your title to include relevant keywords and be more descriptive.',
        });
      } else {
        recommendations.push({
          category: 'title',
          severity: 'warning',
          message: `Title is too long (${seoData.title_length} chars). Aim for 30-60 characters.`,
          fix: 'Shorten your title. Search engines typically display the first 50-60 characters.',
        });
      }
    }
  } else {
    recommendations.push({
      category: 'title',
      severity: 'critical',
      message: 'Page is missing a title tag.',
      fix: 'Add a <title> tag to your page with relevant keywords.',
    });
  }

  // Meta description (15 points)
  if (seoData.meta_description) {
    score += 5;
    if (seoData.meta_description_length >= 120 && seoData.meta_description_length <= 160) {
      score += 10;
    } else if (seoData.meta_description_length > 0) {
      score += 5;
      recommendations.push({
        category: 'meta_description',
        severity: 'warning',
        message: `Meta description length (${seoData.meta_description_length}) is not optimal. Aim for 120-160 characters.`,
        fix: 'Adjust your meta description to be between 120-160 characters for optimal search display.',
      });
    }
  } else {
    recommendations.push({
      category: 'meta_description',
      severity: 'critical',
      message: 'Page is missing a meta description.',
      fix: 'Add a meta description tag with a compelling summary of the page content.',
    });
  }

  // H1 tag (10 points)
  if (seoData.h1_count === 1) {
    score += 10;
  } else if (seoData.h1_count > 1) {
    score += 5;
    recommendations.push({
      category: 'headings',
      severity: 'warning',
      message: `Page has ${seoData.h1_count} H1 tags. Use only one H1 per page.`,
      fix: 'Restructure your headings to use a single H1 tag for the main heading.',
    });
  } else {
    recommendations.push({
      category: 'headings',
      severity: 'critical',
      message: 'Page is missing an H1 tag.',
      fix: 'Add an H1 tag with your primary keyword for the page.',
    });
  }

  // H2 tags (5 points)
  if (seoData.h2_count >= 2) {
    score += 5;
  } else if (seoData.h2_count === 1) {
    score += 3;
    recommendations.push({
      category: 'headings',
      severity: 'info',
      message: 'Consider adding more H2 subheadings to structure your content.',
      fix: 'Break your content into sections with H2 headings for better readability and SEO.',
    });
  } else {
    recommendations.push({
      category: 'headings',
      severity: 'warning',
      message: 'Page has no H2 tags.',
      fix: 'Add H2 subheadings to organize your content structure.',
    });
  }

  // Open Graph tags (10 points)
  if (seoData.og_title && seoData.og_description && seoData.og_image) {
    score += 10;
  } else {
    const missing = [];
    if (!seoData.og_title) missing.push('og:title');
    if (!seoData.og_description) missing.push('og:description');
    if (!seoData.og_image) missing.push('og:image');
    score += Math.max(0, 10 - missing.length * 3);
    recommendations.push({
      category: 'social',
      severity: 'warning',
      message: `Missing Open Graph tags: ${missing.join(', ')}`,
      fix: 'Add Open Graph meta tags for better social media sharing appearance.',
    });
  }

  // Canonical URL (5 points)
  if (seoData.canonical_url) {
    score += 5;
  } else {
    recommendations.push({
      category: 'technical',
      severity: 'warning',
      message: 'No canonical URL specified.',
      fix: 'Add a canonical link tag to prevent duplicate content issues.',
    });
  }

  // Image alt tags (10 points)
  if (seoData.total_images > 0) {
    const altPercent = ((seoData.total_images - seoData.images_without_alt) / seoData.total_images) * 100;
    score += Math.round(altPercent / 10);
    if (seoData.images_without_alt > 0) {
      recommendations.push({
        category: 'images',
        severity: 'warning',
        message: `${seoData.images_without_alt} of ${seoData.total_images} images missing alt text.`,
        fix: 'Add descriptive alt attributes to all images for accessibility and SEO.',
      });
    }
  } else {
    score += 5;
  }

  // Mobile viewport (10 points)
  if (seoData.has_viewport_meta) {
    score += 10;
  } else {
    recommendations.push({
      category: 'mobile',
      severity: 'critical',
      message: 'Missing viewport meta tag.',
      fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile responsiveness.',
    });
  }

  // Content length (10 points)
  if (seoData.word_count >= 300) {
    score += 10;
  } else if (seoData.word_count >= 100) {
    score += 5;
    recommendations.push({
      category: 'content',
      severity: 'warning',
      message: `Page has only ${seoData.word_count} words. More content typically ranks better.`,
      fix: 'Expand your content to at least 300 words for better search engine ranking.',
    });
  } else {
    recommendations.push({
      category: 'content',
      severity: 'critical',
      message: `Very thin content (${seoData.word_count} words).`,
      fix: 'Add substantial, valuable content to the page. Aim for 300+ words minimum.',
    });
  }

  // Internal/External links (5 points)
  if (seoData.internal_links >= 3 && seoData.external_links >= 1) {
    score += 5;
  } else {
    score += 2;
    if (seoData.internal_links < 3) {
      recommendations.push({
        category: 'links',
        severity: 'info',
        message: 'Consider adding more internal links.',
        fix: 'Link to other relevant pages on your site to improve crawlability.',
      });
    }
  }

  return {
    score: Math.min(score, maxScore),
    recommendations: recommendations.sort((a, b) => {
      const severity = { critical: 0, warning: 1, info: 2 };
      return (severity[a.severity] || 3) - (severity[b.severity] || 3);
    }),
  };
}

function generateAdSuggestions(analyticsData, seoData) {
  const suggestions = [];

  if (analyticsData.topPages && analyticsData.topPages.length > 0) {
    analyticsData.topPages.forEach((page, index) => {
      if (index < 5) {
        suggestions.push({
          suggestion_type: 'ad_placement',
          page_path: page.path,
          placement: 'above_fold',
          priority: 10 - index,
          description: `High-traffic page (${page.views} views). Place primary ad above the fold.`,
          expected_impact: 'high',
        });
      }
    });
  }

  if (analyticsData.avgTimeOnPage > 60000) {
    suggestions.push({
      suggestion_type: 'ad_placement',
      page_path: '*',
      placement: 'in_content',
      priority: 8,
      description: 'Users spend significant time reading. Place native ads within content.',
      expected_impact: 'high',
    });
  }

  if (analyticsData.avgScrollDepth > 70) {
    suggestions.push({
      suggestion_type: 'ad_placement',
      page_path: '*',
      placement: 'footer',
      priority: 6,
      description: 'High scroll depth indicates engaged users. Footer ads will get visibility.',
      expected_impact: 'medium',
    });
  }

  suggestions.push({
    suggestion_type: 'search_ranking',
    page_path: '*',
    placement: 'n/a',
    priority: 10,
    description: 'Submit sitemap to Google Search Console for faster indexing.',
    expected_impact: 'high',
  });

  return suggestions;
}

function generateWebsiteSuggestions(seoData, performanceData) {
  const suggestions = [];

  if (performanceData && performanceData.avg_page_load > 3000) {
    suggestions.push({
      category: 'performance',
      title: 'Improve Page Load Speed',
      description: `Average page load time is ${(performanceData.avg_page_load / 1000).toFixed(1)}s. Target under 3 seconds.`,
      impact: 'high',
      effort: 'medium',
      priority: 10,
      details: {
        current: performanceData.avg_page_load,
        target: 3000,
        tips: [
          'Compress images and use WebP format',
          'Enable browser caching',
          'Minimize JavaScript and CSS',
          'Use a CDN for static assets',
          'Enable Gzip compression',
        ],
      },
    });
  }

  if (performanceData && performanceData.avg_ttfb > 600) {
    suggestions.push({
      category: 'performance',
      title: 'Reduce Server Response Time (TTFB)',
      description: `TTFB is ${performanceData.avg_ttfb}ms. Should be under 600ms.`,
      impact: 'high',
      effort: 'high',
      priority: 9,
      details: {
        tips: [
          'Optimize server-side code',
          'Use server-side caching',
          'Upgrade hosting plan',
          'Use a CDN',
        ],
      },
    });
  }

  return suggestions;
}

module.exports = {
  calculateSEOScore,
  generateAdSuggestions,
  generateWebsiteSuggestions,
};
