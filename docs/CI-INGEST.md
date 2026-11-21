# Publish and validate the prepared source

Work targets `abdulhameed-developer/filecompresser`, branch `work/filecompresser-production-20261121`. `main` has not been changed. Source publication, dependency validation and production hosting are separate steps.

The initial reviewed snapshot has tree `1a0ea2d192416657919ab6666de5c825f17c302a`, based on commit `a5a25be82dfe71b1f3cbe6327d3d20a68451e736`. A GitHub-created commit can have a different SHA from the local commit because its metadata differs; verify its content tree. Subsequent reviewed fixes or documentation changes produce a new tree. Pin the final reviewed source commit in the validator.

Local verification passed all 278 automated tests. Remote Tina dependency installation, the actual local-mode CMS/schema build and runner browser/output QA remain pending. Local checks do not establish hosted sign-in, editor roles or password-recovery email delivery.

## Publish the reviewed source

1. Read the integration branch's current head and preserve it as the new commit's parent. Keep `main` unchanged and confirm that no hosting integration automatically deploys this branch.
2. Use the authenticated GitHub Git Data API to create exact source blobs and a tree containing the reviewed additions, changes and deletions. Exclude credentials, dependencies, local development files, generated engine/admin files and temporary bootstrap templates. Compare the returned tree with the approved content tree.
3. Create the source commit and update only the integration ref with `force: false`. Recheck the remote branch and returned commit/tree identities. Stop and review any concurrent branch change rather than overwriting it.

The source-secret checker reports file locations and finding types without printing matching values. Run it alongside a manual review:

```sh
git ls-files -z --cached --others --exclude-standard | node scripts/check-source-secrets.mjs --files-stdin
```

## Run read-only validation

Render `__EXPECTED_SOURCE_SHA__` in the prepared `validate-prepared-source.yml` with the GitHub-returned final source commit SHA. Add it as `.github/workflows/validate-prepared-source.yml` in a child commit on the integration branch. This avoids a recursive commit-hash dependency. The workflow has one `contents: read` job and performs no repository writes.

It verifies source ancestry and permits only the temporary validator and generated package/CMS lock files to differ from the reviewed source. Package scripts and other manifest fields must remain unchanged. It then runs:

- Node 22.22.1, `npm ci`, and exact `tinacms@3.15.2` / `@tinacms/cli@4.0.5` installation.
- Type checking, lint, tests and one `build:cms:local` build of the actual admin/schema and static site.
- Public-content, upload, redirect, exported-route and media-engine integrity checks.
- Isolated runner Chrome audits for navigation, responsiveness, accessibility mechanics, UI behavior and genuine downloaded file outputs checked by independent decoders. The job starts and stops only its own loopback preview server and reuses the same build.
- Fresh dependency audits: no production vulnerabilities and no high/critical full-tree findings. Lower-severity development findings remain visible for review.

Failures, missing prerequisites and timeouts block successful validation. These checks do not certify accessibility conformance, real mobile/Safari behavior, hosted CMS authentication, roles, recovery emails or production deployment.

Artifacts contain only source manifests/locks and hashes, audit JSON, and allowlisted QA JSON, PNG screenshots and logs. They exclude site/admin exports, engine/WASM binaries, caches and input/output fixtures. The [codec distribution gate](CODEC-DISTRIBUTION.md) remains unresolved; this process neither rebuilds upstream FFmpeg nor establishes matching corresponding source.

## Commit validated locks

Download `validated-source-locks-RUN_ID` from the exact successful run:

| Artifact file | Repository destination |
| --- | --- |
| `lock-0.json` | `package.json` |
| `lock-1.json` | `package-lock.json` |
| `lock-2.json` | `tina/tina-lock.json` |
| `validation.json` | Review metadata; do not commit |

Verify the metadata's repository, branch, run ID, approved source/tree, validated head/tree, successful check flags and each file's SHA-256. Parse the JSON and confirm that the package manifest differs from the approved source only by the two exact Tina development dependencies.

Re-read the integration branch and require that it still points to `validatedHead`. Use the connector to commit only the three verified destination files, with that head as parent and a non-force integration-ref update. No artifact code needs to execute with write access.

The lock commit triggers the same read-only validator again. Check that its generated lock hashes match the committed bytes before treating the setup as reproducible. After reviewing final evidence, remove the temporary validator and retain normal CI for future changes. Review the integration branch before merging; hosting, DNS, hosted editor access and recovery-email checks remain separate work.
