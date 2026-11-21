import { readFileSync } from 'node:fs'
import ts from 'typescript'

const securityName = 'fileCompresserCmsSecurity'
const concreteClasses = [
  'ZodString', 'ZodNumber', 'ZodBigInt', 'ZodBoolean', 'ZodDate', 'ZodSymbol',
  'ZodUndefined', 'ZodNull', 'ZodAny', 'ZodUnknown', 'ZodNever', 'ZodVoid',
  'ZodArray', 'ZodObject', 'ZodUnion', 'ZodDiscriminatedUnion', 'ZodIntersection',
  'ZodTuple', 'ZodRecord', 'ZodMap', 'ZodSet', 'ZodFunction', 'ZodLazy', 'ZodLiteral',
  'ZodEnum', 'ZodNativeEnum', 'ZodPromise', 'ZodEffects', 'ZodOptional',
  'ZodNullable', 'ZodDefault', 'ZodCatch', 'ZodNaN', 'ZodBranded', 'ZodPipeline', 'ZodReadonly',
]
const resourceExports = [
  'CMS_VALIDATION_LIMITS', 'CMS_VALIDATION_ISSUE_LIMIT', 'inspectCmsValidationInput',
  'createCmsValidationBudget', 'consumeCmsValidationIssue', 'cmsResourceIssue',
]

function requirePattern(condition, detail) {
  if (!condition) throw new Error(`Zod security transform: unexpected ${detail}`)
}

function assertFormat(format) {
  requirePattern(format === 'esm' || format === 'cjs', 'module format')
}

function parse(source, name = 'zod.js') {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  requirePattern(file.parseDiagnostics.length === 0, `${name} syntax`)
  return file
}

function generatedStatements(source) {
  const file = parse(source, 'injected.js')
  const synthetic = node => {
    ts.setTextRange(node, { pos: -1, end: -1 })
    ts.setEmitFlags(node, ts.EmitFlags.NoComments)
    ts.forEachChild(node, synthetic)
  }
  for (const statement of file.statements) synthetic(statement)
  return [...file.statements]
}

function nameOf(node) {
  if (!node) return undefined
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text
  if (ts.isComputedPropertyName(node) && ts.isStringLiteral(node.expression)) return node.expression.text
  return undefined
}

function callName(expression) {
  if (ts.isParenthesizedExpression(expression)) return callName(expression.expression)
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.CommaToken) return callName(expression.right)
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  return ts.isIdentifier(expression) ? expression.text : undefined
}

function nodesMatching(root, predicate) {
  const found = []
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit) }
  visit(root)
  return found
}

function method(classNode, name) {
  const found = classNode.members.filter(member => ts.isMethodDeclaration(member) && nameOf(member.name) === name)
  requirePattern(found.length === 1 && found[0].body, `${classNode.name.text}.${name} count`)
  return found[0]
}

function updateMethod(node, body, modifiers = node.modifiers) {
  return ts.factory.updateMethodDeclaration(node, modifiers, node.asteriskToken, node.name,
    node.questionToken, node.typeParameters, node.parameters, node.type, body)
}

function classMap(file) {
  const classes = new Map()
  for (const node of file.statements.filter(ts.isClassDeclaration)) {
    requirePattern(node.name && !classes.has(node.name.text), 'duplicate/anonymous class')
    classes.set(node.name.text, node)
  }
  return classes
}

function importStatement(format, relative) {
  return generatedStatements(format === 'esm'
    ? `import * as ${securityName} from '${relative}.js';`
    : `const ${securityName} = require('${relative}.cjs');`)[0]
}

function insertAfterDirectives(statements, inserted) {
  let index = 0
  while (index < statements.length && ts.isExpressionStatement(statements[index])
    && ts.isStringLiteral(statements[index].expression)) index++
  return [...statements.slice(0, index), ...inserted, ...statements.slice(index)]
}

function print(file, statements) {
  const updated = ts.factory.updateSourceFile(file, statements)
  return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(updated)
}

function patchUpperBounds(node, className, context, sourceFile) {
  const fields = className === 'ZodArray' ? ['exactLength', 'maxLength'] : ['maxSize']
  const counts = Object.fromEntries(fields.map(field => [field, 0]))
  const invalidReturns = nodesMatching(node.body, candidate => ts.isReturnStatement(candidate)
    && candidate.expression && callName(candidate.expression) === 'INVALID')
  const invalidExpressions = new Map(invalidReturns.map(ret => [ret.expression.getText(sourceFile), ret.expression]))
  requirePattern(invalidExpressions.size === 1, `${className} INVALID return`)
  const invalid = [...invalidExpressions.values()][0]
  const visit = candidate => {
    if (!ts.isBlock(candidate)) return ts.visitEachChild(candidate, visit, context)
    const statements = []
    for (let index = 0; index < candidate.statements.length; index++) {
      const statement = candidate.statements[index]
      let field
      if (ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
        && ts.isPropertyAccessExpression(statement.expression.expression)
        && statement.expression.expression.expression.getText(sourceFile) === 'status'
        && statement.expression.expression.name.text === 'dirty') {
        const previous = candidate.statements[index - 1]
        if (previous && ts.isExpressionStatement(previous) && ts.isCallExpression(previous.expression)
          && callName(previous.expression.expression) === 'addIssueToContext') {
          const issue = previous.expression.arguments[1]
          if (issue && ts.isObjectLiteralExpression(issue)) {
            const message = issue.properties.filter(property => ts.isPropertyAssignment(property) && nameOf(property.name) === 'message')
            if (message.length === 1 && ts.isPropertyAccessExpression(message[0].initializer)
              && message[0].initializer.name.text === 'message'
              && ts.isPropertyAccessExpression(message[0].initializer.expression)
              && message[0].initializer.expression.expression.getText(sourceFile) === 'def') {
              const selected = message[0].initializer.expression.name.text
              if (fields.includes(selected)) field = selected
            }
          }
        }
      }
      if (field) {
        counts[field]++
        if (field === 'exactLength') {
          statements.push(ts.factory.createIfStatement(ts.factory.createIdentifier('tooBig'), ts.factory.createReturnStatement(invalid)))
          statements.push(statement)
        } else statements.push(ts.factory.createReturnStatement(invalid))
      } else statements.push(ts.visitEachChild(statement, visit, context))
    }
    return ts.factory.updateBlock(candidate, statements)
  }
  const body = ts.visitNode(node.body, visit)
  for (const field of fields) requirePattern(counts[field] === 1, `${className}.${field} issue/status pattern`)
  return updateMethod(node, body)
}

function observeParseMethod(node) {
  requirePattern(node.parameters.length === 1 && nameOf(node.parameters[0].name) === 'input', '_parse input signature')
  const invoke = ts.factory.createCallExpression(ts.factory.createParenthesizedExpression(
    ts.factory.createArrowFunction(undefined, undefined, [], undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), node.body)), undefined, [])
  const body = generatedStatements(`try {
    return fileCompresserObserveParsePromise(null);
  } catch (fileCompresserError) {
    if (fileCompresserError === ${securityName}.CMS_VALIDATION_ISSUE_LIMIT && input.parent.common.async) {
      return fileCompresserObserveParsePromise(Promise.reject(fileCompresserError));
    }
    throw fileCompresserError;
  }`)[0]
  const observedReturn = ts.factory.createReturnStatement(ts.factory.createCallExpression(
    ts.factory.createIdentifier('fileCompresserObserveParsePromise'), undefined, [invoke]))
  const tryBlock = ts.factory.updateBlock(body.tryBlock, [observedReturn])
  return updateMethod(node, ts.factory.createBlock([
    ts.factory.updateTryStatement(body, tryBlock, body.catchClause, body.finallyBlock),
  ], true))
}

function observeEffectProbes(node, context) {
  let count = 0
  const visit = candidate => {
    if (ts.isVariableDeclaration(candidate) && candidate.initializer && ts.isCallExpression(candidate.initializer)
      && ts.isPropertyAccessExpression(candidate.initializer.expression)
      && nameOf(candidate.initializer.expression.expression) === 'effect'
      && ['transform', 'refinement'].includes(candidate.initializer.expression.name.text)) {
      count++
      return ts.factory.updateVariableDeclaration(candidate, candidate.name, candidate.exclamationToken, candidate.type,
        ts.factory.createCallExpression(ts.factory.createIdentifier('fileCompresserObserveParsePromise'), undefined, [candidate.initializer]))
    }
    return ts.visitEachChild(candidate, visit, context)
  }
  const body = ts.visitNode(node.body, visit)
  requirePattern(count === 3, 'three ZodEffects callback probe results')
  return updateMethod(node, body)
}

function rewriteRootMethod(node, standard, context) {
  requirePattern(nameOf(node.parameters[0]?.name) === 'data', `${nameOf(node.name)} data parameter`)
  const statements = [...node.body.statements]
  const contexts = statements.filter(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => nameOf(declaration.name) === 'ctx'))
  requirePattern(contexts.length === 1 && statements[0] === contexts[0], `${nameOf(node.name)} root context position`)
  const contextStatement = contexts[0]
  requirePattern(contextStatement.declarationList.declarations.length === 1, 'root context declaration')
  const declaration = contextStatement.declarationList.declarations[0]
  requirePattern(declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer), 'root context object')
  let commonCount = 0, typeCount = 0
  const properties = declaration.initializer.properties.map(property => {
    if (ts.isPropertyAssignment(property) && nameOf(property.name) === 'common') {
      commonCount++
      requirePattern(ts.isObjectLiteralExpression(property.initializer), 'root common object')
      return ts.factory.updatePropertyAssignment(property, property.name, ts.factory.updateObjectLiteralExpression(property.initializer,
        [ts.factory.createShorthandPropertyAssignment('fileCompresserBudget'), ...property.initializer.properties]))
    }
    if (ts.isPropertyAssignment(property) && nameOf(property.name) === 'parsedType') {
      typeCount++
      return ts.factory.updatePropertyAssignment(property, property.name, ts.factory.createConditionalExpression(
        ts.factory.createIdentifier('fileCompresserInputLimit'), undefined, ts.factory.createStringLiteral('unknown'), undefined, property.initializer))
    }
    return property
  })
  requirePattern(commonCount === 1 && typeCount === 1, 'root common/parsedType fields')
  const updatedContext = ts.factory.updateVariableStatement(contextStatement, contextStatement.modifiers,
    ts.factory.updateVariableDeclarationList(contextStatement.declarationList, [ts.factory.updateVariableDeclaration(
      declaration, declaration.name, declaration.exclamationToken, declaration.type,
      ts.factory.updateObjectLiteralExpression(declaration.initializer, properties))]))
  let tail = statements.slice(1)
  if (standard) {
    let catches = 0, resets = 0
    const rewriteFallback = candidate => {
      if (ts.isCatchClause(candidate)) {
        catches++
        const errorName = nameOf(candidate.variableDeclaration?.name)
        requirePattern(errorName, 'standard catch binding')
        const rejectSentinel = generatedStatements(`if (${errorName} === ${securityName}.CMS_VALIDATION_ISSUE_LIMIT) throw ${errorName};`)
        return ts.factory.updateCatchClause(candidate, candidate.variableDeclaration,
          ts.factory.updateBlock(candidate.block, [...rejectSentinel, ...candidate.block.statements.map(statement => ts.visitNode(statement, rewriteFallback))]))
      }
      if (ts.isBinaryExpression(candidate) && candidate.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(candidate.left) && nameOf(candidate.left.expression) === 'ctx'
        && candidate.left.name.text === 'common') {
        resets++
        requirePattern(ts.isObjectLiteralExpression(candidate.right), 'standard common reset')
        return ts.factory.updateBinaryExpression(candidate, candidate.left, candidate.operatorToken,
          ts.factory.updateObjectLiteralExpression(candidate.right,
            [ts.factory.createShorthandPropertyAssignment('fileCompresserBudget'), ...candidate.right.properties]))
      }
      return ts.visitEachChild(candidate, rewriteFallback, context)
    }
    tail = tail.map(statement => ts.visitNode(statement, rewriteFallback))
    requirePattern(catches === 1 && resets === 1, 'standard fallback count')
    const last = tail[tail.length - 1]
    requirePattern(ts.isReturnStatement(last) && last.expression && ts.isCallExpression(last.expression)
      && callName(last.expression.expression) === 'then', 'standard async return')
    const reject = generatedStatements(`const reject = fileCompresserError => {
      if (fileCompresserError !== ${securityName}.CMS_VALIDATION_ISSUE_LIMIT) throw fileCompresserError;
      return fileCompresserResourceFailure('issues');
    };`)[0].declarationList.declarations[0].initializer
    tail[tail.length - 1] = ts.factory.updateReturnStatement(last, ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(last.expression, 'catch'), undefined, [reject]))
  } else {
    const resultReturns = tail.filter(statement => ts.isReturnStatement(statement) && statement.expression
      && ts.isCallExpression(statement.expression) && callName(statement.expression.expression) === 'handleResult')
    requirePattern(resultReturns.length === 1, `${nameOf(node.name)} handleResult return`)
  }
  const prefix = generatedStatements(`const fileCompresserInputLimit = ${securityName}.inspectCmsValidationInput(data);
    const fileCompresserBudget = ${securityName}.createCmsValidationBudget();`)
  const failure = generatedStatements(`const fileCompresserResourceFailure = reason => {
    const issues = [{ ...${securityName}.cmsResourceIssue(reason), path: [...ctx.path] }];
    ctx.common.issues = issues;
    ${standard ? 'const result = { issues: [...issues] }; return ctx.common.async ? Promise.resolve(result) : result;' : 'return handleResult({ ...ctx, common: { ...ctx.common, issues: [...issues] } }, { status: "aborted" });'}
  };
  if (fileCompresserInputLimit) return fileCompresserResourceFailure(fileCompresserInputLimit.reason);`)
  const catcher = generatedStatements(`try {} catch (fileCompresserError) {
    if (fileCompresserError !== ${securityName}.CMS_VALIDATION_ISSUE_LIMIT) throw fileCompresserError;
    return fileCompresserResourceFailure('issues');
  }`)[0]
  const guarded = ts.factory.updateTryStatement(catcher, ts.factory.createBlock(tail, true), catcher.catchClause, undefined)
  return updateMethod(node, ts.factory.createBlock([...prefix, updatedContext, ...failure, guarded], true))
}

/** Transform only reviewed 3.25.76 compiled JS; callers must also pin original/after hashes. */
export function transformZodTypes(source, format = 'esm') {
  assertFormat(format)
  requirePattern(!source.includes('fileCompresser'), 'already transformed/reserved identifier')
  const file = parse(source, `types.${format === 'cjs' ? 'cjs' : 'js'}`)
  const classes = classMap(file)
  for (const name of ['ZodType', ...concreteClasses]) requirePattern(classes.has(name), `${name} class`)
  const actualConcrete = [...classes.values()].filter(node => node.members.some(member => ts.isMethodDeclaration(member) && nameOf(member.name) === '_parse'))
  requirePattern(actualConcrete.length === concreteClasses.length
    && actualConcrete.every(node => concreteClasses.includes(node.name.text)), '36 concrete parser classes')
  const changed = ts.transform(file, [context => root => {
    const statements = root.statements.map(statement => {
      if (!ts.isClassDeclaration(statement) || !statement.name) return statement
      const className = statement.name.text
      if (className === 'ZodType') {
        for (const name of ['safeParse', 'safeParseAsync', '~validate', '_parseAsync']) method(statement, name)
        const members = statement.members.map(member => {
          if (!ts.isMethodDeclaration(member)) return member
          const name = nameOf(member.name)
          if (name === 'safeParse' || name === 'safeParseAsync' || name === '~validate') return rewriteRootMethod(member, name === '~validate', context)
          if (name === '_parseAsync') {
            requirePattern(member.body.statements.length === 2
              && nodesMatching(member.body, node => ts.isCallExpression(node) && callName(node.expression) === '_parse').length === 1
              && nodesMatching(member.body, node => ts.isCallExpression(node) && callName(node.expression) === 'resolve').length === 1, '_parseAsync body')
            const modifiers = [...(member.modifiers || []).filter(modifier => modifier.kind !== ts.SyntaxKind.AsyncKeyword), ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)]
            return updateMethod(member, ts.factory.createBlock(generatedStatements('return this._parse(input);'), true), modifiers)
          }
          return member
        })
        return ts.factory.updateClassDeclaration(statement, statement.modifiers, statement.name, statement.typeParameters, statement.heritageClauses, members)
      }
      if (!concreteClasses.includes(className)) return statement
      const parser = method(statement, '_parse')
      const bounded = className === 'ZodArray' || className === 'ZodSet' ? patchUpperBounds(parser, className, context, file)
        : className === 'ZodEffects' ? observeEffectProbes(parser, context) : parser
      const wrapped = observeParseMethod(bounded)
      return ts.factory.updateClassDeclaration(statement, statement.modifiers, statement.name, statement.typeParameters,
        statement.heritageClauses, statement.members.map(member => member === parser ? wrapped : member))
    })
    const observer = generatedStatements(`function fileCompresserObserveParsePromise(result) {
      if (result instanceof Promise) result.catch(() => {});
      return result;
    }`)
    return ts.factory.updateSourceFile(root, insertAfterDirectives(statements,
      [importStatement(format, './filecompresser-resources'), ...observer]))
  }])
  try { return print(changed.transformed[0], changed.transformed[0].statements) } finally { changed.dispose() }
}

export function transformZodParseUtil(source, format = 'esm') {
  assertFormat(format)
  requirePattern(!source.includes('fileCompresser'), 'already transformed/reserved identifier')
  const file = parse(source, 'parseUtil.js')
  const functions = file.statements.filter(node => ts.isFunctionDeclaration(node) && nameOf(node.name) === 'addIssueToContext')
  requirePattern(functions.length === 1, 'addIssueToContext declaration count')
  const original = functions[0]
  requirePattern(original.body && nameOf(original.parameters[0]?.name) === 'ctx'
    && nameOf(original.parameters[1]?.name) === 'issueData'
    && nodesMatching(original.body, node => ts.isCallExpression(node) && callName(node.expression) === 'makeIssue').length === 1, 'addIssueToContext body')
  const body = ts.factory.updateBlock(original.body,
    [...generatedStatements(`${securityName}.consumeCmsValidationIssue(ctx);`), ...original.body.statements])
  const updated = ts.factory.updateFunctionDeclaration(original, original.modifiers, original.asteriskToken, original.name,
    original.typeParameters, original.parameters, original.type, body)
  return print(file, insertAfterDirectives(file.statements.map(statement => statement === original ? updated : statement),
    [importStatement(format, '../filecompresser-resources')]))
}

export function resourceModuleSource(format = 'esm') {
  assertFormat(format)
  const source = readFileSync(new URL('./resource-limits.mjs', import.meta.url), 'utf8')
  const file = parse(source, 'resource-limits.mjs')
  const exported = file.statements.filter(statement => statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
    .flatMap(statement => ts.isFunctionDeclaration(statement) ? [nameOf(statement.name)]
      : ts.isVariableStatement(statement) ? statement.declarationList.declarations.map(declaration => nameOf(declaration.name)) : [])
  requirePattern(exported.length === resourceExports.length && resourceExports.every(name => exported.includes(name))
    && !file.statements.some(ts.isImportDeclaration), 'standalone resource helper exports')
  return format === 'esm' ? source : `${source.replace(/^export /gm, '')}\nmodule.exports = { ${resourceExports.join(', ')} };\n`
}
