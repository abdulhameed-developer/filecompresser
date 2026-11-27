# Adding links, bullets, numbered steps and safe HTML

The public site is built from content committed by Tina to GitHub. A save appears on the public site only after the matching Cloudflare production build succeeds. Check the commit and deployment before treating an unchanged page as a browser-cache issue.

## Homepage and tool pages

Open **Homepage** or **Tool pages**, then **Content sections**. Open an existing section or add one, enter its heading, and use **Content — paragraphs, lists, links or safe HTML**. This is a text field: type `- ` for a bullet or `1. ` for a numbered item; there is no separate bullet-toolbar button here. Use one item per line:

```text
Choose an image and [compare compression modes](/blog/choosing-a-compression-mode).

- Keep your original.
- Inspect transparent edges.

1. Select a file.
2. Open Settings.
3. Process and download.
```

Use blank lines between paragraphs. Lists use one item per line. Inline links accept site paths, section anchors or full HTTPS addresses. Encode spaces inside a URL as `%20`; literal spaces are rejected. For example, an existing uploaded image named `Team Photo.webp` can be linked as `/uploads/Team%20Photo.webp`.

Basic inline links support balanced URL parentheses, for example `[format](https://example.org/wiki/Test_(format))`. Labels are plain text and targets stay on one line; this is not a full CommonMark implementation and does not support link titles or backslash-escaped targets. Encode unmatched URL parentheses as `%28` / `%29`. Incomplete fragments, labels over 120 characters, destinations over 4,096 characters or nesting beyond 16 parenthesis pairs stay literal rather than creating a truncated link. A dedicated Link control or supported HTML link can handle addresses outside that basic inline form.

The section content field also accepts a restricted HTML fragment:

```html
<p>Try our <a href="/image-compressor">image compressor</a>.</p>
<ul><li>Keep the original.</li><li>Compare the output.</li></ul>
<ol><li>Select a file.</li><li>Download the result.</li></ol>
```

HTML link addresses follow the same space rule: `<a href="/uploads/Team%20Photo.webp">team photo</a>`. Use a real uploaded filename or published address; the example itself does not create an asset. Inline-link syntax inside an HTML `a` or `code` element remains literal, so it cannot create a nested link.

Supported tags: `p`, `br`, `strong`, `em`, `b`, `i`, `code`, `a`, `ul`, `ol`, `li`, `blockquote`. Close every non-void tag in order. The only supported attribute is a quoted `href` on `a`. Links may use a site path, HTTPS URL, or section anchor. Scripts, styles, event handlers, embedded forms, images, iframes and arbitrary attributes are rejected. Content becomes React elements; the renderer never injects raw HTML. Use ordinary text/Markdown for the introduction and FAQs.

## Blog articles

Under Article content, choose **Bullet list** or **Numbered list** and add individual items. Paragraphs, list items, table cells and highlighted notes support Markdown links. A separate **Link** block gives a prominent standalone link.

Choose **Safe HTML** for the same restricted HTML fragment above. The ordinary Paragraph block continues to display HTML-like text literally. This preserves older articles and makes intentional HTML explicit.

Featured images must be managed raster uploads with meaningful alternative text. Use the uploaded-image block for images rather than HTML. Heading blocks remain separate H2/H3 controls.

## Information pages

About, Contact and legal page sections provide paragraph items, bullet items and section links. Paragraphs and bullets support inline Markdown links. HTML remains literal text there. Use the native section fields to preserve each page's layout.

## Publishing checks

- Keep unfinished blog articles unpublished. Archived articles remain stored but disappear from public discovery after a successful build.
- Publication/updated dates use real `YYYY-MM-DD` dates; updated cannot precede publication.
- Canonicals follow the published filename and site origin automatically. Do not paste canonical tags into article HTML.
- Save, confirm Tina's GitHub commit, confirm Cloudflare's matching successful production deployment, then inspect the exact public URL.
- If validation fails, correct the named field. Do not bypass the deployment checks. Never paste credentials into content.

For a published, unarchived article, **Last updated cannot be earlier than Publication date**. The two date fields and the incoming Publish/Archive toggles share this check, so publishing a draft or restoring an archived article cannot bypass it. Last updated remains optional and clearable; drafts and archived articles can retain unfinished date ordering. Fourteen callback/reader parity cases passed for these rules, including valid dates, clearing and publication-state changes. These date callbacks have not been separately exercised in the hosted editor. The native isolated editor tested lists, HTML and links. The 26 November FAQ/link release verified its save → GitHub → Cloudflare → public-site chain. The new 27 November hosted-editor roundtrip also has independent public proof below. For future edits, still confirm the actual public answer rather than inferring delivery from the saved form.

The section, introduction/FAQ and article HTML/paragraph fields use the same validation module as the public content reader. Invalid HTML and unsafe Markdown links therefore receive field-level feedback in Tina before a save can become a failed hosting build. Ordinary article paragraphs still treat HTML-like text literally; use Safe HTML to render supported markup.

Dedicated **Helpful link**, article **Link**, optional **Author page**, and information-page link controls also validate addresses immediately using the public reader's URL rules. They accept `/site-path`, `#section-anchor` and full HTTPS addresses. Clear an optional URL to remove it; a partially completed optional link group still needs both its text and address. **Further reading** references retain their separate full HTTP(S)-address rule, so relative paths and section anchors are not accepted there. Credentials, executable schemes, protocol-relative addresses, encoded controls/backslashes and malformed escapes are rejected.

Field validation checks address syntax and safety; it does not fetch the destination or confirm that a page/section exists. Use a real published path and a matching section ID, then include the destination in the site's link/release checks.

In the verified 26 November release, the code and Tina schema lock were deployed together. On that date, the connected editor saved and reopened a real homepage FAQ/link correction, GitHub received its exact change, Cloudflare built it successfully, and the public answer, link and FAQ structured data were verified. Local callback tests do not establish every hosted template or date-validation scenario; the progress report keeps those boundaries explicit.

## Saving and publishing

For homepage/tool content, open **Content sections**, choose a section, and enter `- item`, `1. item` or `[link text](/page)` in **Content — paragraphs, lists, links or safe HTML**. Its help text now shows literal HTML examples. Blog articles have separate **Bullet list**, **Numbered list**, **Link** and **Safe HTML** blocks.

**Save** updates GitHub through Tina. The public site changes after Cloudflare's matching build succeeds; it is not an instant preview update. Historical verified builds took about four and five minutes, which is not a promise for the next build. A validation error disables Save; Save and Reset are also disabled when there are no unsaved changes. A failed hosting build keeps the previous working public release. Check the exact saved commit, its build status and the actual public answer before treating a change as published.

## Verified hosted-editor save — 27 November 2026

The Phase 2 code commit `417fcfb8215837d2307fa4c6af992de06d94f32c` passed GitHub CI run `45993057996` with 877 tests and the initial Cloudflare build `6e2b0b9c-58f8-47b0-93b9-310cea77e097`. The new hosted Tina editor was then used directly, rather than simulating a save locally.

Before editing, the existing numbered steps and bullet-benefit content matched the committed text exactly, with Save and Reset disabled. Only the existing quality FAQ answer was changed to explain Lossless PNG and Balanced JPG/WebP defaults. The real Save completed; after reload and reopen, the exact answer remained, its native label focused the answer field, and Save/Reset were disabled again.

Tina created commit `5fdf646b2b1465c150777e4872a020d4cbd2ac24`. Its semantic change is exactly `faq.4.a`; all content sections and the existing formats/WebM FAQ are preserved. The numbered and bullet bodies were inspected without changing them, so this is not a claim of a new hosted HTML/list save.

See [where the homepage bullets are entered](evidence/2026-11-27/screenshots/tina-bullets-live.png) and [the saved/reopened FAQ in the hosted editor](evidence/2026-11-27/screenshots/tina-saved-faq-live.png). These screenshots show Tina, not proof of the new answer on the public homepage.

The matching final Cloudflare deployment `3f5114e1-8094-4a07-9022-4a566e8feb0e`, from Tina commit `5fdf646b2b1465c150777e4872a020d4cbd2ac24`, succeeded. GitHub CI run `45993970761` also succeeded with 877 tests. On the public homepage, the expanded answer exactly matches the saved/committed text and the FAQ structured data; the three numbered steps and seven benefit bullets remain, and the observed DOM contains no analytics script sources. This completes the actual hosted Save → GitHub → Cloudflare → public-answer check. [Compact publishing evidence](evidence/2026-11-27/cms-publishing-roundtrip.json) records the identities, hashes and limits. Six isolated editor scenarios and these specific native controls do not certify every vendor field, every date rule or complete admin accessibility.
