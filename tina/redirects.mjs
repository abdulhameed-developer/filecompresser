export const redirectCollection = {
  name: 'redirects', label: 'URL redirects', path: 'content/redirects', format: 'json',
  match: { include: 'rules' },
  ui: { allowedActions: { create: false, delete: false, createNestedFolder: false } },
  fields: [{
    type: 'object', name: 'rules', label: 'Permanent redirects', list: true,
    description: 'After renaming or archiving an indexed article, add its old address and the final published replacement. Redirects become live after a successful hosting build. Do not redirect an address that still has a published page.',
    ui: { itemProps: item => ({ label: item?.from ? `${item.from} → ${item.to || 'choose destination'}` : 'New redirect' }) },
    fields: [
      {
        type: 'string', name: 'from', label: 'Old address', required: true,
        description: 'An exact path such as /blog/old-guide. No domain, trailing slash, query, fragment or wildcard.',
        ui: { validate(value) {
          if (typeof value !== 'string' || value.length > 240 || !/^\/(?:blog\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return 'Use an exact path such as /blog/old-guide or /old-guide.'
        } },
      },
      {
        type: 'string', name: 'to', label: 'Published destination', required: true,
        description: 'The final address of an existing published page or tool, such as /blog/new-guide or /image-compressor. External sites, drafts, redirect chains and loops are rejected by the build.',
        ui: { validate(value) {
          if (typeof value !== 'string' || value.length > 240 || !/^(?:\/|\/(?:blog\/)?[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(value)) return 'Use / or an exact path to a published page on this site.'
        } },
      },
    ],
  }],
}
