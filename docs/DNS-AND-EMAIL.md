# Domain and email verification — 21 November 2026

## Registrar and authoritative DNS

Hostinger confirms **filecompresser.com Active**, expiring **21 November 2027**. No purchase, renewal, paid email plan or trial was activated during this setup.

The approved nameserver change has been applied at Hostinger:

- `devin.ns.cloudflare.com`
- `liz.ns.cloudflare.com`

Cloudflare now displays **Your domain is now protected by Cloudflare** on its free plan. The earlier Hostinger nameservers were `aster.dns-parking.com` and `helios.dns-parking.com`.

The original A record (`@ → 2.57.91.91`) and CNAME (`www → filecompresser.com`) were copied before migration and preserved. The A target is a parking service, not the FileCompresser application. Replace the web target only after the actual Pages deployment and release checks pass. Preserve all email records when changing the web target.

DNSSEC signing is enabled at Cloudflare. The matching registrar DS record has been saved at Hostinger: key tag 2371, algorithm 13 (ECDSA P-256/SHA-256), digest type 2 (SHA-256), digest `FE125D9CBA5DEAF521107CEC5CD344E6FB72685047213A19BD4090C3A9773998`. Cloudflare was still awaiting registrar propagation at the last dashboard check. A subsequent Google Public DNS lookup returned the correct root TXT records with authenticated-data (`AD: true`); keep both observations in the evidence until the dashboard catches up.

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

The GitHub connector has working read/write access. The reviewed source was published on `work/filecompresser-production-20261121` at initial commit `c043741ed7551a44a0818f1c2118cec3e96766c9` with verified tree `1a0ea2d192416657919ab6666de5c825f17c302a`; main has not been updated. Cloudflare's GitHub integration was authorized by the owner. The actual Pages project **filecompresser** now exists, with assigned hostname **filecompresser.pages.dev**, production branch `main` and output directory `out`. Its bootstrap command deliberately exits before publication, allowing the production token to be added as an encrypted secret. The final command will be `npm run deploy:check` after release checks pass. No website deployment is claimed here. Domain activation and a working mailbox do not establish application deployment, HTTPS correctness or successful CMS publishing.

## Search ownership

Google Search Console verified the **Domain property** `filecompresser.com` through its published DNS TXT record. The dashboard is accessible and shows initial data processing, not established rankings or indexing. Bing Webmaster Tools verified `https://filecompresser.com` through its DNS-only CNAME and opened the site's management dashboard. Keep both verification records published. Sitemap submission and public URL inspection will follow the actual website launch; they have not been claimed from the parked domain.

## References

- https://developers.cloudflare.com/fundamentals/manage-domains/add-site/
- https://developers.cloudflare.com/dns/dnssec/
- https://www.hostinger.com/support/3667267-how-to-use-dnssec-records-at-hostinger/
- https://www.zoho.com/mail/zohomail-pricing.html
- https://www.zoho.com/mail/help/adminconsole/cloudflare.html
- https://www.zoho.com/mail/help/adminconsole/dkim-configuration.html
- https://www.zoho.com/mail/help/adminconsole/dmarc-policy.html
