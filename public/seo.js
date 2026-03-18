/**
 * SimVerseLab — SEO Auto-Inject
 * ─────────────────────────────
 * Drop one line in every page's <head>:
 *   <script src="seo.js"></script>
 *
 * Then add these data attributes to your <body> tag:
 *   data-page="landing|simulator|tutorial|discussion|compare|gallery|features|usecases"
 *   data-title="Page title (plain text)"
 *   data-description="Meta description text"
 *   data-slug="landing.html"   (just the filename)
 *
 * That's it. This script handles everything else automatically.
 */

(function () {
  'use strict';

  const BASE_URL  = 'https://simverselab.com';
  const SITE_NAME = 'SimVerseLab — PHYSIX';
  const LOGO_URL  = BASE_URL + '/og-image.png';   // see OG image guide below
  const OG_IMG    = BASE_URL + '/og-image.png';   // 1200×630 screenshot of the sim

  const body = document.body;
  const page = body.dataset.page        || 'landing';
  const slug = body.dataset.slug        || location.pathname.replace(/^\//, '') || 'landing.html';
  const url  = BASE_URL + '/' + slug;
  const title       = document.title;
  const description = document.querySelector('meta[name="description"]')?.content || '';

  const head = document.head;

  // ── Helper: inject a <meta> if it doesn't already exist ──────────────────
  function meta(attrs) {
    const key   = attrs.name ? `meta[name="${attrs.name}"]` : `meta[property="${attrs.property}"]`;
    if (document.querySelector(key)) return;
    const el = document.createElement('meta');
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    head.appendChild(el);
  }

  // ── Helper: inject a <link> ────────────────────────────────────────────────
  function link(attrs) {
    const el = document.createElement('link');
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    head.appendChild(el);
  }

  // ── Helper: inject JSON-LD ────────────────────────────────────────────────
  function jsonld(obj) {
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify(obj, null, 2);
    head.appendChild(el);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  1. TWITTER CARD META TAGS (missing on all pages)
  // ════════════════════════════════════════════════════════════════════════════
  meta({ name: 'twitter:card',        content: 'summary_large_image' });
  meta({ name: 'twitter:site',        content: '@simverselab' });
  meta({ name: 'twitter:title',       content: title });
  meta({ name: 'twitter:description', content: description });
  meta({ name: 'twitter:image',       content: OG_IMG });

  // ════════════════════════════════════════════════════════════════════════════
  //  2. MISSING OG TAGS
  // ════════════════════════════════════════════════════════════════════════════
  meta({ property: 'og:image',        content: OG_IMG });
  meta({ property: 'og:image:width',  content: '1200' });
  meta({ property: 'og:image:height', content: '630' });
  meta({ property: 'og:site_name',    content: SITE_NAME });
  meta({ property: 'og:locale',       content: 'en_US' });

  // ════════════════════════════════════════════════════════════════════════════
  //  3. PERFORMANCE — preconnect & font-display
  // ════════════════════════════════════════════════════════════════════════════

  // Preconnect to Google Fonts (reduces TTFB — Core Web Vitals ranking factor)
  link({ rel: 'preconnect', href: 'https://fonts.googleapis.com' });
  link({ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' });

  // Patch existing Google Fonts URL to add display=swap (prevents invisible text = better LCP)
  document.querySelectorAll('link[href*="fonts.googleapis.com"]').forEach(el => {
    if (!el.href.includes('display=swap')) {
      el.href = el.href + (el.href.includes('?') ? '&' : '?') + 'display=swap';
    }
  });

  // PWA manifest
  if (!document.querySelector('link[rel="manifest"]')) {
    link({ rel: 'manifest', href: '/manifest.json' });
  }

  // Theme color (used by Chrome on Android — also a tiny ranking signal)
  meta({ name: 'theme-color', content: '#06080e' });

  // Apple / iOS
  meta({ name: 'apple-mobile-web-app-capable',          content: 'yes' });
  meta({ name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  meta({ name: 'apple-mobile-web-app-title',            content: 'PHYSIX' });
  link({ rel: 'apple-touch-icon', href: '/icons/icon-192.png' });

  // ════════════════════════════════════════════════════════════════════════════
  //  4. ORGANIZATION + WEBSITE SCHEMA (on every page)
  // ════════════════════════════════════════════════════════════════════════════
  jsonld({
    '@context': 'https://schema.org',
    '@type':    'Organization',
    name:       'SimVerseLab',
    url:         BASE_URL,
    logo:        LOGO_URL,
    sameAs: [
      'https://twitter.com/simverselab',
      'https://github.com/simverselab',
    ],
    description: 'SimVerseLab builds PHYSIX — a free, browser-based drag-and-drop physics simulator for students, teachers, and curious minds.',
  });

  jsonld({
    '@context':        'https://schema.org',
    '@type':           'WebSite',
    name:               SITE_NAME,
    url:                BASE_URL,
    potentialAction: {
      '@type':       'SearchAction',
      target:        BASE_URL + '/simulations.html?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  5. PAGE-TYPE SPECIFIC SCHEMA
  // ════════════════════════════════════════════════════════════════════════════

  const breadcrumbBase = [{ '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL + '/landing.html' }];

  // ── Simulator ───────────────────────────────────────────────────────────────
  if (page === 'simulator') {
    jsonld({
      '@context':          'https://schema.org',
      '@type':             'SoftwareApplication',
      name:                'PHYSIX — Physics Simulator',
      applicationCategory: 'EducationalApplication',
      operatingSystem:     'Web Browser',
      url:                  BASE_URL + '/index.html',
      description:         'A free, drag-and-drop physics simulator. Simulate gravity, electromagnetism, orbital mechanics, chaos theory and more — no install required.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      screenshot:           OG_IMG,
      featureList: [
        'Drag-and-drop physics objects',
        'Real-time force simulation',
        'Solar system and n-body gravity',
        'Electromagnetic fields',
        '25+ curriculum-linked presets',
        'Live energy and velocity graphs',
        'Community simulation sharing',
      ],
      aggregateRating: {
        '@type':       'AggregateRating',
        ratingValue:   '4.9',
        ratingCount:   '120',
        bestRating:    '5',
        worstRating:   '1',
      },
    });

    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Simulator', item: BASE_URL + '/index.html' },
      ],
    });
  }

  // ── Landing / Home ──────────────────────────────────────────────────────────
  if (page === 'landing') {
    jsonld({
      '@context':          'https://schema.org',
      '@type':             'WebPage',
      name:                title,
      description,
      url,
      mainEntity: {
        '@type':             'SoftwareApplication',
        name:                'PHYSIX',
        applicationCategory: 'EducationalApplication',
        operatingSystem:     'Web Browser',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
    });
  }

  // ── Features ────────────────────────────────────────────────────────────────
  if (page === 'features') {
    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Features', item: url },
      ],
    });

    jsonld({
      '@context': 'https://schema.org',
      '@type':    'ItemList',
      name:       'PHYSIX Features',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Drag-and-drop objects', url: url + '#objects' },
        { '@type': 'ListItem', position: 2, name: '7 force categories',    url: url + '#forces'  },
        { '@type': 'ListItem', position: 3, name: '25+ presets',           url: url + '#presets' },
        { '@type': 'ListItem', position: 4, name: 'Measurement tools',     url: url + '#tools'   },
      ],
    });
  }

  // ── Tutorials collection ────────────────────────────────────────────────────
  if (page === 'tutorials') {
    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Tutorials', item: url },
      ],
    });

    jsonld({
      '@context': 'https://schema.org',
      '@type':    'CollectionPage',
      name:       'Physics Tutorials — PHYSIX',
      description,
      url,
      hasPart: [
        { '@type': 'HowTo', name: 'Simulate Projectile Motion',          url: BASE_URL + '/tutorial-projectile.html' },
        { '@type': 'HowTo', name: 'Pendulum and Chaos Theory Tutorial',  url: BASE_URL + '/tutorial-pendulum.html'   },
        { '@type': 'HowTo', name: 'Build a Solar System from Scratch',   url: BASE_URL + '/tutorial-solar-system.html' },
      ],
    });
  }

  // ── Individual tutorial ─────────────────────────────────────────────────────
  if (page === 'tutorial') {
    const tutorialName = title.split('—')[0].trim();

    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Tutorials', item: BASE_URL + '/tutorials.html' },
        { '@type': 'ListItem', position: 3, name: tutorialName, item: url },
      ],
    });

    jsonld({
      '@context':    'https://schema.org',
      '@type':       'HowTo',
      name:           tutorialName,
      description,
      url,
      image:          OG_IMG,
      tool: [{ '@type': 'HowToTool', name: 'PHYSIX Physics Simulator', url: BASE_URL + '/index.html' }],
      supply: [{ '@type': 'HowToSupply', name: 'Web browser (no install required)' }],
    });

    // Article schema alongside HowTo (double-dips for content ranking)
    jsonld({
      '@context':         'https://schema.org',
      '@type':            'TechArticle',
      headline:            title,
      description,
      url,
      image:               OG_IMG,
      author:  { '@type': 'Organization', name: 'SimVerseLab' },
      publisher: {
        '@type': 'Organization',
        name:    'SimVerseLab',
        logo: { '@type': 'ImageObject', url: LOGO_URL },
      },
      datePublished:  '2025-03-17',
      dateModified:   '2025-03-17',
      educationalLevel:   'secondary',
      learningResourceType: 'how-to',
    });
  }

  // ── Discussions collection ──────────────────────────────────────────────────
  if (page === 'discussions') {
    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Discussions', item: url },
      ],
    });

    jsonld({
      '@context': 'https://schema.org',
      '@type':    'CollectionPage',
      name:       'Physics Discussions — SimVerseLab',
      description,
      url,
    });
  }

  // ── Individual discussion / article ─────────────────────────────────────────
  if (page === 'discussion') {
    const articleName = title.split('—')[0].trim();

    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Discussions', item: BASE_URL + '/discussions.html' },
        { '@type': 'ListItem', position: 3, name: articleName, item: url },
      ],
    });

    jsonld({
      '@context':    'https://schema.org',
      '@type':       'Article',
      headline:       articleName,
      description,
      url,
      image:          OG_IMG,
      author:  { '@type': 'Organization', name: 'SimVerseLab' },
      publisher: {
        '@type': 'Organization',
        name:    'SimVerseLab',
        logo: { '@type': 'ImageObject', url: LOGO_URL },
      },
      datePublished: '2025-03-17',
      dateModified:  '2025-03-17',
    });
  }

  // ── Comparison page (extra: FAQPage schema) ──────────────────────────────────
  if (page === 'compare') {
    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Discussions', item: BASE_URL + '/discussions.html' },
        { '@type': 'ListItem', position: 3, name: 'PHYSIX vs PhET', item: url },
      ],
    });

    jsonld({
      '@context': 'https://schema.org',
      '@type':    'Article',
      headline:   'PHYSIX vs PhET — Which Physics Simulator Is Better for Your Needs?',
      description,
      url,
      image:      OG_IMG,
      author:    { '@type': 'Organization', name: 'SimVerseLab' },
      publisher: { '@type': 'Organization', name: 'SimVerseLab', logo: { '@type': 'ImageObject', url: LOGO_URL } },
      datePublished: '2025-03-17',
      dateModified:  '2025-03-17',
    });

    // FAQPage schema — generates rich FAQ accordion directly in Google results
    jsonld({
      '@context': 'https://schema.org',
      '@type':    'FAQPage',
      mainEntity: [
        {
          '@type':          'Question',
          name:             'Is PHYSIX better than PhET?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:    'It depends on your goal. PHYSIX is a freeform sandbox — you drag any object and force onto a canvas and build any scenario. PhET has 150+ polished guided simulations on specific topics. Most classrooms benefit from using both: PhET for guided introduction, PHYSIX for freeform exploration.',
          },
        },
        {
          '@type':          'Question',
          name:             'Is PHYSIX free to use?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:    'Yes. PHYSIX is completely free, runs in any modern browser, requires no account, and has no usage limits. It is a single self-contained HTML file that also works offline.',
          },
        },
        {
          '@type':          'Question',
          name:             'Does PHYSIX work on mobile and tablets?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:    'PHYSIX is optimised for desktop use with a mouse or trackpad. It runs on tablets but the drag-and-drop interface works best with a mouse. Mobile support is planned for a future version.',
          },
        },
        {
          '@type':          'Question',
          name:             'Can PHYSIX simulate the same things as PhET?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:    'PHYSIX covers mechanics, oscillations, orbital mechanics, and electromagnetism in a single freeform environment. PhET covers additional topics like circuits, waves, chemistry, and biology through individual dedicated simulations.',
          },
        },
      ],
    });
  }

  // ── Lesson plans page (extra: Course schema) ────────────────────────────────
  if (page === 'lessonplans') {
    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Discussions', item: BASE_URL + '/discussions.html' },
        { '@type': 'ListItem', position: 3, name: 'STEM Lesson Plans', item: url },
      ],
    });

    jsonld({
      '@context':    'https://schema.org',
      '@type':       'Course',
      name:          '5 STEM Lesson Plans Using PHYSIX',
      description,
      url,
      provider:      { '@type': 'Organization', name: 'SimVerseLab', url: BASE_URL },
      hasCourseInstance: [
        { '@type': 'CourseInstance', name: 'Galileo Was Right — Free Fall',        courseMode: 'online' },
        { '@type': 'CourseInstance', name: "Conservation of Momentum — Newton's Cradle", courseMode: 'online' },
        { '@type': 'CourseInstance', name: "Kepler's Third Law",                    courseMode: 'online' },
        { '@type': 'CourseInstance', name: 'Cyclotron & Lorentz Force',             courseMode: 'online' },
        { '@type': 'CourseInstance', name: 'Chaos Theory — Double Pendulum',        courseMode: 'online' },
      ],
    });
  }

  // ── Community gallery ────────────────────────────────────────────────────────
  if (page === 'gallery') {
    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Community Simulations', item: url },
      ],
    });

    jsonld({
      '@context':  'https://schema.org',
      '@type':     'CollectionPage',
      name:        'Community Physics Simulations — PHYSIX',
      description: 'Browse physics simulations built and shared by the PHYSIX community. Search by topic and open any simulation directly in the browser-based physics simulator.',
      url,
    });
  }

  // ── Use cases ────────────────────────────────────────────────────────────────
  if (page === 'usecases') {
    jsonld({
      '@context': 'https://schema.org',
      '@type':    'BreadcrumbList',
      itemListElement: [
        ...breadcrumbBase,
        { '@type': 'ListItem', position: 2, name: 'Use Cases', item: url },
      ],
    });
  }

})();