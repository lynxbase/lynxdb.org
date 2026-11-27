// Builds the blog from blog-src/ into blog/ at the site root: npm run build:blog
import fs from 'node:fs';
import yaml from 'js-yaml';
import pluginRss from '@11ty/eleventy-plugin-rss';
import { createMarkdown } from './_lib/markdown.js';
import * as filters from './_lib/filters.js';
import { writeDiscovery } from './_lib/discovery.js';

export default function (config) {
  config.setLibrary('md', createMarkdown());
  config.addDataExtension('yml', contents => yaml.load(contents));
  config.addPlugin(pluginRss);
  for (const [name, fn] of Object.entries(filters)) config.addFilter(name, fn);
  config.addWatchTarget('index.html');
  config.on('eleventy.after', writeDiscovery);

  config.addCollection('posts', api => api.getFilteredByGlob('blog-src/_posts/*.md').sort((a, b) => b.date - a.date));

  config.addPassthroughCopy({ 'blog-src/blog.css': 'blog.css', 'blog-src/blog.js': 'blog.js' });
  // a post's images sit next to it in blog-src/_posts/<slug>/ and land next to its page, in blog/<slug>/
  for (const entry of fs.readdirSync('blog-src/_posts', { withFileTypes: true })) {
    if (entry.isDirectory()) config.addPassthroughCopy({ [`blog-src/_posts/${entry.name}`]: entry.name });
  }
  config.ignores.add('blog-src/README.md');

  return {
    dir: { input: 'blog-src', output: 'blog', includes: '_includes', layouts: '_layouts', data: '_data' },
    templateFormats: ['md', 'njk'],
    // posts are plain Markdown: braces in a code block are text, never template tags
    markdownTemplateEngine: false,
    htmlTemplateEngine: 'njk',
  };
}
