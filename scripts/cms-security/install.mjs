import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import ts from 'typescript'
import { CMS_VALIDATION_LIMITS } from './resource-limits.mjs'
import { resourceModuleSource, transformZodParseUtil, transformZodTypes } from './transform-zod.mjs'

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'))
const backupDirectory = 'filecompresser-security-original'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => { throw Error(`CMS security verification failed: ${message}`) }

function regularBytes(filename, maximum = 2 * 1024 * 1024) {
  const info = lstatSync(filename)
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) fail(`unexpected file type or size: ${filename}`)
  return readFileSync(filename)
}

function json(filename) {
  try { return JSON.parse(regularBytes(filename).toString('utf8')) } catch {
    return fail(`cannot read valid package metadata: ${filename}`)
  }
}

function authentic(bytes, expected, description) {
  if (bytes.length !== expected.bytes || digest(bytes) !== expected.sha256) fail(`unrecognized bytes for ${description}; reinstall the reviewed lockfile instead of overwriting unknown modifications`)
}

function assertTransformerIdentity() {
  if (ts.version !== manifest.typescriptVersion) fail(`reviewed TypeScript ${manifest.typescriptVersion} is required to reproduce the pinned patch`)
  if (digest(regularBytes(fileURLToPath(new URL('./transform-zod.mjs', import.meta.url)))) !== manifest.transformerSha256) fail('the patch transformer differs from the reviewed manifest')
}

/** Authenticate original npm bytes before deriving the fixed, separately pinned outputs. */
export function buildRuntimePatch(originals) {
  assertTransformerIdentity()
  const outputs = new Map()
  for (const [relative, expected] of Object.entries(manifest.originalFiles)) {
    const bytes = originals.get(relative)
    if (!Buffer.isBuffer(bytes)) fail(`missing original runtime file ${relative}`)
    authentic(bytes, expected, `original ${relative}`)
    const source = bytes.toString('utf8')
    if (!Buffer.from(source).equals(bytes)) fail(`non-UTF-8 runtime source ${relative}`)
    const patched = expected.kind === 'types'
      ? transformZodTypes(source, expected.format)
      : transformZodParseUtil(source, expected.format)
    const output = Buffer.from(patched)
    authentic(output, manifest.patchedFiles[relative], `derived ${relative}`)
    outputs.set(relative, output)
  }
  for (const format of ['esm', 'cjs']) {
    const relative = `v3/filecompresser-resources.${format === 'esm' ? 'js' : 'cjs'}`
    const output = Buffer.from(resourceModuleSource(format))
    authentic(output, manifest.patchedFiles[relative], `resource helper ${relative}`)
    outputs.set(relative, output)
  }
  return outputs
}

/** Inspect actual installed package roots, including nested npm copies and aliases. */
export function inventoryCmsDependencies(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot)
  const consumers = []
  const instances = []
  const visitedModuleDirectories = new Set()
  const walk = modules => {
    if (!existsSync(modules)) return
    const real = realpathSync(modules)
    if (visitedModuleDirectories.has(real)) return
    visitedModuleDirectories.add(real)
    for (const entry of readdirSync(modules, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const candidate = path.join(modules, entry.name)
      if (entry.name.startsWith('@')) {
        if (!lstatSync(candidate).isDirectory()) continue
        for (const scoped of readdirSync(candidate)) inspect(path.join(candidate, scoped))
      } else inspect(candidate)
    }
  }
  const inspect = directory => {
    const packageJson = path.join(directory, 'package.json')
    if (!existsSync(packageJson)) return
    const metadata = json(packageJson)
    const nodePath = path.relative(root, directory).split(path.sep).join('/')
    if (Object.hasOwn(manifest.consumerVersions, metadata.name)) {
      if (metadata.version !== manifest.consumerVersions[metadata.name]) fail(`unreviewed ${metadata.name} version ${metadata.version}`)
      const consumer = { name: metadata.name, version: metadata.version, nodePath }
      consumers.push(consumer)
      if (metadata.name === manifest.package) instances.push({ ...consumer, directory })
    }
    walk(path.join(directory, 'node_modules'))
  }
  walk(path.join(root, 'node_modules'))
  return { instances, consumers }
}

function requireInstallation(root, inventory) {
  for (const name of Object.keys(manifest.consumerVersions)) {
    if (!inventory.consumers.some(item => item.name === name)) fail(`the reviewed CMS installation is missing ${name}; run npm run setup:cms`)
  }
  const lock = json(path.join(root, 'package-lock.json'))
  for (const instance of inventory.instances) {
    if (lock.packages?.[instance.nodePath]?.integrity !== manifest.npmIntegrity) fail(`npm source integrity is missing or differs for ${instance.nodePath}`)
  }
}

function plansFor(root, inventory, apply) {
  requireInstallation(root, inventory)
  const plans = []
  for (const instance of inventory.instances) {
    if (apply) {
      const inside = path.relative(path.join(root, 'node_modules'), realpathSync(instance.directory))
      if (inside.startsWith('..') || path.isAbsolute(inside)) fail('shared dependencies outside this checkout are not modified; install a writable checkout-local node_modules')
    }
    const originals = new Map()
    for (const relative of Object.keys(manifest.originalFiles)) {
      const backup = path.join(instance.directory, backupDirectory, relative)
      const filename = existsSync(backup) ? backup : path.join(instance.directory, relative)
      originals.set(relative, regularBytes(filename))
    }
    const outputs = buildRuntimePatch(originals)
    for (const [relative, output] of outputs) {
      const filename = path.join(instance.directory, relative)
      const exists = existsSync(filename)
      if (!exists) {
        if (!apply || Object.hasOwn(manifest.originalFiles, relative)) fail(`missing patched runtime file ${instance.nodePath}/${relative}`)
        continue
      }
      const actual = regularBytes(filename)
      if (actual.equals(output)) continue
      if (!apply || !Object.hasOwn(manifest.originalFiles, relative)) fail(`changed patched file ${instance.nodePath}/${relative}`)
      authentic(actual, manifest.originalFiles[relative], `installed ${instance.nodePath}/${relative}`)
    }
    plans.push({ instance, originals, outputs })
  }
  return plans
}

function atomicWrite(filename, bytes) {
  mkdirSync(path.dirname(filename), { recursive: true })
  const temporary = `${filename}.filecompresser-tmp-${process.pid}`
  writeFileSync(temporary, bytes, { flag: 'wx' })
  renameSync(temporary, filename)
}

function runProbe(directory, projectRoot, mode = 'zod') {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./probe-runtime.mjs', import.meta.url), {
      workerData: { directory, projectRoot, mode },
      execArgv: ['--unhandled-rejections=strict'],
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    })
    let result
    const timer = setTimeout(() => { worker.terminate(); reject(Error('CMS runtime regression probe timed out')) }, 20000)
    worker.on('message', message => { result = message })
    worker.on('error', error => { clearTimeout(timer); reject(error) })
    worker.on('exit', code => {
      clearTimeout(timer)
      if (code !== 0 || !result?.passed) reject(Error(`CMS runtime regression probe failed (${mode}, exit ${code})`))
      else resolve(result)
    })
  })
}

/** Always perform real fresh-worker probes; attestation JSON alone grants no disposition. */
export async function verifyCmsSecurity({ projectRoot = process.cwd(), verifyAdmin = false } = {}) {
  const root = path.resolve(projectRoot)
  const inventory = inventoryCmsDependencies(root)
  const plans = plansFor(root, inventory, false)
  const instances = []
  for (const plan of plans) {
    const proof = await runProbe(plan.instance.directory, root)
    instances.push({
      nodePath: plan.instance.nodePath,
      version: plan.instance.version,
      originalFilesVerified: true,
      patchedFilesVerified: true,
      resourceHelpersVerified: true,
      proofPassed: proof.passed,
      files: Object.fromEntries([...plan.outputs].map(([relative, bytes]) => [relative, digest(bytes)])),
      proof,
    })
  }
  const cmsContract = await runProbe(null, root, 'cms-contract')
  const adminBundle = verifyAdmin ? verifyAdminResourceBundle(root) : null
  return {
    verified: true,
    advisory: manifest.advisory,
    version: manifest.version,
    resourcePolicy: CMS_VALIDATION_LIMITS,
    proof: { passed: true, esm: true, cjs: true, issueBudget: true, graphCaps: true, boundedBackport: true, asyncObserved: true, cmsContracts: cmsContract.passed },
    instances,
    consumers: inventory.consumers,
    cmsContract,
    adminBundle,
    adminBundleStaticVerified: adminBundle?.verified === true,
    adminBrowserRuntimeVerified: false,
  }
}

export function verifyAdminResourceBundle(projectRoot = process.cwd()) {
  const directory = path.join(projectRoot, 'public', 'admin')
  if (!existsSync(directory)) fail('the generated admin bundle is absent')
  const entry = path.join(directory, 'index.html')
  if (!existsSync(entry)) fail('the generated admin bundle does not contain its HTML entry')
  const origin = 'https://filecompresser.invalid'
  const entryUrl = new URL('/admin/index.html', origin)
  const rawHtml = regularBytes(entry, 2 * 1024 * 1024).toString('utf8')
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '')
  if (html.includes('<!--') || /<\s*(?:base|template|noscript|iframe|textarea|xmp|plaintext|svg|math)\b/i.test(html)) fail('admin HTML contains unsupported module-base or inert markup')
  const pending = []
  const visited = new Set()
  let totalBytes = 0, edges = 0, astNodes = 0, roots = 0, parsers = 0, marker = false, message = false
  const assets = []
  const name = node => !node ? undefined : ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text
    : ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression) ? node.expression.text : undefined
  const moduleLiteral = node => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
  const find = (node, predicate) => {
    const found = []
    const visit = current => { if (predicate(current)) found.push(current); ts.forEachChild(current, visit) }
    visit(node)
    return found
  }
  const property = (object, key) => object.properties.find(item => name(item.name) === key)
  const enqueue = (specifier, parent) => {
    if (++edges > 4096) fail('admin module graph exceeds the inspection edge budget')
    let url
    try { url = new URL(specifier, parent) } catch { fail('unrecognized admin module URL') }
    if (url.origin !== origin || !url.pathname.startsWith('/admin/')) fail('admin module graph contains an unverifiable external or escaping script')
    if (!/\.(?:mjs|js)$/.test(url.pathname)) {
      if (/\.(?:css|json)$/.test(url.pathname)) return
      fail('admin module graph contains an unsupported script extension')
    }
    let relative
    try { relative = decodeURIComponent(url.pathname.slice('/admin/'.length)) } catch { fail('invalid encoded admin module path') }
    if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('unsafe admin module path')
    const normalized = new URL(`/admin/${relative}`, origin).href
    if (!visited.has(normalized)) pending.push({ url: normalized, relative })
  }
  const tail = expression => {
    while (expression && (ts.isParenthesizedExpression(expression)
      || (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken))) {
      expression = ts.isParenthesizedExpression(expression) ? expression.expression : expression.right
    }
    return expression
  }
  const observer = (identifier, from) => {
    if (!ts.isIdentifier(identifier)) return false
    let scope = from.parent
    while (scope) {
      if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
        for (const statement of scope.statements) {
          let candidate
          if (ts.isFunctionDeclaration(statement) && name(statement.name) === identifier.text) candidate = statement
          if (ts.isVariableStatement(statement)) {
            const declaration = statement.declarationList.declarations.find(item => name(item.name) === identifier.text)
            if (declaration && declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) candidate = declaration.initializer
          }
          if (candidate) {
            const parameter = name(candidate.parameters[0]?.name)
            if (candidate.parameters.length !== 1 || !parameter || !candidate.body) return false
            const catches = find(candidate.body, node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
              && name(node.expression.expression) === parameter && node.expression.name.text === 'catch'
              && node.arguments.length === 1 && ts.isArrowFunction(node.arguments[0])
              && ts.isBlock(node.arguments[0].body) && node.arguments[0].body.statements.length === 0)
            const returns = find(candidate.body, node => ts.isReturnStatement(node) && name(tail(node.expression)) === parameter)
            const native = find(candidate.body, node => ts.isBinaryExpression(node)
              && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
              && name(node.left) === parameter && name(node.right) === 'Promise')
            return catches.length === 1 && (returns.length === 1 || name(tail(candidate.body)) === parameter) && native.length === 1
              && find(candidate.body, ts.isThrowStatement).length === 0
          }
        }
      }
      scope = scope.parent
    }
    return false
  }
  const inspect = (source, filename, url) => {
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    if (ast.parseDiagnostics.length) fail('generated admin JavaScript has unsupported syntax')
    const unresolvedImport = current => {
      const excerpt = (start, end, maximum, rawMaximum, input = source) => {
        const raw = input.slice(start, Math.min(end, start + rawMaximum))
        const normalized = raw.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()
        const truncated = end - start > rawMaximum || normalized.length > maximum
        return { text: truncated ? `${normalized.slice(0, maximum - 1)}…` : normalized, truncated }
      }
      const detail = (node, parsed = ast, input = source, asset = filename) => {
        const start = node.getStart(parsed)
        const position = parsed.getLineAndCharacterOfPosition(start)
        let context = node.parent, statement
        while (context && !ts.isFunctionDeclaration(context) && !ts.isFunctionExpression(context)
          && !ts.isArrowFunction(context) && !ts.isMethodDeclaration(context) && !ts.isConstructorDeclaration(context)) {
          if (!statement && ts.isStatement(context)) statement = context
          context = context.parent
        }
        context ||= statement || node
        const contextStart = Math.max(context.getStart(parsed), start - 200)
        const expression = excerpt(start, node.end, 240, 1024, input)
        const surrounding = excerpt(contextStart, context.end, 600, 2400, input)
        const binding = context.name || context.parent?.name
        return { asset: asset.slice(0, 160), line: position.line + 1, column: position.character + 1,
          literalSpecifier: node.arguments.length === 1 && moduleLiteral(node.arguments[0]),
          expression: expression.text, expressionTruncated: expression.truncated,
          context: surrounding.text, contextTruncated: surrounding.truncated || contextStart > context.getStart(parsed),
          contextKind: ts.SyntaxKind[context.kind], contextName: binding ? input.slice(binding.getStart(parsed), Math.min(binding.end, binding.getStart(parsed) + 80)) : undefined }
      }
      const imports = [detail(current)]
      const stack = [ast]
      let scheduled = 1, scanned = 0, candidateRoots = 0, candidateParsers = 0, scanTruncated = false
      while (stack.length) {
        const node = stack.pop()
        scanned++
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
          const methods = node.members.filter(ts.isMethodDeclaration)
          if (methods.some(member => ['safeParse', 'safeParseAsync'].includes(name(member.name)))) candidateRoots++
          if (methods.some(member => name(member.name) === '_parse')) candidateParsers++
        }
        ts.forEachChild(node, child => {
          if (scheduled >= 50000) { scanTruncated = true; return true }
          scheduled++
          stack.push(child)
          return undefined
        })
      }
      // This inventory is diagnostic only: unreferenced generated assets never
      // become accepted graph edges. Preserve the original fail-closed result.
      const generated = { scope: 'generated admin JS assets, including unreferenced diagnostics only',
        files: 0, bytes: 0, nodes: 0, computedImports: 0, literalImports: 0, truncated: false, errors: [], classes: [], classRecordsOmitted: false }
      const computed = [], literal = [], directories = [{ relative: '', depth: 0 }]
      let diagnosticEdges = 0, diagnosticScheduled = 0
      while (directories.length && !generated.truncated) {
        const directoryEntry = directories.pop()
        let entries
        try { entries = readdirSync(path.join(directory, directoryEntry.relative), { withFileTypes: true }) } catch {
          generated.truncated = true; break
        }
        for (const entry of entries) {
          if (++diagnosticEdges > 4096) { generated.truncated = true; break }
          const relative = path.join(directoryEntry.relative, entry.name)
          if (entry.isDirectory()) {
            if (directoryEntry.depth >= 16) { generated.truncated = true; break }
            directories.push({ relative, depth: directoryEntry.depth + 1 })
            continue
          }
          if (!/\.(?:mjs|js)$/.test(entry.name)) continue
          if (generated.files >= 256) { generated.truncated = true; break }
          let bytes, parsed, input
          try {
            bytes = regularBytes(path.join(directory, relative), 16 * 1024 * 1024)
            if (generated.bytes + bytes.length > 64 * 1024 * 1024) { generated.truncated = true; break }
            input = bytes.toString('utf8')
            parsed = relative === filename ? ast : ts.createSourceFile(relative, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
          } catch {
            if (generated.errors.length < 5) generated.errors.push({ asset: relative.slice(0, 160), reason: 'unreadable or unsupported generated asset' })
            continue
          }
          generated.files++
          generated.bytes += bytes.length
          if (parsed.parseDiagnostics.length) {
            if (generated.errors.length < 5) generated.errors.push({ asset: relative.slice(0, 160), reason: 'unsupported generated syntax' })
            continue
          }
          if (diagnosticScheduled >= 2000000) { generated.truncated = true; break }
          const nodes = [parsed]
          diagnosticScheduled++
          while (nodes.length) {
            const node = nodes.pop()
            generated.nodes++
            if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
              const methods = node.members.filter(ts.isMethodDeclaration).map(member => name(member.name))
              if (methods.some(method => ['safeParse', 'safeParseAsync', '_parse'].includes(method))) {
                if (generated.classes.length < 50) generated.classes.push({ asset: relative.slice(0, 160),
                  className: (name(node.name) || name(node.parent?.name) || '<anonymous>').slice(0, 80),
                  methods: [...new Set(methods.filter(method => ['safeParse', 'safeParseAsync', '_parse', '_parseAsync', 'parse', 'parseAsync', '~validate'].includes(method)))] })
                else generated.classRecordsOmitted = true
              }
            }
            if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
              const conventional = node.arguments.length === 1 && moduleLiteral(node.arguments[0])
              generated[conventional ? 'literalImports' : 'computedImports']++
              if (!(relative === filename && node.getStart(parsed) === current.getStart(ast))) {
                const collection = conventional ? literal : computed
                if (collection.length < 20) collection.push(detail(node, parsed, input, relative))
              }
            }
            ts.forEachChild(node, child => {
              if (diagnosticScheduled >= 2000000) { generated.truncated = true; return true }
              diagnosticScheduled++
              nodes.push(child)
              return undefined
            })
          }
          if (generated.truncated) break
        }
      }
      imports.push(...computed.slice(0, 19))
      imports.push(...literal.slice(0, 20 - imports.length))
      const diagnostic = { asset: filename.slice(0, 160), imports,
        additionalImportsOmitted: generated.computedImports + generated.literalImports > imports.length,
        generatedInventory: generated, candidateScan: { roots: candidateRoots, parsers: candidateParsers, nodes: scanned, truncated: scanTruncated },
        partialInspection: { roots, parsers, files: visited.size, bytes: totalBytes } }
      fail(`admin bundle contains an unresolved dynamic module import; diagnostic=${JSON.stringify(diagnostic)}`)
    }
    const walk = node => {
      if (++astNodes > 2000000) fail('admin JavaScript exceeds the AST inspection budget')
      if (ts.isStringLiteral(node)) {
        if (node.text === 'filecompresser.cms-zod.issue-limit.v1') marker = true
        if (node.text.startsWith('$Zod')) fail('admin bundle contains an unsupported Zod4 constructor')
      }
      if ((ts.isStringLiteral(node) || ts.isTemplateHead(node)) && node.text.includes('CMS validation stopped at')) message = true
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) enqueue(node.moduleSpecifier.text, url)
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !moduleLiteral(node.arguments[0])) unresolvedImport(node)
        enqueue(node.arguments[0].text, url)
      }
      if (ts.isCallExpression(node) && name(node.expression) === 'require') fail('admin bundle contains an unsupported unresolved CommonJS import')
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const memberName = member => ts.isPropertyAccessExpression(member) ? member.name.text
          : ts.isElementAccessExpression(member) && member.argumentExpression && ts.isStringLiteral(member.argumentExpression) ? member.argumentExpression.text : undefined
        if (['safeParse', 'safeParseAsync'].includes(memberName(node.left))
          && memberName(node.left.expression) === 'prototype') fail('admin bundle contains an unsupported prototype-based Zod root')
      }
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        const methods = node.members.filter(ts.isMethodDeclaration)
        const named = key => methods.filter(item => name(item.name) === key)
        if (named('safeParse').length || named('safeParseAsync').length) {
          roots++
          for (const key of ['safeParse', 'safeParseAsync', '~validate', '_parseAsync']) {
            if (named(key).length !== 1 || !named(key)[0].body) fail('admin bundle contains an unrecognized Zod root shape')
          }
          if (!named('_parseAsync')[0].modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) fail('admin Zod async dispatch is unguarded')
          for (const key of ['safeParse', 'safeParseAsync', '~validate']) {
            const body = named(key)[0].body
            const contexts = find(body, item => ts.isObjectLiteralExpression(item)
              && property(item, 'common') && property(item, 'parsedType'))
            if (contexts.length !== 1) fail('admin Zod root context is unrecognized')
            const common = property(contexts[0], 'common')
            const parsedType = property(contexts[0], 'parsedType')
            if (!ts.isPropertyAssignment(common) || !ts.isObjectLiteralExpression(common.initializer)
              || !property(common.initializer, 'fileCompresserBudget')
              || !ts.isPropertyAssignment(parsedType) || !ts.isConditionalExpression(parsedType.initializer)
              || !ts.isStringLiteral(parsedType.initializer.whenTrue) || parsedType.initializer.whenTrue.text !== 'unknown') fail('admin Zod root lacks its graph preflight/shared budget')
            const catches = find(body, item => ts.isCatchClause(item)
              && find(item.block, child => ts.isStringLiteral(child) && child.text === 'issues').length > 0
              && find(item.block, ts.isThrowStatement).length > 0)
            if (!catches.length) fail('admin Zod root lacks sentinel-only resource handling')
            const resets = find(body, item => ts.isBinaryExpression(item) && item.operatorToken.kind === ts.SyntaxKind.EqualsToken
              && ts.isPropertyAccessExpression(item.left) && item.left.name.text === 'common' && ts.isObjectLiteralExpression(item.right))
            if (resets.some(reset => !property(reset.right, 'fileCompresserBudget'))) fail('admin Zod retry resets its shared issue budget')
          }
        }
        if (named('_parse').length) {
          parsers++
          if (named('_parse').length !== 1 || !named('_parse')[0].body) fail('admin parser method is unrecognized')
          const body = named('_parse')[0].body
          const guarded = body.statements.length === 1 && ts.isTryStatement(body.statements[0]) ? body.statements[0] : null
          const returned = guarded?.tryBlock.statements[0]
          const call = returned && ts.isReturnStatement(returned) && returned.expression && ts.isCallExpression(returned.expression) ? returned.expression : null
          if (!guarded?.catchClause || !call || !observer(call.expression, node)) fail('admin bundle contains an unguarded parser promise')
          const asynchronous = find(guarded.catchClause.block, item => ts.isPropertyAccessExpression(item) && item.name.text === 'async'
            && ts.isPropertyAccessExpression(item.expression) && item.expression.name.text === 'common'
            && ts.isPropertyAccessExpression(item.expression.expression) && item.expression.expression.name.text === 'parent')
          const rejected = find(guarded.catchClause.block, item => ts.isCallExpression(item) && ts.isPropertyAccessExpression(item.expression)
            && name(item.expression.expression) === 'Promise' && item.expression.name.text === 'reject')
          if (asynchronous.length !== 1 || rejected.length !== 1 || !find(guarded.catchClause.block, ts.isThrowStatement).length) fail('admin parser lacks async sentinel observation')
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(ast)
  }
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attributes = match[1]
    const type = /\btype\s*=\s*['"]([^'"]+)['"]/i.exec(attributes)?.[1]
    if (type?.toLowerCase() === 'importmap') fail('admin HTML contains an unsupported import map')
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue
    const source = /\bsrc\s*=\s*['"]([^'"]+)['"]/i.exec(attributes)?.[1]
    if (/\bsrc\s*=/i.test(attributes) && !source) fail('admin HTML contains an unsupported script source attribute')
    if (source) enqueue(source, entryUrl)
    else if (match[2].trim()) inspect(match[2], 'inline-admin.js', entryUrl)
  }
  while (pending.length) {
    const next = pending.pop()
    if (visited.has(next.url)) continue
    if (visited.size >= 256) fail('admin module graph exceeds the inspection file budget')
    const filename = path.join(directory, next.relative)
    const real = realpathSync(filename)
    const inside = path.relative(realpathSync(directory), real)
    if (inside.startsWith('..') || path.isAbsolute(inside)) fail('admin module escapes its output directory')
    const bytes = regularBytes(filename, 16 * 1024 * 1024)
    if ((totalBytes += bytes.length) > 64 * 1024 * 1024) fail('admin module graph exceeds the inspection byte budget')
    visited.add(next.url)
    assets.push({ path: next.relative, sha256: digest(bytes), bytes: bytes.length })
    inspect(bytes.toString('utf8'), next.relative, next.url)
  }
  if (!roots || !parsers || !marker || !message) fail('the entry-reachable admin code does not contain recognizable guarded Zod roots and parsers')
  return { verified: true, coverage: 'static entry-reachable JavaScript structure', browserRuntimeVerified: false,
    roots, parsers, files: assets, totalBytes }
}

export async function applyCmsSecurity({ projectRoot = process.cwd(), ifPresent = false } = {}) {
  const root = path.resolve(projectRoot)
  if (ifPresent && !existsSync(path.join(root, 'node_modules', 'tinacms', 'package.json'))
    && !existsSync(path.join(root, 'node_modules', '@tinacms', 'cli', 'package.json'))) return { skipped: true, reason: 'CMS dependencies have not been installed yet' }
  const inventory = inventoryCmsDependencies(root)
  const plans = plansFor(root, inventory, true)
  // Authenticate every instance and every output before mutating any instance.
  for (const plan of plans) {
    for (const [relative, bytes] of plan.originals) {
      const filename = path.join(plan.instance.directory, backupDirectory, relative)
      if (!existsSync(filename)) atomicWrite(filename, bytes)
    }
    for (const [relative, bytes] of plan.outputs) {
      const filename = path.join(plan.instance.directory, relative)
      if (!existsSync(filename) || !regularBytes(filename).equals(bytes)) atomicWrite(filename, bytes)
    }
  }
  const evidence = await verifyCmsSecurity({ projectRoot: root })
  for (const instance of inventory.instances) {
    atomicWrite(path.join(instance.directory, 'filecompresser-security-attestation.json'), Buffer.from(JSON.stringify(evidence, null, 2) + '\n'))
  }
  return evidence
}
