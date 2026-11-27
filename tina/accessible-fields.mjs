import { createElement } from 'react'

/**
 * Keep Tina's supported field component and its parsing, validation, focus and
 * styling. Supply the control id its existing label already references.
 * This is a field-plugin extension, not a patch to the editor's DOM or package.
 */
export function accessibleTextPlugin(plugin) {
  const OriginalField = plugin.Component
  function AccessibleTextField(props) {
    const { input, field, meta } = props
    const label = typeof field.label === 'string' ? field.label : field.name || input.name
    return createElement(OriginalField, {
      ...props,
      input: {
        ...input,
        id: input.name,
        'aria-label': input['aria-label'] ?? label,
        'aria-required': Boolean(field.required),
        'aria-invalid': Boolean(meta?.error),
      },
    })
  }
  return { ...plugin, Component: AccessibleTextField }
}
