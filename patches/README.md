# Patches

Applied to `node_modules` on every install by `patch-package`, wired to the
`postinstall` script so a fresh `npm ci` gets them too.

A patch here is a liability — it pins us to one upstream version and silently
stops applying when that version moves. Each one needs a reason, a removal
condition, and a check that the removal condition is noticed.

## `expo-modules-jsi+57.0.4.patch`

**Without this, the iOS app does not compile at all.**

`expo-modules-jsi@57.0.4` declares fourteen stored properties as `weak let`:

```swift
internal weak let runtime: JavaScriptRuntime?
```

Swift 6.2, which ships with Xcode 26, rejects that:

```
'weak' must be a mutable variable, because it may change at runtime
```

It is right to. A weak reference becomes `nil` when its referent is
deallocated, so it is mutable by definition — `weak let` is a contradiction that
earlier compilers accepted by oversight.

`weak var` alone is not enough. Six of the fourteen live in `final class` types
that conform to `Sendable`, and a mutable stored property breaks that
conformance:

```
stored property 'runtime' of 'Sendable'-conforming class 'HostFunctionContext' is mutable
```

Those six take `nonisolated(unsafe) weak var`, which is the same escape hatch
the upstream code already uses one line below in `JavaScriptError.swift`:

```swift
nonisolated(unsafe) private let pointee: facebook.jsi.JSError
```

So the patch is: all fourteen `let` → `var`, and `nonisolated(unsafe)` on the
six inside `Sendable` classes. None of the properties is ever reassigned, so
there is no behavioural change — it is a pure compile fix.

### A second, unrelated error in the same package

`Coding/JavaScriptCodable+Date.swift` fails with:

```
type of expression is ambiguous without a type annotation
  guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds
```

Both operands are `Double`, so this looks impossible. The cause is C++ interop:
the package builds with `-cxx-interoperability-mode`, which imports C's `abs`
overloads and makes the call ambiguous with Swift's generic `abs`. Rewritten as
`milliseconds.magnitude`, which is exactly equivalent for `Double` and names one
function.

### Error count as the patch was developed

`xcodebuild` exit code 65 throughout: **15** errors originally, **12** after the
naive `let` → `var` pass surfaced the `Sendable` violations, **1** once those
took `nonisolated(unsafe)`, then **0**.

### Removal condition

Delete this patch when `expo-modules-jsi` ships a version whose Swift sources
compile under Swift 6.2. `57.0.4` was the latest published version at the time
of writing (2026-08-04), and `expo@57.0.10` still resolves to it, so there was
no upgrade path — the fix has to come from upstream.

To check:

```bash
npm view expo-modules-jsi version                    # newer than 57.0.4?
grep -rn "weak let" node_modules/expo-modules-jsi/   # still present?
```

If the version moved, `patch-package` will fail loudly on install rather than
applying to the wrong source — which is the intended way to find out.

### Why not just wait for upstream

Because the alternative is no iOS build, and iOS is half of what this project
is. Web still builds either way, which is exactly the trap: without a native
build in the loop, a break like this stays invisible until release.

## `expo-constants+57.0.9.patch`

**Only matters if the project lives in a path containing a space**, which this
one does — `.../Projects/UMich Parking/`.

`EXConstants.podspec` builds its build-phase command by interpolating a path
into a `bash -l -c "…"` string without quoting it:

```ruby
:script => "bash -l -c \"#{env_vars}$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh\""
```

`bash -c` then parses the expanded path as a command plus an argument and tries
to execute the part before the space:

```
No such file or directory: /Users/berezone/Documents/Projects/UMich
```

The patch wraps the path in escaped quotes so `bash -c` sees one word.

`scripts/get-app-config-ios.sh` has the same bug one layer down, and its version
is worse because it fails *quietly*:

```bash
PROJECT_DIR_BASENAME=$(basename $PROJECT_DIR)   # two args when the path has a space
```

`basename` reads the second word as a suffix to strip, returns `UMich` instead
of `Pods`, the script decides it is running in the wrong context and exits 0.
No error, no generated `app.config`, and `Constants.manifest` is empty at
runtime. Quoted.

### Removal condition

Drop when `expo-constants` quotes both. Or, more simply, when this project no
longer lives in a directory with a space in its name — renaming the folder
avoids both bugs and is the better fix if you own the checkout. The patch exists
so the build works either way.

## A note on the space in the project path

`.../Projects/UMich Parking/` has produced **three** separate build failures, in
three different packages, all from the same cause — a path interpolated into a
shell command without quotes:

| Where | Symptom |
|---|---|
| `EXConstants.podspec` | `No such file or directory: /Users/…/UMich` |
| `get-app-config-ios.sh` | silent no-op; `Constants.manifest` never generated |
| Expo's prebuild template | `Script 'Bundle React Native code and images' failed` |

The third is fixed in `plugins/with-space-safe-bundle-phase.js` rather than
here, because it lands in the generated `ios/` project where `patch-package`
cannot reach.

React Native and Expo's build scripts are not written to be space-safe, and
every new native dependency is another chance to find one. **Renaming the
directory to something without a space removes the whole class**, and would let
the `expo-constants` patch and the bundle-phase plugin both be deleted. That is
the recommended fix; the workarounds exist so the build works before anyone gets
round to it.
