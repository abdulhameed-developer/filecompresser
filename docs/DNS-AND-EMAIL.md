# Domain and email verification — 21 November 2026

## Observed registrar state

Hostinger's authenticated Domains page now shows **filecompresser.com Active**, with expiration21November2027. The earlier pending-registration owner form was completed; the current status is the authority. No purchase or renewal was made by this task.

The DNS/Nameservers page was inspected before any changes:

| Type | Name | Value | Priority | TTL(seconds) |
| --- | --- | --- | --- | --- |
| CNAME | www | filecompresser.com |0|300|
| A | @ |2.57.91.91|0|50|

Nameservers: `aster.dns-parking.com`, `helios.dns-parking.com`.

No MX, SPF, DKIM, DMARC or other TXT records were shown in this inventory. Do not infer future records from this snapshot; refresh it before migration, and preserve any records added later. The parked A record is not evidence that this application is deployed.

## Business email

The authenticated Hostinger Emails page offers paid business email plans and shows no active mailbox. No email plan or trial was purchased or activated. `info@filecompresser.com` is not a verified working mailbox and remains unpublished on the website.

Official Hostinger documentation describes limited30-day trials for selected domain offers, not a permanent free mailbox. The actual account screen has not shown an included offer. Do not enter a paid checkout or start an auto-renewing trial without explicit owner approval.

Zoho Mail's official free custom-domain mailbox is a potential alternative only if its truthful signup in the user's region offers the free plan. Its published free tier has data-center restrictions and lacks IMAP/POP/ActiveSync; regional eligibility and account verification remain to be checked. Cloudflare forwarding alone does not satisfy the requested full inbound/outbound mailbox.

Before publishing support details, provision a real mailbox, set sender name FileCompresser Support, obtain exact provider MX/SPF/DKIM values, configure a suitable DMARC policy, and verify inbound and outbound delivery plus received authentication headers. Do not invent provider-specific DNS targets or advertise forwarding as a mailbox.

## Confirmed service resources

TinaCloud project FileCompresser was created for the existing abdulhameed-developer/filecompresser repository. Its public client ID is `e80a2716-65ae-4124-a250-85a481310f9a`. Allowed origins are localhost:3000, https://filecompresser.com and https://www.filecompresser.com. No content token or other credential is recorded here.

Cloudflare account sign-in is verified. A Pages project, DNS migration, deployed website, HTTPS on the custom hostname and successful CMS publishing are not implied by account sign-in or creation of the Tina project.

## References

- https://www.hostinger.com/support/4625828-parameters-and-limits-of-hostinger-email/
- https://www.hostinger.com/support/how-the-hostinger-mail-trial-works/
- https://www.zoho.com/mail/compare/overview.html
- https://www.zoho.com/mail/zohomail-pricing.html
- https://developers.cloudflare.com/email-service/
