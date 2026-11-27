#!/bin/sh
# Fetches a deployment of the site (its base URL, e.g. https://abc.lynxdb-org.pages.dev) and fails
# when a page in its sitemap, a Markdown copy, a file for crawlers or the 404 does not answer as it
# should. The sitemap lists lynxdb.org addresses; each is fetched from the deployment instead.
set -eu

base=${1%/}
failed=0
fetch() { curl -sS -o /dev/null --retry 5 --retry-all-errors --retry-delay 3 -w '%{http_code} %{content_type}' "$base$1"; }
expect() { # path, status, content type prefix, another accepted prefix
	got=$(fetch "$1") || got="error"
	case $got in
	"$2 $3"* | "$2 ${4:-$3}"*) echo "ok   $1  $got" ;;
	*) echo "FAIL $1  $got, expected $2 $3" >&2; failed=1 ;;
	esac
}

for path in / /blog/; do expect "$path" 200 text/html; done
expect /robots.txt 200 text/plain
for path in /sitemap.xml /blog/feed.xml; do expect "$path" 200 application/xml text/xml; done
for path in /llms.txt /llms-full.txt /llmfull.txt; do expect "$path" 200 'text/plain; charset=utf-8'; done
expect /index.md 200 'text/markdown; charset=utf-8'
expect /blog.md 200 'text/markdown; charset=utf-8'
# a missing .md answers 404 as text/markdown (_headers types every .md address), so these are not .md
for path in /blog-src/ /design-system/ /package.json /no-such-page/; do expect "$path" 404 text/html; done

pages=$(curl -sS --retry 5 --retry-all-errors --retry-delay 3 "$base/sitemap.xml" | sed -n 's|.*<loc>https://lynxdb.org\([^<]*\)</loc>.*|\1|p')
[ -n "$pages" ] || { echo "FAIL the sitemap lists no lynxdb.org pages" >&2; exit 1; }
for path in $pages; do
	expect "$path" 200 text/html
	case $path in /) ;; */) expect "${path%/}.md" 200 'text/markdown; charset=utf-8' ;; esac
done

[ "$failed" -eq 0 ] || { echo "smoke: $base does not serve the site as built" >&2; exit 1; }
echo "smoke: $base serves every page, Markdown copy and file for crawlers"
