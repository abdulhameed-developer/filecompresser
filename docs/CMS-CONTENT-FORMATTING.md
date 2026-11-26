# Adding links, bullets, numbered steps and safe HTML

The public site is built from content committed by Tina to GitHub. A save appears on the public site only after the matching Cloudflare production build succeeds. Check the commit and deployment before treating an unchanged page as a browser-cache issue.

## Homepage and tool pages

Open the Homepage or Tool pages collection. Add a Content section, enter its heading, and use its content field:

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

For a published, unarchived article, **Last updated cannot be earlier than Publication date**. The two date fields and the incoming Publish/Archive toggles share this check, so publishing a draft or restoring an archived article cannot bypass it. Last updated remains optional and clearable; drafts and archived articles can retain unfinished date ordering. Fourteen callback/reader parity cases passed for these rules, including valid dates, clearing and publication-state changes. These date callbacks have not been verified in the hosted editor; the native isolated editor test covered lists, HTML and links, and the connected save → GitHub → Cloudflare publishing chain remains unverified.

The section, introduction/FAQ and article HTML/paragraph fields use the same validation module as the public content reader. Invalid HTML and unsafe Markdown links therefore receive field-level feedback in Tina before a save can become a failed hosting build. Ordinary article paragraphs still treat HTML-like text literally; use Safe HTML to render supported markup.

Dedicated **Helpful link**, article **Link**, optional **Author page**, and information-page link controls also validate addresses immediately using the public reader's URL rules. They accept `/site-path`, `#section-anchor` and full HTTPS addresses. Clear an optional URL to remove it; a partially completed optional link group still needs both its text and address. **Further reading** references retain their separate full HTTP(S)-address rule, so relative paths and section anchors are not accepted there. Credentials, executable schemes, protocol-relative addresses, encoded controls/backslashes and malformed escapes are rejected.

Field validation checks address syntax and safety; it does not fetch the destination or confirm that a page/section exists. Use a real published path and a matching section ID, then include the destination in the site's link/release checks.

The new editor controls and public rendering are available after the code and Tina schema lock are deployed together. The final local CMS bundle and asset bootstrap passed; local callback tests do not establish the hosted editor's state. The connected hosted editor and publish workflow still require verification.
