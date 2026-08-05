# UMichFreePark — release automation.
#
# Every version number in this repo is owned by scripts/version.mjs. This file
# never computes a version itself; it prompts, validates, and delegates. See
# docs/releasing.md.
#
# Portability: POSIX sh recipes only — no GNU-make conditionals, no $(shell) —
# so this works with both BSD make and GNU make on macOS. Recipe lines are
# indented with real TAB characters; spaces will not work.

NODE    ?= node
VERSION ?=
PART    ?= patch

VERSION_SCRIPT = scripts/version.mjs
V              = $(NODE) $(VERSION_SCRIPT)

.PHONY: help bump tag untag check-version

# First target is the default goal in both BSD and GNU make.
help:
	@echo "UMichFreePark release targets"
	@echo ""
	@echo "  make check-version              Show all version locations and whether they agree"
	@echo "  make bump [PART=patch]          Bump major|minor|patch|prerelease (confirms first)"
	@echo "  make bump VERSION=1.2.0         Set an explicit version (confirms first)"
	@echo "  make tag VERSION=v1.2.0         Create an annotated tag (does not push)"
	@echo "  make untag VERSION=v1.2.0       Delete a tag locally and on the remote"
	@echo ""
	@echo "Full procedure: docs/releasing.md"

# Read-only passthrough. Exits 1 if the locations have drifted.
check-version:
	@$(V) check

# Writes the version to all four locations. Does not commit, does not tag.
bump:
	@if ! $(V) check >/dev/null 2>&1; then \
	  echo "The version locations have DRIFTED:"; \
	  echo ""; \
	  $(V) check || true; \
	  echo ""; \
	  echo "Refusing to bump. Bumping from here double-bumps whichever file is"; \
	  echo "already ahead, which is exactly the failure this check exists to catch."; \
	  echo "That state usually means a previous bump was interrupted partway."; \
	  echo ""; \
	  printf 'Reconcile every location to one version instead? Type the version (e.g. 1.2.0), or "no" to abort: '; \
	  read reply; \
	  if [ -z "$$reply" ] || [ "$$reply" = "no" ] || [ "$$reply" = "n" ]; then \
	    echo "Aborted. Nothing was written."; \
	    exit 1; \
	  fi; \
	  $(V) set "$$reply" --force-reconcile; \
	  exit $$?; \
	fi; \
	current=`$(V) current`; \
	if [ -n "$(VERSION)" ]; then \
	  target="$(VERSION)"; \
	else \
	  target=`$(V) bump "$(PART)" --dry-run` || exit 1; \
	fi; \
	if [ -z "$$target" ]; then echo "error: could not compute a target version."; exit 1; fi; \
	echo ""; \
	if [ -n "$(VERSION)" ]; then \
	  echo "  bump      explicit (VERSION=$(VERSION))"; \
	else \
	  echo "  bump      $(PART)"; \
	fi; \
	echo "  current   $$current"; \
	echo "  target    $$target"; \
	echo ""; \
	echo "This rewrites package.json, package-lock.json and app.json, and increments"; \
	echo "the iOS build number. It does not commit and does not tag."; \
	echo ""; \
	printf 'Type the target version to confirm, anything else to abort: '; \
	read reply; \
	if [ "$$reply" != "$$target" ]; then \
	  echo "Aborted. Nothing was written."; \
	  exit 1; \
	fi; \
	$(V) set "$$target" || exit 1; \
	echo "Next:"; \
	echo "  git add -A && git commit -m \"chore(release): $$target\""; \
	echo "  make tag VERSION=v$$target"

# Annotated tag only. Refuses on a dirty tree or on metadata that does not
# match the tag. Prints the push command rather than pushing — pushing a tag
# ships something, and that should be a decision made on purpose.
tag:
	@tag="$(VERSION)"; \
	if [ -z "$$tag" ]; then \
	  echo "usage: make tag VERSION=v1.2.0"; \
	  exit 1; \
	fi; \
	case "$$tag" in \
	  vv*) \
	    echo "error: \"$$tag\" has a doubled \"v\"."; \
	    echo "       You probably typed VERSION=v\$$(something already starting with v)."; \
	    echo "       Use: make tag VERSION=v$${tag#vv}"; \
	    exit 1;; \
	  v*) ;; \
	  *) \
	    echo "error: \"$$tag\" is missing the leading \"v\"."; \
	    echo "       Tags in this repo are v-prefixed; the version itself is not."; \
	    echo "       Use: make tag VERSION=v$$tag"; \
	    exit 1;; \
	esac; \
	ver="$${tag#v}"; \
	if [ -n "`git status --porcelain`" ]; then \
	  echo "error: the working tree is dirty. Commit or stash before tagging:"; \
	  git status --short; \
	  exit 1; \
	fi; \
	if git rev-parse -q --verify "refs/tags/$$tag" >/dev/null; then \
	  echo "error: tag $$tag already exists locally."; \
	  echo "       To move it: make untag VERSION=$$tag, then re-tag."; \
	  exit 1; \
	fi; \
	if ! $(V) check --expect "$$ver"; then \
	  echo ""; \
	  echo "error: refusing to create $$tag — see the problem above."; \
	  echo "       If the version is right, run \`make bump\` and commit before tagging."; \
	  exit 1; \
	fi; \
	git tag -a "$$tag" -m "UMichFreePark $$ver" || exit 1; \
	echo ""; \
	echo "Created annotated tag $$tag. Nothing has been pushed."; \
	echo "To ship it:"; \
	echo ""; \
	echo "    git push --follow-tags"; \
	echo ""

# Deletes a tag locally and on the remote. Asks separately about the GitHub
# release, because deleting that is usually the wrong call.
untag:
	@tag="$(VERSION)"; \
	if [ -z "$$tag" ]; then \
	  echo "usage: make untag VERSION=v1.2.0"; \
	  exit 1; \
	fi; \
	remote=`git remote 2>/dev/null | head -n 1`; \
	echo "About to delete tag $$tag:"; \
	if git rev-parse -q --verify "refs/tags/$$tag" >/dev/null; then \
	  echo "  - local tag        yes"; \
	else \
	  echo "  - local tag        not present"; \
	fi; \
	if [ -n "$$remote" ]; then \
	  echo "  - remote tag       $$remote (will attempt delete)"; \
	else \
	  echo "  - remote tag       no git remote configured, skipping"; \
	fi; \
	echo ""; \
	printf 'Type the tag name to confirm, anything else to abort: '; \
	read reply; \
	if [ "$$reply" != "$$tag" ]; then \
	  echo "Aborted. Nothing was deleted."; \
	  exit 1; \
	fi; \
	release=""; \
	if command -v gh >/dev/null 2>&1; then \
	  if gh release view "$$tag" >/dev/null 2>&1; then release="yes"; fi; \
	else \
	  echo "note: gh CLI not found, cannot check for a GitHub release."; \
	fi; \
	if [ "$$release" = "yes" ]; then \
	  echo ""; \
	  echo "A GitHub release already exists for $$tag."; \
	  echo ""; \
	  echo "Leaving it is usually correct: the release action upserts, so re-pushing"; \
	  echo "the tag updates that release in place. Deleting it loses the download"; \
	  echo "counts and breaks any link people already have to it."; \
	  echo ""; \
	  printf 'Delete the GitHub release too? Type "delete" to delete it, anything else to leave it: '; \
	  read rel_reply; \
	else \
	  rel_reply="leave"; \
	fi; \
	if git rev-parse -q --verify "refs/tags/$$tag" >/dev/null; then \
	  git tag -d "$$tag" || exit 1; \
	fi; \
	if [ -n "$$remote" ]; then \
	  git push --delete "$$remote" "$$tag" || echo "note: remote tag delete failed (it may not exist there)."; \
	fi; \
	if [ "$$rel_reply" = "delete" ]; then \
	  gh release delete "$$tag" --yes && echo "Deleted GitHub release $$tag."; \
	elif [ "$$release" = "yes" ]; then \
	  echo "Left the GitHub release in place. Re-tagging will update it."; \
	fi; \
	echo "Done."
