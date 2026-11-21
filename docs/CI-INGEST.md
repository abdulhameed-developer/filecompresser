# Reviewed source import through GitHub Actions

This is a proposed one-time import procedure for the prepared FileCompresser source. It has not been published or executed. It exists because the local execution environment cannot reach the npm registry or push Git, while the authenticated GitHub browser can upload the reviewed source bundle and GitHub-hosted runners can install dependencies.

The procedure uses only `abdulhameed-developer/filecompresser`, integration branch `work/filecompresser-production-20261121`, and reviewed base commit `a5a25be82dfe71b1f3cbe6327d3d20a68451e736`. It does not merge into or push to `main`, deploy hosting, change DNS, create a release, or publish a built site.

## Approval before publishing the bootstrap

Publishing the importer grants one guarded GitHub Actions job temporary repository `contents: write` permission. GitHub's token permission is repository-wide; the reviewed job explicitly restricts its destination to the integration branch, checks that the branch has not advanced, and never force-pushes. Creating this workflow and uploading its triggering bundle require the owner's action-time approval before those browser actions. The approval should identify the repository, exact integration branch, reviewed snapshot SHA and bundle SHA-256, and the intended automatic commit of tested source/dependency locks. No account password, personal access token, Tina token or hosting credential is required.

Verify that no hosting integration automatically deploys this integration branch. The importer itself has no deployment step. A separate hosting integration could otherwise react to a branch push independently.

## Prepare an immutable reviewed snapshot locally

1. Review the full source diff and confirm the branch still starts at the fixed base above. Keep secrets, private development folders, dependencies, generated admin bundles and media-engine binaries out of the source index. Run `git ls-files -z --cached --others --exclude-standard | node scripts/check-source-secrets.mjs --files-stdin`, the normal local checks, and a manual secret review. The scanner reports locations and finding types without printing matching values; it is a heuristic, not a credential-free certification.
2. Exclude `.github/workflows/ingest-prepared-source.yml` from the snapshot commit. It is a bootstrap template containing `__EXPECTED_SNAPSHOT_SHA__` and `__EXPECTED_BUNDLE_SHA256__` markers and must be rendered only after the snapshot exists. Also exclude `.delivery/source.bundle`. Include the prepared ordinary `ci.yml`, source, docs and content changes.
3. Make exactly one reviewed source commit directly on the fixed base on `work/filecompresser-production-20261121`. Verify that `git show -s --format=%P HEAD` prints only the fixed base SHA. The importer rejects extra parents or a different base.
4. Create the incremental Git bundle outside the checkout:

   ```sh
   git bundle create /tmp/filecompresser-source.bundle a5a25be82dfe71b1f3cbe6327d3d20a68451e736..refs/heads/work/filecompresser-production-20261121
   git bundle verify /tmp/filecompresser-source.bundle
   git bundle list-heads /tmp/filecompresser-source.bundle
   sha256sum /tmp/filecompresser-source.bundle
   ```

   It must advertise exactly the snapshot SHA followed by `refs/heads/work/filecompresser-production-20261121`. Record the snapshot SHA and complete bundle digest for review.
5. Render the two hash markers in a copy of the bootstrap workflow. Keep that rendered copy outside the snapshot commit. Confirm that the file contains the correct fixed repository, branch, base and expected hashes and has no unresolved markers. Review both jobs before asking the owner to approve publishing/running them.

## Browser bootstrap prerequisites

After the owner approves the concrete operation, create the remote integration branch from the fixed base. Before uploading the bundle, use the authenticated GitHub browser to apply these reviewed workflow changes on that branch:

- Replace `.github/workflows/ci.yml` with the exact prepared final version from the snapshot. This version must not upload `out/`, FFmpeg/WASM binaries or deployable artifacts while the codec distribution gate remains unresolved.
- Delete the obsolete `.github/workflows/deploy.yml`, matching its deletion in the snapshot.
- Add the rendered `.github/workflows/ingest-prepared-source.yml`.

Then upload the exact verified bundle as `.delivery/source.bundle` on the integration branch. The upload triggers the importer. Bootstrap commits must retain the fixed base as an ancestor. If branch setup differs, stop and review it rather than changing the expected base or forcing a push.

These workflow edits must already exist in the browser bootstrap: the ordinary `GITHUB_TOKEN` does not provide a `workflows` permission for modifying workflow files. Both jobs reject any workflow tree difference introduced by the source merge relative to the bootstrap commit. This avoids requiring a new personal access token or app permission.

## What runs and what can be written

The `validate` job has `contents: read`. It verifies the fixed repository/ref, expected bundle digest, exact advertised ref and snapshot SHA, single fixed-base parent, and absence of recursive delivery/bootstrap files in the snapshot. It merges the reviewed snapshot locally without committing, preserving the browser bootstrap history. It removes the input bundle from the eventual tree and verifies that workflow files remain byte-for-byte unchanged from the bootstrap tree.

It then runs:

1. Node 22.22.1, `npm ci`, and `npm run setup:cms`. The installer selects exact `tinacms@3.15.2` and `@tinacms/cli@4.0.5` releases, updates `package.json` and its lock together, and verifies installed versions.
2. Type checking, lint and tests.
3. `npm run build:cms:local` to exercise the actual local CMS schema/admin generator, produce `tina/tina-lock.json`, and build the static site. The local CMS mode needs no Tina authentication token and is not the production hosted-auth build.
4. Public-content/media/redirect checks, the static export crawler and static release integrity checks against that one CMS/static build.
5. Install isolated QA packages outside the project with exact documented pins: `playwright-core@1.64.1`, `omggif@1.0.10`, `ffmpeg-static@5.3.0` and `ffprobe-static@3.1.0`. Use Chrome/Chromium already installed on the official Ubuntu runner; require `pdftotext` and install the standard `poppler-utils` package if needed. Start only this job's `serve-static.mjs` process on loopback port 3198, refuse an occupied port, bound readiness, and terminate the owned server on exit. Exercise route crawling plus the existing navigation, responsive, role/security/accessibility, manual-mechanics, design-system, premium-UI and genuine file-output/independent-decoder audits in an isolated runner browser. These tests use synthetic local inputs, verify downloaded output formats/content, and collect errors and screenshots. They do not inspect the owner's browser, certify accessibility conformance, cover Firefox/Safari or real mobile hardware, or establish hosted CMS login, password reset, editor roles or production deployment. Each audit is bounded; any missing prerequisite, failed check or timeout blocks finalization. Browser QA reuses the single built export and does not rebuild it.
6. Fresh production and full dependency audits. Any production vulnerability or any high/critical full-tree vulnerability fails the import. Lower-severity development findings remain visible in the audit reports and require review; they are not silently reported as a clean audit. Registry/network errors also fail the gate.

The job checks that the only package manifest change is the two exact CMS development dependencies, and that builds did not change other source files. It uploads only three source lock/manifest files, their SHA-256 metadata, audit JSON, and allowlisted QA JSON/PNG screenshots and logs. QA evidence is retained on success or failure; only valid PNG signatures and parseable JSON from the known audit paths are copied into that evidence artifact. It never uploads `out/`, `public/admin`, generated media-engine files, input/output fixtures, caches, the source bundle or a site archive. Installed FFmpeg/WASM packages and generated engine chunks remain on the ephemeral runner while [the codec distribution gate](CODEC-DISTRIBUTION.md) remains unresolved. The workflow does not rebuild upstream FFmpeg, establish matching corresponding source, or clear that distribution gate.

The read-only job has a 45-minute overall limit and a 25-minute browser-audit step limit. All of this remains a proposed workflow until the approved GitHub run returns evidence; local preparation is not a browser-QA success claim.

Only after successful validation does `finalize` receive `contents: write`. That separate job does not install dependencies or execute project scripts. It repeats bundle/base/ref verification, reconstructs the same normal merge, verifies the same-run lock metadata and bytes, and stages only `package.json`, `package-lock.json`, `tina/tina-lock.json` and removal of the temporary input bundle in addition to the already reviewed source merge. It creates a normal two-parent merge commit and pushes only `HEAD:refs/heads/work/filecompresser-production-20261121`. An advanced branch, conflict, unexpected workflow change, missing evidence, hash mismatch or audit failure stops the operation. No force-push or `main` update is attempted.

The short-lived GitHub token is supplied only to the final network push step. Checkout does not persist credentials. A temporary askpass helper contains no token value; it reads the token from that step's environment and is removed afterward. No token is written to the repository or artifacts.

## Verify completion and remove the bootstrap

Success means the returned integration branch commit preserves both the browser bootstrap and approved source snapshot as parents, contains the tested CMS package/lock files and `tina/tina-lock.json`, and has no `.delivery/source.bundle` in its current tree. Inspect the Actions result and compare the integration branch before proceeding with the normal PR/release review. `main` must remain unchanged.

The importer intentionally leaves its own workflow file unchanged because deleting it with the ordinary bot token would require workflow-editing access. After verifying the successful import, remove `.github/workflows/ingest-prepared-source.yml` through the owner's authenticated GitHub browser on the integration branch. Do this before any merge to `main`. The missing input bundle already prevents a successful replay; the branch and hash guards also remain fixed. Remove the empty `.delivery` folder if the browser displays it.

Deleting the bundle from the current tree does not erase the historical bootstrap commit that contained it. The bundle contains only the reviewed source snapshot and no secrets or generated engine binaries; it must be reviewed on that basis before upload. Rewriting published history to erase it is outside this procedure.

References: [Git bundles](https://git-scm.com/docs/git-bundle), [GitHub token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token), [workflow permission syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), and the pinned official [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0), [upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) and [download-artifact](https://github.com/actions/download-artifact/releases/tag/v8.0.2) releases.
