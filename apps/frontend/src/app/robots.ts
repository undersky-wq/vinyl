import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Public releases and mixes may be indexed. Search/filter combinations,
      // private tools and API responses must not be crawled as separate pages.
      disallow: [
        '/*?*',
        '/api/',
        '/admin',
        '/profile',
      ],
      // Supported by Yandex, Bing and a number of other polite crawlers.
      // Google ignores Crawl-delay but still follows the disallow rules above.
      crawlDelay: 10,
    },
    host: 'https://mityadima.ru',
  };
}
