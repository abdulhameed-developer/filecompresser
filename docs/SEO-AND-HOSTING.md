# FileCompresser: admin, publishing and domain setup

This project is prepared for **GitHub for the source, Cloudflare Pages Free for the website, and TinaCloud Free for the content editor and its accounts**. The chosen public domain is **filecompresser.com**. You do not need to buy a shared-hosting package or rent a server. Your domain registration and renewal remain separate.

The code integration does not create accounts, authorize GitHub access, publish the site, send password-reset emails, or change your domain's DNS. Complete the account steps below to activate production editing.

## What you will be able to edit

- Create and update blog posts, their URL slugs, descriptions, dates, existing article illustrations and content.
- Manage the text that appears below each compression/conversion tool.
- Set page SEO titles and descriptions, headings and FAQs where provided in the editor.
- Update the editable homepage content.
- Give your SEO person their own editor account instead of sharing your GitHub password.

The public site renders saved content into HTML during a build. Search engines can read the content without opening the editor. New content goes live after a successful rebuild; saving in the editor is not an instant change to an already deployed page.

## 1. Put the prepared source on GitHub

Use your existing repository:

`https://github.com/abdulhameed-developer/filecompresser`

Keep the latest working files and their existing changes. Review the prepared changes before merging/pushing them into the production `main` branch. Do not replace the repository with an older download.

Commit the source, `content/`, `tina/config.js` and `tina/collections.mjs`, the lockfile, and `tina/tina-lock.json` when generated. Do not commit `.env`, `.env.local`, passwords, `node_modules`, `.next`, `out`, or generated CMS bundles. GitHub stores the code; it is not the hosting service in this setup. You do not need to enable GitHub Pages.

If you use GitHub Desktop, open the repository, review Changes, commit the intended files, then Push origin. If a prepared copy has no Git history, copy its reviewed project files into your existing checkout; preserve that checkout's `.git` folder. Do not upload a ZIP into GitHub as the website source.

## 2. Create your TinaCloud account and project

1. Open [app.tina.io](https://app.tina.io/) and create/sign in to your own account. Use an email address you control. Complete email verification or your selected sign-in provider's flow.
2. Create a project and connect the **existing GitHub repository** above. Authorize access only to the repository you intend to edit where the permission screen offers repository selection. TinaCloud needs permission to commit your content changes.
3. Select the production branch `main`. Keep `tina/` at the repository root; leave the project's optional “Path To Tina” field empty for this layout.
4. In project settings, add the exact allowed site origins. Initially include `http://localhost:3000` for local connected testing and your actual `https://YOUR-PROJECT.pages.dev` address once Cloudflare provides it. Add `https://filecompresser.com` when ready. Include `https://www.filecompresser.com` only if you will use that address too. Origins contain no `/admin` path.
5. Copy the project's **Client ID** from its overview and a **Content / read-only token** from its Tokens section. Keep token values in local or hosting environment settings, never in a public source file or screenshot.
6. Let TinaCloud finish indexing `main`. If it cannot index the project, first confirm that the Tina configuration and generated `tina/tina-lock.json` have reached that branch.

TinaCloud's Free plan currently includes two users. Use one account for yourself and the second for your SEO person. Check the provider's current dashboard for any plan changes before adding more users or paid features.

### Give your SEO person access

In the project's Collaborators area, add/invite their own email as **Editor**. Keep yourself as **Admin**. Admins manage project configuration and collaborators; editors can edit the project's content. An editor does not need a GitHub account.

With this simple `main`-branch publishing setup, editor saves commit directly to the production branch and can become public after Cloudflare builds successfully. Only grant this role to someone you trust to publish content. A separate approval workflow is not configured by this setup.

### Login, logout and forgotten passwords

On the deployed site, open `/admin/index.html` and use the CMS sign-in button. Production access is checked by TinaCloud against the project's authorized users. Loading the public admin page alone does not give anyone permission to edit your repository.

For an email/password account, use TinaCloud's hosted password-recovery option from its sign-in flow and follow the email it sends. Set the new password yourself in that provider's screen. For a GitHub/provider sign-in account, recover access through that provider instead. The site does not hold an independent admin password, recovery database, or reset-email server. Exact labels may vary as TinaCloud updates its authentication screens.

If your recovery email does not arrive, check spam, confirm the account's original sign-in method, then use [Tina support](https://tina.io/docs/support). This code cannot reset a third-party account or bypass its authentication. Use the editor's logout control when finished, especially on shared devices.

## 3. Check local editing

Use Node.js 22.12 or later within the Node 22 series. From the project directory:

```sh
npm ci
npm run setup:cms
npm run dev:cms
```

Open `http://localhost:3000/admin/index.html`. If another project is already running on port 3000, stop that old development server yourself or use a deliberately configured alternate port and origin.

`setup:cms` is a one-time dependency-install step. It installs the pinned TinaCMS editor and CLI and updates `package.json` and `package-lock.json`. After `dev:cms` generates the schema lock, commit and push those two package files together with `tina/tina-lock.json` to `main`. The production CMS build requires these installed dependencies and the generated schema lock to be present in GitHub. Later installations can use `npm ci` from that updated lockfile.

In the editor, check the **Blog posts**, **Tool pages** and **Homepage** collections. Test an edit locally, inspect the affected public page, then restore any test-only changes before publishing.

The local CMS server edits project files and intentionally does not require a production login. Keep it on your own development computer; do not expose its ports through a tunnel or use local mode as your public hosting solution. A local edit changes the local copy only until you commit and push it.

For a local build of the website without activating the hosted CMS, run `npm run build`. To build the production-connected CMS too, provide the Tina variables below and run `npm run build:cms`. Local configuration is normally read from `.env` by the Tina CLI; do not assume `.env.local` alone will configure the CLI.

## 4. Create the free Cloudflare Pages website

1. Finish the one-time local CMS installation and push the updated package files and `tina/tina-lock.json` described above. Then create/sign in to your account at [dash.cloudflare.com](https://dash.cloudflare.com/).
2. Open **Workers & Pages → Create application → Pages → Import an existing Git repository**. Choose the Git-connected Pages option, not a Worker application or a one-time ZIP upload.
3. Connect GitHub and select `abdulhameed-developer/filecompresser`. When GitHub offers repository selection, select only this repository.
4. Enter these build settings. The custom build command below replaces the framework preset's default command.

| Setting | Value |
| --- | --- |
| Framework preset | Next.js (Static HTML Export), or None with the values below |
| Production branch | `main` |
| Root directory | Repository root; leave empty |
| Build command | `npm run deploy:check` |
| Build output directory | `out` |
| Node version | `22` using `NODE_VERSION` |

5. Add these **production build environment variables** before the first build:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NEXT_PUBLIC_TINA_CLIENT_ID` | Client ID from your TinaCloud project |
| `TINA_TOKEN` | The project's Content/read-only token, stored as an encrypted Production Secret |
| `NEXT_PUBLIC_TINA_BRANCH` | `main` |
| `NEXT_PUBLIC_SITE_URL` | `https://filecompresser.com` |
| `NEXT_PUBLIC_ENABLE_INDEXING` | `false` for the initial review; change to `true` only when launching the public domain |

The `NEXT_PUBLIC_` values are public configuration. Never put a GitHub personal access token or an admin password in one of them. In Cloudflare, add `TINA_TOKEN` through the existing project's **Settings → Variables and secrets**, choose **Secret**, and select the Production environment. Do not put it in an ordinary Text row. It is a CMS content-read token, not a write-enabled GitHub credential. The deployment checks scan every exported file for the active token and stop publication if it is found.

6. Deploy and wait for a successful build. Cloudflare gives you a `https://YOUR-PROJECT.pages.dev` address. Add that exact origin to the allowed URLs in TinaCloud if it was not known earlier.
7. Visit the public homepage, a tool, a blog article and `/admin/index.html`. Try image compression and a media conversion. A successful build does not replace testing those tools in the browser.

The build produces static engine assets. The large media engine is divided into smaller files and reconstructed inside the visitor's browser, so each deployed asset stays below Cloudflare Pages' 25 MiB file limit. Do not revert to uploading the original oversized WASM as one Pages asset.

For preview branches, use `NEXT_PUBLIC_ENABLE_INDEXING=false` and a matching preview origin. Do not automatically give untrusted preview branches the production token. If CMS preview editing is unnecessary, a basic website preview can build with `npm run build` instead.

## 5. Connect the domain you already bought

Buying a domain does not require buying the registrar's hosting package. Keep the domain registration where you purchased it.

### Recommended: use the root domain with Cloudflare DNS

For `https://filecompresser.com`:

1. In Cloudflare, add `filecompresser.com` as a website/zone and choose the **Free** plan.
2. Review the imported DNS records. Preserve any existing email records, including MX and relevant TXT records, before changing nameservers.
3. Cloudflare shows two assigned nameservers. In the account where you bought the domain, open the domain's nameserver settings and replace the registrar's current nameservers with those **exact two values**. This changes DNS management; it does not transfer or repurchase the domain.
4. Wait for Cloudflare to mark the zone active. Propagation can take time. Follow its instructions if the registrar has an existing DNSSEC configuration.
5. Open **Workers & Pages → your Pages project → Custom domains → Set up a domain**. Enter `filecompresser.com`. Cloudflare creates the appropriate DNS record when the zone is active in the same account.
6. Add `www.filecompresser.com` through the same Custom domains screen if needed. Use `https://filecompresser.com` as the primary address and a permanent redirect from `www` to avoid two public copies.
7. Wait for the custom hostname and HTTPS certificate to become active. Use the valid HTTPS URL; do not click through a certificate warning.

### Alternative: keep the current DNS provider and use `www`

You can use `www.filecompresser.com` without moving the domain's nameservers. First add that exact hostname in the Pages project's **Custom domains** screen. Then add a DNS record at the current provider:

| Type | Name/host | Target |
| --- | --- | --- |
| CNAME | `www` | `YOUR-PROJECT.pages.dev` |

Use the actual project hostname Cloudflare assigned, without `https://`. A root/apex domain on Pages requires the Cloudflare-zone/nameserver approach above. If you choose this alternative, also change `NEXT_PUBLIC_SITE_URL` to `https://www.filecompresser.com` and allow that origin in TinaCloud. Any redirect from the root domain to `www` must be configured using a service that also supports HTTPS for the root. Adding a CNAME without first attaching the hostname to the Pages project is insufficient.

### Update SEO and login after the domain activates

1. Set production `NEXT_PUBLIC_SITE_URL` to `https://filecompresser.com` for the recommended root-domain setup.
2. Set production `NEXT_PUBLIC_ENABLE_INDEXING=true` once you are ready for public indexing.
3. In TinaCloud, allow that exact primary origin and any additional address on which you intend to open the editor.
4. Trigger a fresh production build. These settings are read at build time; changing the dashboard value alone does not rewrite an existing deployment.
5. Check `/robots.txt`, `/sitemap.xml`, a tool page's canonical URL and a blog article's title/description. They should identify the public primary origin. Submit the sitemap in your own [Google Search Console](https://search.google.com/search-console/about) property after verifying domain ownership. Submission does not guarantee indexing or ranking.
6. If the `pages.dev` copy remains reachable, optionally use Cloudflare's documented permanent redirect to the custom domain. Test it before enabling so it does not interfere with your previews or login origin.

## 6. Daily editing and publishing

1. Open your primary domain's `/admin/index.html` address.
2. Sign in with your own authorized TinaCloud account.
3. Choose **Tool pages** for content below a tool, **Blog posts** for articles, or **Homepage** for the editable home content. Use a clear title, useful description, meaningful headings, a suitable existing illustration and original, accurate content. Complete any required fields shown by the editor.
4. Review the content and save. The CMS writes it to GitHub's `main` branch.
5. Cloudflare automatically starts a production build from that commit. Wait for success, then open the public page in a new tab and check it.

An unpublished/draft post should remain unpublished until it is ready. Changing an existing blog slug changes its address; plan an appropriate redirect rather than breaking an indexed URL. Content edits cannot guarantee SEO results, and a meta description may be rewritten by a search engine.

Draft and archived posts are excluded from the exported website and sitemap. The GitHub repository itself is public: committed draft source and its version history remain visible there. These states provide editorial publishing control, not confidential document storage.

If the editor reports a successful save but the website is unchanged, check the latest commit on GitHub and the latest Cloudflare Pages deployment. Common causes are a failed build, mismatched branch, missing environment variables, unpublished content, or an old browser tab. A content save and a public deployment are separate events.

To undo an accidental content edit, review and revert the corresponding GitHub commit, then let Cloudflare rebuild. Cloudflare also offers deployment rollbacks for a fast temporary recovery; reverting the source keeps the next build consistent.

## Costs and limits

Cloudflare Pages Free currently includes 500 builds per month, one concurrent build, up to 20,000 files and a 25 MiB maximum per file. Static page requests are free; optional Functions, storage, paid services and future plan changes have their own rules. This project does not require adding a paid server to publish static pages.

TinaCloud Free currently includes two users. Additional seats/features or exceeding a provider's current allowances may require a different plan. Keep using your registrar's normal domain renewal. Check the linked pricing pages when provisioning rather than assuming the free allowances can never change.

## Verified resources and release checks

The real FileCompresser TinaCloud project and Cloudflare Pages project have been created and connected to this repository. The requested CMS account is already the Active Owner; no duplicate invitation or role downgrade was needed. Cloudflare holds the read-only content token as an encrypted Production Secret. Domain DNS, the working business mailbox and Google/Bing ownership are verified; see `docs/DNS-AND-EMAIL.md`.

The new media engine and its matching source/notices/recipe package are published at the fixed `codec-2026-11-21.1` GitHub release and pinned by SHA-256 in `scripts/codec-release.json`. The package has passed actual source/archive/core integrity checks. Application browser acceptance, the installed Tina security checks, production domain/TLS and real CMS publishing still require their separate release evidence; publication of a codec package is not a website deployment.

## Official references

Reviewed on 21 November 2026; provider screen wording can change.

- [Cloudflare: deploy a static Next.js site](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)
- [Cloudflare: GitHub integration and repository access](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [Cloudflare: custom domains and nameservers](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Cloudflare: static requests and Functions routing](https://developers.cloudflare.com/pages/functions/routing/)
- [TinaCloud: production setup](https://tina.io/docs/tinacloud/overview)
- [TinaCloud: projects, allowed origins and tokens](https://tina.io/docs/tinacloud/dashboard/projects)
- [TinaCloud: admin/editor collaborators](https://tina.io/docs/tinacloud/dashboard/users)
- [TinaCMS CLI and build modes](https://tina.io/docs/cli-overview)
- [TinaCloud plans](https://tina.io/pricing)
- [TinaCloud authentication updates](https://tina.io/whats-new/tinacloud)
- [GitHub Pages usage restrictions](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
