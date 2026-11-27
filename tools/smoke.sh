#!/bin/sh
# Fetches a deployment of the site (its base URL, e.g. https://abc.lynxdb-org.pages.dev) and fails
# when a page in its sitemap, a Markdown copy, a file for crawlers or the 404 does not answer as it
# should. The sitemap lists lynxdb.org addresses; each is fetched from the deployment instead.
set -eu

base=${1%/}
failed=0
fetch() { # path, then curl options such as a header
	path=$1
	shift
	curl -sS -o /dev/null --retry 5 --retry-all-errors --retry-delay 3 -w '%{http_code} %{content_type}' "$@" "$base$path"
}
expect() { # path, status, content type prefix, another accepted prefix
	got=$(fetch "$1") || got="error"
	case $got in
	"$2 $3"* | "$2 ${4:-$3}"*) echo "ok   $1  $got" ;;
	*) echo "FAIL $1  $got, expected $2 $3" >&2; failed=1 ;;
	esac
}

for path in / /blog/; do expect "$path" 200 text/html; done
expect /robots.txt 200 text/plain
expect /.well-known/security.txt 200 text/plain
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

# a blog page answers AI agents in Markdown at its own address, and browsers and search engines in HTML
post=$(printf '%s\n' "$pages" | grep -m1 '^/blog/.' || true)
as() { # label, expected content type prefix, curl options
	label=$1 type=$2
	shift 2
	got=$(fetch "$post" "$@") || got="error"
	case $got in
	"200 $type"*) echo "ok   $post as $label  $got" ;;
	*) echo "FAIL $post as $label  $got, expected 200 $type" >&2; failed=1 ;;
	esac
}
if [ -n "$post" ]; then
	as GPTBot 'text/markdown; charset=utf-8' -A 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)'
	as Claude-User 'text/markdown; charset=utf-8' -A 'Claude-User (claude-code; +https://support.anthropic.com/)'
	as 'Accept: text/markdown' 'text/markdown; charset=utf-8' -H 'Accept: text/markdown'
	as Chrome text/html -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
	as Googlebot text/html -A 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
fi
post=/
as 'Accept: text/markdown' 'text/markdown; charset=utf-8' -H 'Accept: text/markdown'

# the HTML of a page names its Markdown copy in a Link header, for agents that read only the headers
for path in / /blog/; do
	link=$(curl -sS -o /dev/null -D - --retry 5 --retry-all-errors --retry-delay 3 "$base$path" | tr -d '\r' | grep -i '^link:' || true)
	case $link in
	*'rel="alternate"; type="text/markdown"'*) echo "ok   $path names its Markdown copy" ;;
	*) echo "FAIL $path has no Link to its Markdown copy: ${link:-none}" >&2; failed=1 ;;
	esac
done

[ "$failed" -eq 0 ] || { echo "smoke: $base does not serve the site as built" >&2; exit 1; }
echo "smoke: $base serves every page, Markdown copy and file for crawlers, and Markdown to AI agents"
