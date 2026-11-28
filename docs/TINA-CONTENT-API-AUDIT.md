# Tina hosted read API audit

28 November 2026 (Asia/Karachi). **Status: BLOCKED_TOKEN_UNAVAILABLE.** No hosted API parity pass is claimed. The existing local configuration was checked by credential presence only; no credential value, browser session, hidden editor state or authentication request was read or copied. No key, scope, account, Save, reindex or cloud mutation was created.

## Supported access and the actual project

Tina's [Content Delivery documentation](https://tina.io/docs/reference/content-api/content-delivery) states: “Requests can be made to the TinaCMS Content API with Read Only Tokens.” It documents a versioned content URL and an X-API-KEY request header. The [configuration reference](https://tina.io/docs/reference/config) identifies TINA_TOKEN as a site-build read-only token, separate from public admin variables. The [project documentation](https://tina.io/docs/tinacloud/dashboard/projects) distinguishes Content read-only tokens from Search tokens with search-index write access. No documented anonymous replacement was established, and no unauthenticated endpoint probe was attempted.

The configured project is FileCompresser, repository abdulhameed-developer/filecompresser, branch main. The checked-out config references NEXT_PUBLIC_TINA_CLIENT_ID and TINA_TOKEN; it does not hardcode an audit credential. The public project identifier is already in .env.example. The installed GraphQL package is 4.1.0, yielding this documented endpoint shape:

~~~text
https://content.tinajs.io/4.1/content/<configured-public-client-id>/github/main
~~~

The generated local client currently targets localhost:4001/graphql. Its apparent token literal was classified internally as a noncredential sentinel, not a usable cloud credential. Its value was neither printed nor placed in evidence.

| Existing location checked | Presence result |
|---|---|
| Current process TINA_TOKEN | Absent. |
| Repository .env / .env.local | Neither exists in this checkout. |
| Repository .env.example | TINA_TOKEN is empty. |
| Current generated SDK | Local endpoint and known noncredential sentinel. |
| Browser credentials/session or other process environments | Not inspected. |
| New token / new auth scope | Not created. |
| Hosted Content API requests | Zero. |

These findings block this read-only audit shortcut. They do not establish that a local read token is required by this Git-built public site, or explain historical Cloudflare build failures. Visitor pages use exported Git content. Save, hosted indexing, deployment and rendered-content parity remain separately evidenced stages.

## Native project and branch configuration

Root separately opened the actual TinaCloud project configuration in the built-in browser. The linked repository is abdulhameed-developer/filecompresser, separate content repository is off, and main is listed as indexed 3 hours ago in that observed UI. The one unindexed branch warning belongs to the old work/codec-source-rebuild-20261121 branch, not main. The read-only modal was closed without settings changes, indexing action or new key.

This establishes the intended repository and the presence of a main-branch index. It is not an exact indexed commit, all-29-record field comparison, successful Save or new public-content pass. The warning is not misreported as a missing main index. Raw native configuration snapshots remain private; their hashes and scope are recorded in the public evidence.

## Exact documented query route

The [Content API overview](https://tina.io/docs/features/data-fetching) supports generated collection queries. The [custom-query guide](https://tina.io/docs/data-fetching/custom-queries) supports generated collection fragments or client.request. Installed SDK declarations confirm createClient accepts a URL, read token and generated queries; the request method takes a query and variables. Its actual request implementation sends the token as X-API-KEY, rather than in the URL.

The current generated schema has six collection queries: homepage, toolPage, managedPage, post, siteSettings and redirects. Each accepts relativePath. For example:

~~~graphql
query ReadJpg {
  toolPage(relativePath: "jpg-compressor.json") {
    _sys { path relativePath }
    heading
    introduction
    sections { heading body }
    links { label href }
    faqMode
    faq { q a }
    seoTitle
    seoDescription
    relatedTools
  }
}
~~~

An offline prepared query includes **all 29 known records**, their typed generated fragments, nested article union fields and source identity metadata. It validates against the actual generated schema with **zero GraphQL validation errors**. Validation is offline and is not a successful API response. The local prepared artifacts are .qa-results/phase3/cms/hosted-typed-read-query.graphql and hosted-read-alias-map.json.

The schema also contains _values. The [single-document reference](https://tina.io/docs/graphql/queries/get-document) says this field is “used internally in edit mode and is not for external use.” Its availability in generated types is not treated as a stable external raw-JSON contract. No hidden _values object was obtained from a browser. Typed query results, if authorized access becomes available later, must distinguish null optional fields and __typename template identities from raw JSON absence/_template values; they must not silently remove meaningful differences to obtain a pass.

## Independent native UI fallback

A private, read-only matcher is prepared at .qa-results/phase3/cms/native-ui-field-matcher.mjs. It compares actual visible, mounted native controls with the earlier source manifest. It never connects to a browser, reads editor internals or sends a request. It requires the correct document URL, branch evidence, capture timestamp and evidence file. Where only native project configuration proves main and the editor exposes no branch label, field coverage is reported separately with a branch qualification; direct editor-branch proof is not claimed. Text is exact except normal browser line-ending representation. Explicit enum labels can map to their declared stored values. Contradictory captures remain failures.

The helper can parse named single-line controls in native accessibility text; other controls require actual structured visible-control observations. A confirmed mounted/loaded empty list can establish an empty array from its actual visible row count; unmounted or loading is not treated as empty. Template identifiers can be compared through declared labels only when the actual visible block type was observed, without a hidden _template input. A collapsed, hidden, unnamed, unsupported or unmounted field remains NOT_OBSERVED. Page headings, serialized state and copied expected values are not observations. The 29-record source manifest contains 1,238 raw leaf values; none is marked verified merely because that manifest exists.

~~~sh
node .qa-results/phase3/cms/native-ui-field-matcher.mjs \
  .qa-results/phase3/cms/expected-fields-release.json \
  .qa-results/phase3/cms/actual-native-ui-captures.json \
  .qa-results/phase3/cms/native-ui-field-report.json
~~~

A separate private expected navigation plan covers all 29 records, 551 root/nested views and 206 lists, representing all 1,238 raw leaves. It includes object-group labels, list paths/counts, parent views and raw technical versus human-facing fields. Sortable-row delete-button attributes are identity hints for their enclosing row only and must never be clicked. All hints remain unobserved until root grounds them in fresh DOM; no UI navigation occurred in generating the plan.

The final committed expected manifest must be regenerated before this comparison. Actual captures must come from the mounted editor UI. The output refuses to overwrite a historical report and reports matches, failures and unobserved fields separately. **Nineteen synthetic controls pass**, covering stale values, wrong document/branch, hidden and unmounted data, contradictory captures, typed booleans, named AX controls, commas, line endings and qualified project-only branch evidence. This validates the matcher; it is not hosted field evidence. No hosted comparison was run by this helper in the present audit.

The [compact evidence](evidence/2026-11-28/tina-content-api-audit.json) records presence booleans, supported query shape, source references, validation and limitations. The [CMS/Git/build/public audit](CMS-LIVE-CONTENT-AUDIT.md) covers independently checked rendered content. The native editor remains the place to test actual editing, validation, Save, focus and recovery behavior.
