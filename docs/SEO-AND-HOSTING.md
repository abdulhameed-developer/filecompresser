# FileCompresser: admin, publishing and domain setup

The setup uses **GitHub for source and content, Cloudflare Pages Free for the static website, and TinaCloud for editor accounts**. The chosen primary address is **https://filecompresser.com**. You do not need to buy shared hosting or rent an application server. Domain registration and renewal remain separate.

## Existing setup and remaining launch work

The repository, TinaCloud **FileCompresser** project and Cloudflare Pages **filecompresser** project already exist and are connected. Your requested CMS account is already **Active Owner**. Domain DNS/DNSSEC, the working **info@filecompresser.com** mailbox and Google/Bing ownership are verified. Keep these existing resources; no duplicate project, account invitation or role downgrade is needed. [DNS and email](DNS-AND-EMAIL.md) records the actual setup evidence.

**The website is not yet deployed.** Cloudflare already has `npm run deploy:check` configured, but production `main` still contains the older source. The successful CMS installation's package files/schema lock must be preserved in GitHub and validated before production `main` changes. The complete release pipeline, real browser media/security acceptance, custom-domain/TLS activation and authenticated CMS publishing remain pending. The published source-paired codec package is a component release, not a website launch.

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

Use the existing repository, [abdulhameed-developer/filecompresser](https://github.com/abdulhameed-developer/filecompresser). Keep the latest reviewed files and existing Git history. The prepared work is reviewed before updating production `main`; do not replace it with an older Downloads copy.

The first CMS installation updates `package.json` and `package-lock.json`; its first schema generation produces `tina/tina-lock.json`. Publish those actual generated files together with the source and content, then validate that final source. A temporary CI installation does not commit those files automatically.

Commit project source, `content/`, Tina configuration and the required lockfiles. Keep `.env`, `.env.local`, passwords/tokens, `node_modules`, `.next`, `out` and generated admin/engine bundles out of Git. GitHub stores the code; Cloudflare hosts this deployment. GitHub Pages is not required.

## 2. Use the existing TinaCloud project and owner account

1. Sign in at [app.tina.io](https://app.tina.io/) using the account and sign-in method already used during setup. Open **FileCompresser**, connected to the existing repository.
2. Keep production branch `main`. Tina configuration is at the repository root, so the optional **Path To Tina** value stays empty.
3. The allowed origins currently include `http://localhost:3000`, `https://filecompresser.com` and `https://www.filecompresser.com`. Origins have no `/admin` path. Preview/`pages.dev` origins have not been given editor access. Add a separate exact origin only if editing there is intentionally required; otherwise use the primary custom domain for hosted login.
4. Use the existing project's public Client ID. Its Content/read-only token is already an encrypted Cloudflare **Production Secret** named `TINA_TOKEN`; keep the value out of source, screenshots and ordinary Text settings.
5. After the final configuration/schema lock reaches `main`, let TinaCloud finish indexing that branch. An indexing error must be resolved before hosted editing is accepted.

### Future access for a different SEO colleague

The requested account already owns the project; do not invite it again or downgrade it. If a **different person** later needs access, use their own email and the project's appropriate Editor role, subject to the plan's current seat allowance. Keep your own Owner access. An editor does not need your GitHub password.

This setup publishes from `main`: editor saves can become public after a successful Cloudflare build. Give publishing access only to trusted people. A separate editorial approval workflow is not configured.

### Login, logout and password recovery

After the custom domain is deployed and verified, open **https://filecompresser.com/admin/index.html** and use the CMS sign-in control with your existing authorized account. The public admin page does not give unauthenticated visitors permission to edit GitHub.

Use the same sign-in method as account creation. For an email/password account, use the recovery option offered by TinaCloud's hosted sign-in flow and complete it yourself through the recovery email. For provider-based sign-in, recover that provider account instead. The website stores no independent admin password and operates no reset-email server.

Check spam and the original sign-in method if recovery fails, then use [Tina support](https://tina.io/docs/support). Hosted login, logout, password recovery and a real editor save need their own account/browser evidence; this guide does not claim those checks have already occurred. Log out when finished on a shared device.

## 3. Local editing and the first installation

Use Node.js **22.12 or later within the Node 22 series**. From the project directory:

```sh
npm ci
npm run setup:cms
npm run dev:cms
```

`setup:cms` is the first-install step: it installs the pinned CMS/CLI and immediately applies/verifies the reviewed CMS security changes. Keep install scripts enabled. Once those dependencies and their lockfile are committed, later clean installations use `npm ci`.

Open **http://localhost:3000/admin/index.html**. If another project already uses port 3000, stop that old server or deliberately configure a different port and allowed origin. Local mode edits your local files without a production login. Keep its ports on your own computer; local edits reach GitHub only after a commit and push.

Check the collections in the table above. Make a temporary local content edit, inspect the affected page and restore test-only changes before publishing. Preserve the generated schema lock and package changes as described in step 1.

`npm run build` builds the website and prepared notices. `npm run build:cms` also generates the production-connected editor. **Cloudflare production uses `npm run deploy:check`**, which includes the connected CMS build and release gates. Never deploy a local-mode editor or bypass a failed gate by switching to a smaller build command. Tina CLI local configuration normally comes from `.env`; `.env.local` alone is not a substitute for the hosting variables.

## 4. Activate the existing Cloudflare Pages build

Open [dash.cloudflare.com](https://dash.cloudflare.com/), then **Workers & Pages → filecompresser**. Its GitHub connection, production branch `main`, assigned hostname **filecompresser.pages.dev** and output directory `out` already exist. Its confirmed build command is `npm run deploy:check`, with automatic production deployments from `main` enabled and non-production preview branches set to none. The earlier source remains on `main`, so there is no successful application deployment yet.

Keep these confirmed settings while the final dependency/schema locks and reviewed source complete release checks:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js (Static HTML Export), or None with the explicit values below |
| Production branch | `main` |
| Root directory | Repository root; leave empty |
| Build command | `npm run deploy:check` |
| Build output directory | `out` |
| Node version | `22` using `NODE_VERSION` |

Verify the **Production** variables before the first real build:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NEXT_PUBLIC_TINA_CLIENT_ID` | Public Client ID from the existing FileCompresser TinaCloud project |
| `TINA_TOKEN` | Existing Content/read-only token, stored as an encrypted Production Secret |
| `NEXT_PUBLIC_TINA_BRANCH` | `main` |
| `NEXT_PUBLIC_SITE_URL` | `https://filecompresser.com` |
| `NEXT_PUBLIC_ENABLE_INDEXING` | `false` during initial review; `true` only for the approved public launch, followed by a rebuild |

The `NEXT_PUBLIC_` values are public configuration. Keep passwords, GitHub credentials and the content-read token out of them. The release packaging check scans every exported file for the active content token and fails if it appears.

Wait for the actual Pages build to succeed, then inspect public pages and tools. Test hosted CMS access on the allowed primary origin after domain/TLS activation. A successful build does not replace browser output, security or publishing checks.

The pinned new WebAssembly engine is **20,752,732 bytes**. It is split into content-addressed chunks below Pages' 25 MiB per-file limit and reconstructed/verified in the visitor's browser. Its matching source/notices/recipe package is published at the fixed codec release. Preserve the generated aggregate notices and source access.

Keep preview indexing off. Give untrusted preview branches no production token. A basic public-site preview can use `npm run build`; hosted editor acceptance must use the connected production editor and its approved origin.

## 5. Attach the domain and launch indexing

The domain already uses Cloudflare's Free DNS zone and its assigned nameservers. DNSSEC is confirmed active. The current root A record still points to the registrar's parking service; that is not the FileCompresser application. Keep the existing zone and registrar setup.

After the release passes and Pages has a successful application deployment:

1. Open **Workers & Pages → filecompresser → Custom domains → Set up a domain** and attach **filecompresser.com**. Let Pages create the appropriate web DNS target in the existing Cloudflare zone; replace the parked web target as part of that setup.
2. Attach **www.filecompresser.com** if it will be used, then configure a permanent redirect to **https://filecompresser.com**. Preserve paths and query strings.
3. Preserve all Zoho MX/SPF/DKIM/DMARC and Google/Bing verification records. These are separate from the application's web target.
4. Wait for the actual custom-domain status and HTTPS certificate to become active. Verify the homepage, representative tool/article URLs and `/admin/index.html` on the primary address.
5. To redirect the production **filecompresser.pages.dev** hostname, use Cloudflare's documented Bulk Redirect configuration. Match that exact hostname, preserve subpaths/path suffixes and query strings, and leave **Include subdomains off** so branch previews are unaffected. Test the redirects before relying on them.
6. Set production `NEXT_PUBLIC_SITE_URL=https://filecompresser.com` and, for launch, `NEXT_PUBLIC_ENABLE_INDEXING=true`. Trigger a fresh production build; dashboard changes alone do not rewrite an existing deployment.
7. Inspect `/robots.txt`, `/sitemap.xml`, canonical URLs, page titles/descriptions and the rendered content. Use the already verified Google Search Console Domain property and Bing site property to submit **https://filecompresser.com/sitemap.xml** and inspect representative URLs. Keep their verification DNS records. Sitemap submission does not guarantee indexing or rankings.

No paid registrar hosting package or nameserver migration is needed for these remaining steps. The domain registration/renewal continues with its registrar.

## 6. Daily content editing after launch

1. Open **https://filecompresser.com/admin/index.html** and sign in with your existing authorized account.
2. Choose the collection from the table near the top. Use **Tool pages** for text below a tool; use **Information pages** for policy/contact/about or blog-index text. Brand-wide SEO defaults and the monitored support address belong in **Site identity and SEO defaults**.
3. For a new article, start in **Blog posts** with **Publish this post** off. Choose a clear title and URL filename before publishing; changing the title later does not require changing its existing URL. Complete the introduction, real publication date, reading time, SEO title/description and fallback illustration.
4. Add **Article content** blocks: Paragraph, Section heading (H2), Subheading (H3), Bullet list, Numbered list, Link, Uploaded image, Data table, Highlighted note or Illustration. The article title supplies the main heading. Keep one cell per column in each table row. Use an existing site path or a full HTTPS address for links. Text is escaped; these fields do not execute pasted HTML.
5. Use the image picker for an optional **Featured image** and inline **Uploaded image** blocks. Upload JPG/JPEG, PNG, WebP, GIF or AVIF images, at most **10 MiB each**. Add useful alternative text and any required caption. Use images you are entitled to publish. Clearing every optional featured-image field restores the fallback illustration; an inline image needs its image and alternative text.
6. Add truthful **Author attribution**, choosing Person or Organization as appropriate. Leave the whole group empty to use the configured site publisher. Categories and tags are optional; avoid invented expert credentials or review dates.
7. Review the draft, switch **Publish this post** on only when ready, then save. Tina commits to GitHub `main`; wait for the corresponding successful Cloudflare deployment, then inspect the public article, image, links, table and SEO output.

Saving a draft still commits its source. Drafts and archived posts are excluded from the exported website and sitemap, but the repository and committed history are public; they are not confidential storage.

### Archive, change a URL or undo an edit

Use **Archive this post** to retain its source while removing it from public pages and the sitemap after the next successful build. Deleting posts in the CMS is disabled. Keep published URL filenames stable whenever possible.

For a necessary URL migration, coordinate the rename/archive, internal-link updates and **URL redirects** rule in one reviewed source change. For example, redirect `/blog/old-guide` to the final published `/blog/new-guide`. Use exact site paths; external destinations, redirect chains/loops, drafts and redirects from still-published pages are rejected. A redirect becomes live only after a successful deployment. Separate CMS saves can start intermediate builds, so review a published-URL migration before doing it as unrelated edits.

If a save succeeds but the website is unchanged, inspect the GitHub commit and Cloudflare build. Common causes are a failed build, a branch mismatch, missing build settings, draft/archive state or a stale tab. Keep the last successful site while resolving the build error.

To undo an accidental edit, review and revert its GitHub commit and let Cloudflare rebuild. A Cloudflare deployment rollback can restore an earlier site temporarily; reverting the source keeps the next build consistent.

## Costs and limits

Cloudflare Pages Free currently includes 500 builds per month, one concurrent build, up to 20,000 files and a 25 MiB per-file limit. Each editor save can trigger a build. Static requests do not require a paid application server; optional paid services and future plan changes have their own rules.

TinaCloud Free currently includes two users. The existing owner uses a seat; check the actual dashboard before inviting another person or enabling paid features. Your normal domain renewal remains separate. Check the providers' linked pricing/limits when changing plans rather than assuming allowances never change.

## Release evidence

The [release review](RELEASE-REVIEW.md) separates completed account/source steps from pending browser, installed-security, hosted-login, CMS-save, domain/TLS and live-site checks. The [codec distribution record](CODEC-DISTRIBUTION.md) records the actual published matching source package. A passed source check, a published component prerelease and a working mailbox are separate from application deployment and acceptance.

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
