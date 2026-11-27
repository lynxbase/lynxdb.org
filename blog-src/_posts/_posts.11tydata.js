// Every post: the post layout, a page at blog/<slug>/ where the slug is the file name without its
// date, and its reading time, counted from the Markdown so a list of posts never waits for a render
import fs from 'node:fs';
import { readingTime } from '../_lib/filters.js';

export default {
  layout: 'post',
  eleventyComputed: {
    permalink: data => `${data.page.fileSlug}/index.html`,
    readingTime: data => readingTime(fs.readFileSync(data.page.inputPath, 'utf8')),
  },
};
