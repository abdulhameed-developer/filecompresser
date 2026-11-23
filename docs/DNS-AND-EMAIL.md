# Domain and email verification — setup 21 November 2026

Production application checks were repeated successfully on **23 November 2026 at 10:22 PKT**; the mailbox/DNS/account setup observations below retain their original dates.

## Registrar and authoritative DNS

Hostinger confirms **filecompresser.com Active**, expiring **21 November 2027**. No purchase, renewal, paid email plan or trial was activated during this setup.

The approved nameserver change has been applied at Hostinger:

- `devin.ns.cloudflare.com`
- `liz.ns.cloudflare.com`

Cloudflare now displays **Your domain is now protected by Cloudflare** on its free plan. The earlier Hostinger nameservers were `aster.dns-parking.com` and `helios.dns-parking.com`.

The original A record (`@ → 2.57.91.91`) and CNAME (`www → filecompresser.com`) were copied before migration; the original A target was registrar parking. That parking description is historical. The Pages custom hostnames **filecompresser.com** and **www.filecompresser.com** now both show **Active SSL**, and root HTTPS serves the actual FileCompresser website. Preserve all email and search-verification records during future web DNS changes.

DNSSEC signing is enabled at Cloudflare. The matching registrar DS record has been saved at Hostinger: key tag 2371, algorithm 13 (ECDSA P-256/SHA-256), digest type 2 (SHA-256), digest `FE125D9CBA5DEAF521107CEC5CD344E6FB72685047213A19BD4090C3A9773998`. The subsequent Cloudflare DNS Settings check now confirms **“Success! filecompresser.com is protected with DNSSEC.”** A Google Public DNS lookup also returned the correct root TXT records with authenticated-data (`AD: true`). The earlier propagation-pending badge is historical; DNSSEC activation is confirmed.

## Working business mailbox

The authenticated Zoho Admin Console confirms **Mail Free**, five available user licences and one active user: **info@filecompresser.com**. Webmail is https://mail.zoho.com/. The outgoing display name is **FileCompresser Support**. Zoho verified domain ownership and all required MX, SPF and DKIM records. The free plan is a real mailbox; it does not include IMAP/POP/ActiveSync.

An external Gmail message was delivered to this inbox, and a reply from the business address was delivered to the owner's connected Gmail inbox. After DNS propagation, a further outgoing message on **21 November 2026 at 14:23 PKT** reached that Gmail inbox with **SPF pass, aligned DKIM pass (`fc2026`, 2048 bits), and DMARC pass with `p=REJECT`** in Gmail's actual `Authentication-Results`. The earlier temporary SPF `none` result has therefore been resolved by a received-message check, rather than inferred from the provider's DNS verification.

| Type | Host | Target/value | Priority | TTL |
| --- | --- | --- | --- | --- |
| MX | @ | mx.zoho.com |10|300 seconds|
| MX | @ | mx2.zoho.com |20|300 seconds|
| MX | @ | mx3.zoho.com |50|300 seconds|
| TXT | @ | v=spf1 include:zohomail.com ~all |—|300 seconds|
| TXT | @ | zoho-verification=zb63292129.zmverify.zoho.com |—|Auto|
| TXT | fc2026._domainkey | Zoho-generated 2048-bit RSA public key |—|Auto|
| TXT | zmail._domainkey | Original verified 1024-bit RSA public key, retained during rotation |—|300 seconds|
| TXT | _dmarc | v=DMARC1; p=reject; adkim=r; aspf=r |—|300 seconds|
| TXT | @ | Google-generated domain ownership verification value |—|Auto|
| CNAME | Bing-generated verification host | verify.bing.com |—|Auto, DNS only|

The `fc2026` selector is verified and is now the primary DKIM signing selector. Both public keys remain published. DMARC enforces `p=reject`; Zoho is the only configured sender. The subsequent real outgoing test passed SPF, DKIM and DMARC after enforcement. Do not create duplicate SPF or DMARC policies, or add reporting destinations or forwarding services without a clear operational need.

Passwords, recovery codes and private signing keys are not stored in this repository. Account sign-in/recovery and MFA are managed by Zoho. Do not disable MFA or change the owner's password as part of website maintenance.

## CMS and hosting resources

TinaCloud project **FileCompresser** is connected to `abdulhameed-developer/filecompresser`. Its public client ID is `e80a2716-65ae-4124-a250-85a481310f9a`. Allowed origins are `http://localhost:3000`, `https://filecompresser.com` and `https://www.filecompresser.com`. The requested CMS account is already its **Active Owner**; no duplicate invitation or role downgrade was made. The Content/read-only token is saved in the Pages project's **Production** environment as an encrypted **Secret** named `TINA_TOKEN`. No content token or other credential is recorded here. Public preview origins have not been granted CMS authentication access.

The reviewed source and all three reproduced CMS package/schema locks reached `main` through PR 1 at merge commit `8b1a9439cf1d1f981f169691d280794173e255ac`. The Pages project **filecompresser** uses production branch `main`, output directory `out` and build command `npm run deploy:check`; automatic production builds are enabled and non-production preview branches are set to none. Cloudflare production deployment **ac6226f3-0be4-4eb5-8243-de37cc82cd5d** succeeded for that merge commit. Its build passed 436 tests, connected TinaCloud schema/index checks and the private-token export scan. The encrypted token value is not recorded here.

Hosted Tina login worked on the primary domain and loaded all 13 tool documents. An authorized JPG heading save created GitHub commit `91789f48430fe0dbd091fe011d6e7912a6c31392`; main-branch CI run [44908685680](https://github.com/abdulhameed-developer/filecompresser/actions/runs/44908685680) passed, and the public [JPG page](https://filecompresser.com/jpg-compressor) now shows **“Keep a copy of your original JPG.”** Cloudflare deployment `d1c76902-1c22-4fe2-9041-ea48d56757e2` succeeded for the JPG save. Hosted logout showed **Log In**, and existing-SSO sign-in returned the six-collection dashboard. After Email → **Continue**, the actual hosted form exposes **Reset password** and Password. Normal GitHub sign-in restored the FileCompresser project dashboard. No reset email was issued, password changed or new credential entered.

The production `NEXT_PUBLIC_ENABLE_INDEXING=true` value is saved and applied. The inspected public page has **index, follow** robots directives and a canonical on **https://filecompresser.com**. Search-engine indexing is not implied by these settings.

Bulk Redirect rule `fe003ec0743f42ad995d0b8ba2168f8b` is **Enabled** with list `8f839775e5ab458d8b6f1cbde1623307`: exact `www.filecompresser.com` and `filecompresser.pages.dev` sources use 301 redirects to the HTTPS root, preserving query strings and paths, with Include subdomains false. Live HTTP checks verified the tested 301 destinations and path/query preservation from HTTP root, HTTPS `www` and the production Pages hostname.

Tina media sync completed for branch `main`, public folder `public`, media root `uploads`. The actual library Insert/alternative-text/Save flow selected `/uploads/pipeline.webp` from an existing 65,252-byte pipeline asset supplied through GitHub. Hosted blog save `716d06b7432f1ec5200f8a77b6c60b1747bc0a5e` passed CI [44910849172](https://github.com/abdulhameed-developer/filecompresser/actions/runs/44910849172); its Cloudflare deployment `b65c94cd-62cf-49f6-8292-d51667dca6b4` succeeded at **18:56 PKT on 21 November** in **2m 47s**. The live browser check verified the published about-21-MB copy, 21 November update date, local image, exact alternative text and 1,200-pixel natural image width; its 65,252 bytes matched the reviewed SHA-256. Native file-chooser automation did not open; no native UI-upload success is claimed. The complete corrected production run [45117263085](https://github.com/abdulhameed-developer/filecompresser/actions/runs/45117263085) passed on **23 November 2026 at 10:22 PKT**: 16 HTTP checks, 27 public addresses, actual article/image assertions and all three selected PNG/WAV/no-upload browser checks. The business mailto destination was verified in the browser. This does not repeat or change the original mailbox delivery test.

## Search ownership

Google Search Console verified the **Domain property** `filecompresser.com` through its published DNS TXT record. The dashboard is accessible and shows initial data processing, not established rankings or indexing. Bing Webmaster Tools verified `https://filecompresser.com` through its DNS-only CNAME and opened the site's management dashboard. Keep both verification records published. The live **https://filecompresser.com/sitemap.xml** was verified in the browser with **26 URLs**. The retried Google submission now shows **Sitemap / Success**, last read **21 November 2026**, with **26 discovered URLs**; the initial Couldn't fetch state is resolved. Actual Google live inspection of the homepage at **18:51 PKT** reported **URL is available to Google / Page can be indexed**; the actual **Indexing requested** dialog confirmed the priority crawl request. Bing's sitemap row also shows **Success**, last crawl **21 November 2026**, with **26 discovered URLs**, zero errors and zero warnings; its overview reports one known sitemap and 26 total URLs. At the 21 November inspection, the blog URL was discovered through the submitted sitemap but not yet indexed. Its actual Google live inspection at **18:58 PKT** reported **URL is available to Google / Page can be indexed**, with **one valid Breadcrumbs item**, and the Request indexing dialog was accepted. These fetched-sitemap/eligibility/queue results are not proof of completed search-engine indexing or rankings.

## References

- https://developers.cloudflare.com/fundamentals/manage-domains/add-site/
- https://developers.cloudflare.com/dns/dnssec/
- https://www.hostinger.com/support/3667267-how-to-use-dnssec-records-at-hostinger/
- https://www.zoho.com/mail/zohomail-pricing.html
- https://www.zoho.com/mail/help/adminconsole/cloudflare.html
- https://www.zoho.com/mail/help/adminconsole/dkim-configuration.html
- https://www.zoho.com/mail/help/adminconsole/dmarc-policy.html
