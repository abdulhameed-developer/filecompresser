# CMS validation security

The static public tools do not use Tina or Zod to process visitors' files. Tina is
the editorial admin and build tool. It validates configuration and ordinary JSON
from Git and the editor. The build treats authored JSON as untrusted data;
executable configuration, React components and callbacks remain trusted code.

## Pinned upstream dependency and local backport

The reviewed CMS releases are `tinacms@3.15.2` and `@tinacms/cli@4.0.5`. Their
Zod 3 API requirements prevent replacing Zod with version 4 without a separate
Tina migration. Zod remains honestly named and versioned `3.25.76`. Its original
npm integrity, released-source commit, four original runtime hashes, transformer
identity and six resulting runtime hashes are in
`scripts/cms-security/manifest.json`.

The original installed ESM and CommonJS files were inventoried in GitHub Actions
run 44893326955. A source-derived fixture independently reproduces all four
security-critical original files byte for byte. This supports local transformer
tests; final installed-package and complete CMS integration checks remain
mandatory in CI.

The bounded-container change backports the behavior of upstream Zod commit
`a0ebf970f2d752e5f58527cd2942ff48be4f46bd` (PR 6652). An array exceeding its
declared maximum or exact size, or a set exceeding its maximum, fails before
validating children. This upstream change alone does not bound unbounded
schemas. The local patch additionally checks ordinary input graphs and shares
an issue budget across nested synchronous and asynchronous parsers.

Primary references:

- [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [Upstream bounded-container fix](https://github.com/colinhacks/zod/pull/6652)
- [Zod 3 support discussion](https://github.com/colinhacks/zod/issues/6653)
- [Tina's Zod 4 migration issue](https://github.com/tinacms/tinacms/issues/7953)

## Resource boundaries

Before Tina indexes authored JSON, `check-cms-inputs.mjs` rejects symlinks,
malformed JSON, files above 2 MiB, more than 10,000 JSON files, total content
above 64 MiB and directories deeper than eight levels. Reads are bounded and a
file changing during its read is rejected. Syntax diagnostics identify the path
without printing private draft values.

Each Zod root parse checks ordinary data against these limits:

| Limit | Maximum |
| --- | ---: |
| Graph depth | 64 |
| Scheduled graph nodes, including repeated references | 20,000 |
| Entries in one array, object, map or set | 4,096 |
| Validation issues shared by one root parse | 1,000 |

Cycles and accessors in ordinary data are rejected. Array holes and shared graph
occurrences count toward the budget. Functions, non-plain class instances and
recognized React values remain opaque so normal executable Tina configuration
works. These limits are not a JavaScript sandbox: hostile proxies, arbitrary
callbacks, expensive custom regular expressions or untrusted executable schemas
are outside this data boundary. JSON file bytes have the separate bound above.

## Installation and verification

`postinstall` authenticates every actual installed Zod copy, including nested
copies and aliases, before changing any runtime file. It preserves authenticated
originals, refuses unknown bytes and refuses to modify shared dependencies
outside the checkout. The initial pre-CMS or production-only install may defer
the patch when both CMS packages are absent; deferral produces no verified
evidence. `setup:cms` installs the exact CMS releases and explicitly applies and
verifies the patch immediately afterward: npm's named-package install does not
run the root project's postinstall. A failed installation or security proof
fails setup before any CMS test or build. Do not use `--ignore-scripts` for a
CMS build.

`npm run check:cms-security` does not trust a saved attestation. It rechecks the
original and patched hashes and starts fresh, memory-bounded Node workers with
strict unhandled-rejection behavior. Both ESM and CommonJS run real valid,
invalid, bounded and unbounded, synchronous and asynchronous regression cases.
The workers also call the actual installed Tina schema API with the configured
collections, an invalid schema and an oversized schema. Existing Zod APIs,
ordinary error identities and normal configuration behavior are retained.

CMS development and builds require this verification and content preflight.
The production CMS build also follows the generated admin HTML entry's local
JavaScript imports and checks the structure of its shipped Zod roots and parser
guards. Unknown or unguarded shapes fail. This is explicitly reported as static
entry-reachable code coverage, separate from Node runtime/schema probes. Hosted
login, password reset, authenticated editor writes and editor browser runtime
behavior require separate account/browser checks; these probes do not assert
those actions occurred.

## Audit decision and maintenance

`npm run audit:dependencies` retains the original all-dependency and production
`npm audit --json` reports. It does not rewrite package versions, severities,
advisory metadata or npm's suggested downgrade. The registry finding remains
visible. A narrowly named `verified-backport-disposition` is possible only for
GHSA-mrhx-c7xc-m3w5 and the exact reviewed CMS dependency graph, after every actual
installed Zod instance passes hash and fresh runtime/schema checks. Every
unrelated high or critical finding fails. Any production vulnerability fails.
Low and moderate development findings remain in the reports for review.

The reviewed-source validator, normal main/PR CI and Cloudflare's
`npm run deploy:check` use the same audit policy. Raw reports, current runtime
proof and the disposition are retained as JSON evidence. Generated locks are
accepted only after the complete CMS, type, test, static-export and real-output
browser checks pass. CI does not publish site or codec binaries.

For an upgrade, review the new upstream dependency graph and advisory first.
Replace the pins, original byte provenance and expected output hashes together;
do not relax the hash or advisory gates to make an unknown release install.
Re-run all parser regressions, the actual installed Tina schema/admin build and
public conversion acceptance checks. Remove this backport when a supported Tina
release permits a fully patched upstream Zod release with equivalent behavior.
