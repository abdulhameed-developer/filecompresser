import { editorialVocabularyError, NON_EDITORIAL_KEYS } from '../lib/editorial-vocabulary.mjs'
import { cmsRecordPublicationError } from '../lib/cms-content-limits.mjs'

const decorated = new WeakSet()
const publicationValidators = new WeakMap()
const empty = value => value === undefined || value === null || typeof value === 'string' && !value.trim() || Array.isArray(value) && value.length === 0
const draft = values => values?.published === false || values?.archived === true
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const cleared = value => empty(value) || object(value) && Object.values(value).every(cleared)
const callbackError = (field, value, values, at) => {
  const validate = publicationValidators.get(field) || field.ui?.validate
  const error = validate?.(value, values)
  return error ? `${at}: ${error}` : undefined
}

function validateField(field, value, values, at, allowIncomplete = false) {
  if (field.type === 'boolean' && value !== undefined && typeof value !== 'boolean') return `${at}: choose true or false.`
  if (value !== undefined && value !== null && field.list && !Array.isArray(value)) return `${at}: use a list.`
  if (value !== undefined && value !== null && field.type === 'object' && !field.list && !object(value)) return `${at}: use a group of fields.`
  if (empty(value)) {
    if (allowIncomplete) return
    if (field.required) return `${at}: enter ${field.label || field.name}.`
    if (value === '' && ['faqMode', 'placement'].includes(field.name)) return `${at}: choose an available option or reset this field.`
    if (typeof value === 'string' && value !== '' && field.name !== 'supportEmail') return `${at}: clear this optional field or enter non-empty text.`
    return callbackError(field, value, values, at)
  }
  if (field.list) {
    if (!Array.isArray(value)) return `${at}: use a list.`
    if (field.type === 'string' || field.type === 'image') {
      for (let index = 0; index < value.length; index++) {
        if (typeof value[index] !== 'string' || !allowIncomplete && !value[index].trim()) return `${at}[${index}]: enter non-empty text or remove this item.`
      }
    }
  } else if ((field.type === 'string' || field.type === 'image') && typeof value !== 'string') return `${at}: enter text.`
  else if (field.type === 'object' && !object(value)) return `${at}: use a group of fields.`
  if (field.options) {
    const options = new Set(field.options.map(option => typeof option === 'string' ? option : option.value))
    for (const selected of field.list ? value : [value]) if (!options.has(selected)) return `${at}: choose an available option.`
  }
  const error = callbackError(field, value, values, at)
  if (error) return error
  if (field.type === 'object') return validateChildren(field, value, values, allowIncomplete, at)
}

function validateChildren(schema, value, values, allowIncomplete = false, path = schema.name) {
  if (value === undefined || value === null || value === '') return
  if (schema.list && !Array.isArray(value)) return `${path}: use a list.`
  if (!schema.list && !schema.required && cleared(value)) return
  const rows = schema.list ? value : [value]
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], at = `${path}${schema.list ? `[${index}]` : ''}`
    if (!object(row)) return `${at}: use a group of fields.`
    if (schema.name === 'faq' && Object.values(row).every(cleared)) continue
    let fields = schema.fields
    if (schema.templates) {
      const template = schema.templates.find(item => item.name === (row._template ?? row.type))
      if (!template) {
        if (allowIncomplete && Object.values(row).every(empty)) continue
        return `${at}: choose a supported content block.`
      }
      fields = template.fields
      if (template.name === 'table' && !allowIncomplete && Array.isArray(row.columns) && Array.isArray(row.rows)) {
        if (!row.columns.length || row.columns.length > 12) return `${at}.columns: use between 1 and 12 column headings.`
        if (row.rows.some(entry => object(entry) && Array.isArray(entry.cells) && entry.cells.length !== row.columns.length)) return `${at}.rows: each row must match the column count.`
      }
    }
    for (const field of fields ?? []) {
      const error = validateField(field, row[field.name], values, `${at}.${field.name}`, allowIncomplete)
      if (error) return error
    }
  }
}

/** The same recursive check is used by beforeSubmit and by isolated field
 * controls. Whole-list errors are not returned by list UI validators: Tina prevents opening
 * any list row while the form is invalid, which would trap a new empty row.
 */
export function editorialFieldPublicationError(field, value, values = {}, at = field.name) {
  return validateField(field, value, values, at, field.name === 'body' && draft(values))
}

export function editorialPublicationError(collection, values = {}) {
  const resourceError = cmsRecordPublicationError(values)
  if (resourceError) return resourceError
  for (const field of collection.fields ?? []) {
    const error = editorialFieldPublicationError(field, values[field.name], values)
    if (error) return error
  }
}

// Return the deepest editable object containing the invalid field. A rejected
// Save opens it directly, so Tina's native submit-error state cannot stop the
// editor from reaching the inputs that need repair. No authored values change.
function editableObjectPath(collection, values, error) {
  const location = error.split(':', 1)[0]
  const tokens = location.replace(/\[(\d+)\]/g, '.$1').split('.')
  let fields = collection.fields, current = values, active, path = ''
  for (let index = 0; index < tokens.length; index++) {
    const field = fields?.find(item => item.name === tokens[index])
    if (!field) break
    path += `${path ? '.' : ''}${field.name}`
    current = current?.[field.name]
    if (field.type !== 'object') break
    if (field.list) {
      let row = tokens[index + 1]
      if (!/^\d+$/.test(row || '')) {
        const question = /Question (\d+):/.exec(error)
        row = question ? String(Number(question[1]) - 1) : undefined
      } else index++
      if (row === undefined || !Array.isArray(current) || !current[Number(row)]) break
      path += `.${row}`
      current = current[Number(row)]
    }
    active = path
    fields = field.templates?.find(item => item.name === (current?._template ?? current?.type))?.fields ?? field.fields
  }
  return active
}

function decorate(schema) {
  if (decorated.has(schema)) return schema
  const result = { ...schema }
  if (schema.fields) result.fields = schema.fields.map(decorate)
  if (schema.templates) result.templates = schema.templates.map(decorate)
  if (schema.type === 'string' && !NON_EDITORIAL_KEYS.has(schema.name) && !schema.options) {
    const validate = schema.ui?.validate
    result.ui = { ...schema.ui, validate(value, values, meta) {
      const error = validate?.(value, values, meta)
      if (error) return error
      // A custom Tina callback replaces its plugin validator.
      if (schema.required && (!value || empty(value))) return 'Required'
      return editorialVocabularyError(value)
    } }
  }
  if (schema.type === 'string' && schema.list && !schema.options) {
    const { validate, field: item = {}, ...ui } = result.ui ?? {}
    if (validate) publicationValidators.set(result, validate)
    const itemValidate = item.validate
    // Suppress the native parent's scalar Required error too: removing the
    // last indexed item otherwise collides with that error before unmount.
    result.ui = { ...ui, validate() { return undefined }, field: { component: 'text', ...item, list: false, required: true, validate(value, values, meta) {
      const error = itemValidate?.(value, values, meta)
      if (error) return error
      if (typeof value !== 'string' || !value.trim()) return 'Enter text or remove this item.'
      if (!NON_EDITORIAL_KEYS.has(schema.name)) return editorialVocabularyError(value)
    } } }
  }
  if (schema.type === 'object') {
    const { validate, ...ui } = schema.ui ?? {}
    result.ui = ui
    if (validate) publicationValidators.set(result, validate)
  }
  if (schema.path && schema.fields) {
    const beforeSubmit = schema.ui?.beforeSubmit
    result.ui = { ...result.ui, async beforeSubmit(args) {
      const overridden = await beforeSubmit?.(args)
      const values = overridden ?? args.values
      const error = editorialPublicationError(result, values)
      if (error) {
        const fieldName = editableObjectPath(result, values, error)
        if (fieldName && args.cms?.dispatch && args.form?.id) args.cms.dispatch({ type: 'forms:set-active-field-name', value: { formId: args.form.id, fieldName } })
        throw new Error(error)
      }
      return values
    } }
  }
  decorated.add(result)
  return result
}

/** Preserve native leaf validators, optional groups and authored values. */
export function withEditorialPolicy(schema) { return decorate(schema) }
