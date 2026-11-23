# FileCompresser: admin, publishing and domain setup

The setup uses **GitHub for source and content, Cloudflare Pages Free for the static website, and TinaCloud for editor accounts**. The chosen primary address is **https://filecompresser.com**. You do not need to buy shared hosting or rent an application server. Domain registration and renewal remain separate.

## Your live setup

The repository, TinaCloud **FileCompresser** project and Cloudflare Pages **filecompresser** project already exist and are connected. Your requested CMS account is already **Active Owner**. Domain DNS/DNSSEC, the working **info@filecompresser.com** mailbox and Google/Bing ownership are verified. Keep these existing resources; no duplicate project, account invitation or role downgrade is needed. [DNS and email](DNS-AND-EMAIL.md) records the actual setup evidence.

**The website is deployed at https://filecompresser.com.** The reviewed source and reproduced CMS locks are on `main`; the connected Cloudflare production build succeeded with 436 tests and the private-token export scan. Both root and `www` hostnames have Active SSL, and root HTTPS serves the actual application. Hosted CMS login loaded all 13 tool documents. The authorized JPG save is now visible publicly as “Keep a copy of your original JPG,” and its main-branch CI passed. Public robots are index/follow and the canonical uses the HTTPS root. Logout and existing-SSO re-entry to all six collections are verified. Google/Bing sitemap rows both show Success with 26 discovered URLs; the Google live homepage eligibility/indexing request is recorded. Complete live validation [45117263085](https://github.com/abdulhameed-developer/filecompresser/actions/runs/45117263085) passed on **23 November 2026 at 10:22 PKT**: 16 HTTP checks, 27 public addresses, published article/image assertions and three selected PNG/WAV/no-upload browser checks. Native chooser upload and reset-email delivery were not exercised; search-engine indexing is not claimed. [The release review](RELEASE-REVIEW.md) identifies the exact deployment and save commits.

## What the editor manages

| Collection shown in the CMS | What to change there |
| --- | --- |
| **Blog posts** | Articles, content blocks, featured images, author attribution, dates, SEO fields, draft/published and archive state. |
| **Tool pages** | Supporting text below the existing tool, helpful links, related tools, SEO fields and FAQ display. |
| **Homepage** | Main introduction, how-it-works steps, supporting content, links, FAQs and homepage SEO fields. |
| **Information pages** | About, Contact, Privacy, Terms, Disclaimer and the blog index. Review factual/policy claims before changing them. |
| **Site identity and SEO defaults** | Site/publisher names, title suffix, descriptions, sharing image, verified profile URLs and support email. Keep the mailbox accurate and monitored. |
| **URL redirects** | Exact old paths and their final published replacements for reviewed URL migrations. |

The public site reads saved content during a build and emits HTML. Search engines can read that content without opening the editor. A save is not an instant change to an existing deployment: Tina commits to GitHub, Cloudflare builds, then the successful deployment becomes public.

## 1. Preserve the reviewed source on GitHub

Use the existing repository, [abdulhameed-developer/filecompresser](https://github.com/abdulhameed-developer/filecompresser). Keep the latest reviewed files and existing Git history. The reviewed application and CMS locks have already merged into production `main`. Preserve subsequent CMS commits when making maintenance changes; publish only the intended changes against fresh `main`, rather than replacing it with an older Downloads or prepared copy.

The committed `package.json`, `package-lock.json` and `tina/tina-lock.json` were reproduced byte for byte in the final cold validation run. Keep those files together for future CMS dependency/schema changes. A temporary CI installation by itself does not publish changed files.

Commit project source, `content/`, Tina configuration and the required lockfiles. Keep `.env`, `.env.local`, passwords/tokens, `node_modules`, `.next`, `out` and generated admin/engine bundles out of Git. GitHub stores the code; Cloudflare hosts this deployment. GitHub Pages is not required.

## 2. Use the existing TinaCloud project and owner account

1. Sign in at [app.tina.io](https://app.tina.io/) using the account and sign-in method already used during setup. Open **FileCompresser**, connected to the existing repository.
2. Keep production branch `main`. Tina configuration is at the repository root, so the optional **Path To Tina** value stays empty.
3. The allowed origins currently include `http://localhost:3000`, `https://filecompresser.com` and `https://www.filecompresser.com`. Origins have no `/admin` path. Preview/`pages.dev` origins have not been given editor access. Add a separate exact origin only if editing there is intentionally required; otherwise use the primary custom domain for hosted login.
4. Use the existing project's public Client ID. Its Content/read-only token is already an encrypted Cloudflare **Production Secret** named `TINA_TOKEN`; keep the value out of source, screenshots and ordinary Text settings.
5. The hosted editor has successfully loaded the 13 tool documents from `main`. After future schema changes, allow TinaCloud to finish indexing that branch and resolve any indexing error before editing.

### Future access for a different SEO colleague

The requested account already owns the project; do not invite it again or downgrade it. If a **different person** later needs access, use their own email and the project's appropriate Editor role, subject to the plan's current seat allowance. Keep your own Owner access. An editor does not need your GitHub password.

This setup publishes from `main`: editor saves can become public after a successful Cloudflare build. Give publishing access only to trusted people. A separate editorial approval workflow is not configured.

### Login, logout and password recovery

Open **https://filecompresser.com/admin/index.html** and use the CMS sign-in control with your existing authorized account. Hosted login has worked and loaded the tool documents. The public admin page does not give unauthenticated visitors permission to edit GitHub.

Use the same sign-in method as account creation. The actual `auth.tina.io` email flow was inspected: enter your email and choose **Continue**; the hosted form then shows **Reset password** and Password. Use the reset link if needed. GitHub sign-in is also available. Follow your original account method; for provider-based sign-in, recover that provider account instead. No reset email was issued, password changed or new credential entered during this inspection. Normal GitHub sign-in restored the FileCompresser project dashboard. The website stores no independent admin password and operates no reset-email server.

Check spam and the original sign-in method if recovery fails, then use [Tina support](https://tina.io/docs/support). Hosted login and a real save reaching GitHub are verified. The corresponding public JPG heading is also verified. Logout showed **Log In**, and signing back in with the existing SSO session returned the six-collection dashboard. The reset link is verified; reset-email delivery and a password change have not been tested. Log out when finished on a shared device.

## 3. Local editing and maintenance

Use Node.js **22.12 or later within the Node 22 series**. From the project directory:

```sh
npm ci
npm run dev:cms
```

The exact CMS dependencies and schema lock are already committed, so a clean checkout uses `npm ci`. Keep install scripts enabled so the reviewed CMS security changes are applied/verified. `setup:cms` remains available for deliberate setup or dependency maintenance; daily content edits do not require reinstalling the editor.

Open **http://localhost:3000/admin/index.html**. If another project already uses port 3000, stop that old server or deliberately configure a different port and allowed origin. Local mode edits your local files without a production login. Keep its ports on your own computer; local edits reach GitHub only after a commit and push.

Check the collections in the table above. Make a temporary local content edit, inspect the affected page and restore test-only changes before publishing. If you deliberately change CMS dependencies/schema, preserve the resulting package/schema locks and validate the source as described in step 1.

`npm run build` builds the website and prepared notices. `npm run build:cms` also generates the production-connected editor. **Cloudflare production uses `npm run deploy:check`**, which includes the connected CMS build and release gates. Never deploy a local-mode editor or bypass a failed gate by switching to a smaller build command. Tina CLI local configuration normally comes from `.env`; `.env.local` alone is not a substitute for the hosting variables.

## 4. Existing Cloudflare Pages production settings

Open [dash.cloudflare.com](https://dash.cloudflare.com/), then **Workers & Pages → filecompresser**. Its GitHub connection, production branch `main`, assigned hostname **filecompresser.pages.dev** and output directory `out` already exist. Its confirmed build command is `npm run deploy:check`, with automatic production deployments from `main` enabled and non-production preview branches set to none. The reviewed source has merged into `main`, and production deployment `ac6226f3-0be4-4eb5-8243-de37cc82cd5d` succeeded for merge commit `8b1a9439cf1d1f981f169691d280794173e255ac`.

Keep these confirmed production settings:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js (Static HTML Export), or None with the explicit values below |
| Production branch | `main` |
| Root directory | Repository root; leave empty |
| Build command | `npm run deploy:check` |
| Build output directory | `out` |
| Node version | `22` using `NODE_VERSION` |

Maintain the existing **Production** variables:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NEXT_PUBLIC_TINA_CLIENT_ID` | Public Client ID from the existing FileCompresser TinaCloud project |
| `TINA_TOKEN` | Existing Content/read-only token, stored as an encrypted Production Secret |
| `NEXT_PUBLIC_TINA_BRANCH` | `main` |
| `NEXT_PUBLIC_SITE_URL` | `https://filecompresser.com` |
| `NEXT_PUBLIC_ENABLE_INDEXING` | `true`, saved and applied; public robots are index/follow |

The `NEXT_PUBLIC_` values are public configuration. Keep passwords, GitHub credentials and the content-read token out of them. The release packaging check scans every exported file for the active content token and fails if it appears.

The first connected production build succeeded, including TinaCloud schema/index checks, 436 tests and the active-token export scan. Hosted login has also worked. The subsequent JPG CMS edit passed main-branch CI run 44908685680 and is visible on its public page. Its public canonical and index/follow directives are verified. Continue checking future deployments rather than treating an earlier success as proof of a later save.

The pinned new WebAssembly engine is **20,752,732 bytes**. It is split into content-addressed chunks below Pages' 25 MiB per-file limit and reconstructed/verified in the visitor's browser. Its matching source/notices/recipe package is published at the fixed codec release. Preserve the generated aggregate notices and source access.

Keep preview indexing off. Give untrusted preview branches no production token. A basic public-site preview can use `npm run build`; hosted editor acceptance must use the connected production editor and its approved origin.

## 5. Domain, redirects and search verification

The domain uses the existing Cloudflare Free DNS zone and assigned nameservers; DNSSEC is confirmed active. Both **filecompresser.com** and **www.filecompresser.com** show **Active SSL**. Root HTTPS serves the actual Pages application. Keep the existing zone, registrar, mailbox and search-verification records; the earlier registrar parking description is historical.

The verified domain and search settings are:

1. The public JPG page now shows **“Keep a copy of your original JPG”**, matching the actual CMS save. Its main-branch CI run [44908685680](https://github.com/abdulhameed-developer/filecompresser/actions/runs/44908685680) passed. Use the same commit/build/public-page check for future edits.
2. Bulk Redirect rule `fe003ec0743f42ad995d0b8ba2168f8b` is **Enabled**, using list `8f839775e5ab458d8b6f1cbde1623307`. Its exact `www.filecompresser.com` and `filecompresser.pages.dev` sources target the HTTPS root with status 301, query/path preservation on and Include subdomains off. Live HTTP checks verified 301 responses to the HTTPS root from HTTP root, HTTPS `www` and the production Pages hostname, preserving the tested path and query.
3. Production `NEXT_PUBLIC_ENABLE_INDEXING=true` is saved and applied: the public robots directive is **index, follow** and the inspected canonical uses **https://filecompresser.com**. These crawl/index settings do not establish that Google or Bing has indexed the site. The live sitemap XML is browser-verified with 26 URLs; the separate search-dashboard observations are recorded next.
4. **https://filecompresser.com/sitemap.xml** has been submitted in the existing Google/Bing properties. The Google retry now shows **Success**, last read **21 November 2026**, with **26 discovered URLs**; the initial Couldn't fetch status is resolved. Bing also shows **Success**, last crawl **21 November 2026**, with **26 discovered URLs** and zero errors/warnings. A real Google homepage live inspection at **18:51 PKT** reported **URL is available to Google / Page can be indexed**, and the actual **Indexing requested** dialog confirmed the priority crawl request. At the 21 November inspection, the blog URL was discovered through the submitted sitemap but not yet indexed. Its actual Google live inspection at **18:58 PKT** reported **URL is available to Google / Page can be indexed**, with **one valid Breadcrumbs item**, and its Request indexing dialog was accepted. Successful sitemap fetching, eligibility and queued requests do not establish indexing or rankings.
5. Keep all Zoho MX/SPF/DKIM/DMARC and Google/Bing verification records published. No new hosting purchase or nameserver migration is needed. Normal domain registration/renewal continues with the registrar.

## 6. Daily content editing

1. Open **https://filecompresser.com/admin/index.html** and sign in with your existing authorized account.
2. Choose the collection from the table near the top. Use **Tool pages** for text below a tool; use **Information pages** for policy/contact/about or blog-index text. Brand-wide SEO defaults and the monitored support address belong in **Site identity and SEO defaults**.
3. For a new article, start in **Blog posts** with **Publish this post** off. Choose a clear title and URL filename before publishing; changing the title later does not require changing its existing URL. Complete the introduction, real publication date, reading time, SEO title/description and fallback illustration.
4. Add **Article content** blocks: Paragraph, Section heading (H2), Subheading (H3), Bullet list, Numbered list, Link, Uploaded image, Data table, Highlighted note or Illustration. The article title supplies the main heading. Keep one cell per column in each table row. Use an existing site path or a full HTTPS address for links. Text is escaped; these fields do not execute pasted HTML.
5. Use the image picker for an optional **Featured image** and inline **Uploaded image** blocks. Upload JPG/JPEG, PNG, WebP, GIF or AVIF images, at most **10 MiB each**. Add useful alternative text and any required caption. Use images you are entitled to publish. Clearing every optional featured-image field restores the fallback illustration; an inline image needs its image and alternative text.
6. Add truthful **Author attribution**, choosing Person or Organization as appropriate. Leave the whole group empty to use the configured site publisher. Categories and tags are optional; avoid invented expert credentials or review dates.
7. Review the draft, switch **Publish this post** on only when ready, then save. Tina commits to GitHub `main`; wait for the corresponding successful Cloudflare deployment, then inspect the public article, image, links, table and SEO output.

Saving a draft still commits its source. Drafts and archived posts are excluded from the exported website and sitemap, but the repository and committed history are public; they are not confidential storage.

The Tina media sync completed with branch `main`, public folder `public` and media root `uploads`. A real library **Insert → alternative text → Save** flow succeeded for `/uploads/pipeline.webp`, using the existing 65,252-byte pipeline asset supplied through GitHub. Its exact saved alternative text is “Folders pass through a green press inside a browser-shaped frame.” The blog save set the reviewed update date to `2026-11-21`, preserved the original publication date `2026-09-04` and changed the engine paragraph to about 21 MB. Save commit `716d06b7432f1ec5200f8a77b6c60b1747bc0a5e` passed main CI [44910849172](https://github.com/abdulhameed-developer/filecompresser/actions/runs/44910849172); its Cloudflare deployment `b65c94cd-62cf-49f6-8292-d51667dca6b4` succeeded at **18:56 PKT on 21 November** in **2m 47s**. A production browser check verified the published about-21-MB paragraph, 21 November update date, local featured image, exact alternative text and 1,200-pixel natural image width; the 65,252-byte asset also matched its reviewed SHA-256. Native file-chooser automation did not open, so this verifies existing-library selection and saving, not a successful native UI upload.

### Archive, change a URL or undo an edit

Use **Archive this post** to retain its source while removing it from public pages and the sitemap after the next successful build. Deleting posts in the CMS is disabled. Keep published URL filenames stable whenever possible.

For a necessary URL migration, coordinate the rename/archive, internal-link updates and **URL redirects** rule in one reviewed source change. For example, redirect `/blog/old-guide` to the final published `/blog/new-guide`. Use exact site paths; external destinations, redirect chains/loops, drafts and redirects from still-published pages are rejected. A redirect becomes live only after a successful deployment. Separate CMS saves can start intermediate builds, so review a published-URL migration before doing it as unrelated edits.

If a save succeeds but the website is unchanged, inspect the GitHub commit and Cloudflare build. Common causes are a failed build, a branch mismatch, missing build settings, draft/archive state or a stale tab. Keep the last successful site while resolving the build error.

To undo an accidental edit, review and revert its GitHub commit and let Cloudflare rebuild. A Cloudflare deployment rollback can restore an earlier site temporarily; reverting the source keeps the next build consistent.

## Costs and limits

Cloudflare Pages Free currently includes 500 builds per month, one concurrent build, up to 20,000 files and a 25 MiB per-file limit. Each editor save can trigger a build. Static requests do not require a paid application server; optional paid services and future plan changes have their own rules.

TinaCloud Free currently includes two users. The existing owner uses a seat; check the actual dashboard before inviting another person or enabling paid features. Your normal domain renewal remains separate. Check the providers' linked pricing/limits when changing plans rather than assuming allowances never change.

## Release evidence

The [release review](RELEASE-REVIEW.md) records the passed full/cold static CI runs, successful connected production deployment, Active SSL hostnames and hosted login/save-to-GitHub evidence. The public JPG save and applied index/follow/canonical settings are verified. Logout/re-entry, sitemap submission and Google live eligibility/indexing-request observations are now recorded. The complete corrected live run [45117263085](https://github.com/abdulhameed-developer/filecompresser/actions/runs/45117263085) passed all 16 HTTP checks, the 27-address route crawl, actual article/image assertions and three selected PNG/WAV/no-upload browser checks on 23 November. Genuine public-site screenshots and reports were retained with the run. Native chooser upload and reset-email delivery were not exercised. Search-engine indexing is not claimed. The [codec distribution record](CODEC-DISTRIBUTION.md) records the actual published matching source package. A passed source check, a published component prerelease and a working mailbox are separate from application deployment and acceptance.

## Official references

Reviewed on 21 November 2026; provider screen wording can change.

- [Cloudflare: deploy a static Next.js site](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)
- [Cloudflare: GitHub integration and repository access](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [Cloudflare: custom domains and nameservers](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare: redirect the Pages hostname to a custom domain](https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/)
- [Cloudflare: static requests and Functions routing](https://developers.cloudflare.com/pages/functions/routing/)
- [TinaCloud: production setup](https://tina.io/docs/tinacloud/overview)
- [TinaCloud: projects, allowed origins and tokens](https://tina.io/docs/tinacloud/dashboard/projects)
- [TinaCloud: admin/editor collaborators](https://tina.io/docs/tinacloud/dashboard/users)
- [TinaCMS CLI and build modes](https://tina.io/docs/cli-overview)
- [TinaCloud plans](https://tina.io/pricing)
- [TinaCloud authentication updates](https://tina.io/whats-new/tinacloud)
- [GitHub Pages usage restrictions](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
