#!/bin/sh
# Builds the site of one commit (HEAD by default) in a temporary worktree and fails when the build
# changes, adds or removes any file there: the commit's built blog/, sitemap.xml, llms*.txt or
# Markdown pages are not what its sources build. Uncommitted changes in this checkout play no part.
set -eu

rev=${1:-HEAD}
root=$(git rev-parse --show-toplevel)
sha=$(git -C "$root" rev-parse --verify --quiet "$rev^{commit}") || {
	echo "check-site: $rev is not a commit" >&2
	exit 2
}
short=$(git -C "$root" rev-parse --short "$sha")

tmp=$(mktemp -d "${TMPDIR:-/tmp}/lynxdb-site.XXXXXX")
cleanup() {
	git -C "$root" worktree remove --force "$tmp" >/dev/null 2>&1 || rm -rf "$tmp"
	git -C "$root" worktree prune
}
trap cleanup EXIT
trap 'exit 130' INT TERM

git -C "$root" worktree add --quiet --detach "$tmp" "$sha"
[ -f "$root/node_modules/.package-lock.json" ] || (cd "$root" && npm ci --no-audit --no-fund)
ln -s "$root/node_modules" "$tmp/node_modules"

# As mise run build does: blog/ is rebuilt from nothing, so a page whose post is gone shows as removed.
rm -rf "$tmp/blog"
if ! (cd "$tmp" && npm run --silent build:blog >"$tmp.log" 2>&1); then
	cat "$tmp.log" >&2
	rm -f "$tmp.log"
	echo "check-site: the build of $short failed" >&2
	exit 1
fi
rm -f "$tmp.log" "$tmp/node_modules"

changes=$(git -C "$tmp" status --porcelain --untracked-files=all)
if [ -n "$changes" ]; then
	echo "check-site: the built site in $short is not what its sources build:" >&2
	echo "$changes" >&2
	echo "Run mise run build, commit the result and push again." >&2
	exit 1
fi
echo "check-site: $short holds the site its sources build"
