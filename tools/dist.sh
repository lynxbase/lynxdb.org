#!/bin/sh
# Stages what the host serves into dist/: the files of a commit (HEAD by default) without the blog's
# sources, the brand system, the tools, the Worker's script and the build's own files. Only committed files go, so a
# deployment holds exactly what the commit holds; mise run check proves that is the built site.
set -eu

rev=${1:-HEAD}
root=$(git rev-parse --show-toplevel)
out="$root/dist"

rm -rf "$out"
mkdir "$out"
git -C "$root" archive --format=tar "$rev" -- . \
	':(exclude)blog-src' ':(exclude)design-system' ':(exclude)tools' ':(exclude).githooks' \
	':(exclude).github' ':(exclude).gitignore' ':(exclude)package.json' ':(exclude)package-lock.json' \
	':(exclude)mise.toml' ':(exclude)mise.lock' ':(exclude)wrangler.jsonc' ':(exclude)worker' ':(exclude)README.md' \
	':(exclude)LICENSE' |
	tar -x -C "$out"

# the pages, the files for crawlers and agents, and the host's rules must all be there
missing=0
for file in index.html 404.html _headers robots.txt sitemap.xml llms.txt llms-full.txt llmfull.txt \
	index.md blog.md blog/index.html blog/feed.xml; do
	[ -f "$out/$file" ] || { echo "dist: $file is missing" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || exit 1
echo "dist: $(find "$out" -type f | wc -l | tr -d ' ') files, $(du -sh "$out" | cut -f1) from $(git -C "$root" rev-parse --short "$rev")"
