import type Parser from 'tree-sitter';
import { type SyntaxNode as SyntaxNodeType } from 'tree-sitter';
import Kotlin from '@tree-sitter-grammars/tree-sitter-kotlin';

import type { OutlineLanguageEngine, SummaryResult } from '../../core/language-engine.js';
import type {
  OutlineLine,
  OutlineOptions,
  OutlineResult,
  ParsedDeclaration
} from '../../core/types.js';
import { normalizeWhitespace } from '../../core/formatter.js';
import { createOutlineResult } from '../../core/outline-renderer.js';
import { buildDeclarationOutlineLines } from '../../core/declaration-lines.js';
import { buildHeaderCommentOutlineLines } from '../../core/header-comment-lines.js';
import { createConfiguredParser } from '../shared/parser-factory.js';

const KOTLIN_EXTENSIONS = ['.kt', '.kts'];

function matchesKotlinFilePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return KOTLIN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function createKotlinParser(): Parser {
  return createConfiguredParser(Kotlin);
}

function getAnnotations(node: SyntaxNodeType): string[] {
  const annotations: string[] = [];

  for (const child of node.children) {
    if (child.type === 'annotation') {
      annotations.push(child.text);
    } else if (child.type === 'annotated_expression') {
      const nestedAnnotations = getAnnotations(child);
      annotations.push(...nestedAnnotations);
    }
  }

  return annotations;
}

function getAnnotationsText(node: SyntaxNodeType): string {
  const annotations = getAnnotations(node);
  return annotations.join(' ');
}

function getStartLineWithAnnotations(node: SyntaxNodeType): number {
  let minLine = node.startPosition.row + 1;

  for (const child of node.children) {
    if (child.type === 'annotation' || child.type === 'annotated_expression') {
      const annotationLine = getStartLineWithAnnotations(child);
      if (annotationLine < minLine) {
        minLine = annotationLine;
      }
    }
  }

  return minLine;
}

function getNodeLineRange(node: SyntaxNodeType): { startLine: number; endLine: number } {
  const startLine = getStartLineWithAnnotations(node);
  return {
    startLine,
    endLine: node.endPosition.row + 1
  };
}

function getColumnSpan(
  node: SyntaxNodeType,
  includeAnnotations = true
): { startColumn: number; endColumn: number } {
  let startNode: SyntaxNodeType = node;

  if (includeAnnotations) {
    for (const child of node.children) {
      if (child.type === 'annotation' || child.type === 'annotated_expression') {
        startNode = child;
        break;
      }
    }
  }

  return {
    startColumn: startNode.startPosition.column + 1,
    endColumn: node.endPosition.column + 1
  };
}

function getIdentifier(node: SyntaxNodeType): string | null {
  const identifierNode = node.children.find(
    (child) => child.type === 'identifier' || child.type === 'type_identifier'
  );
  return identifierNode?.text ?? null;
}

function getModifiers(node: SyntaxNodeType): string {
  const modifiers: string[] = [];

  for (const child of node.children) {
    if (child.type === 'modifiers') {
      for (const modifierChild of child.children) {
        const text = modifierChild.text.trim();
        if (text && text !== '') {
          modifiers.push(text);
        }
      }
    }
  }

  const typeParameters = node.children.find((c) => c.type === 'type_parameters');
  if (typeParameters) {
    for (const tpChild of typeParameters.children) {
      if (tpChild.type === 'type_parameter') {
        for (const tpModChild of tpChild.children) {
          if (tpModChild.type === 'type_parameter_modifiers') {
            for (const tpmChild of tpModChild.children) {
              if (tpmChild.type === 'reification_modifier') {
                modifiers.push('reified');
              }
            }
          }
        }
      }
    }
  }

  return modifiers.join(' ');
}

function getClassKind(node: SyntaxNodeType): { kind: string; modifiers: string } {
  let kind = 'class';
  let additionalModifiers = '';

  for (const child of node.children) {
    if (child.type === 'interface') {
      kind = 'interface';
    }
    if (child.type === 'enum') {
      kind = 'enum';
    }
    if (child.type === 'sealed') {
      additionalModifiers = 'sealed ';
    }
    if (child.type === 'value') {
      additionalModifiers += 'value ';
    }
  }

  return { kind, modifiers: additionalModifiers };
}

function parseFunctionDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const parameters =
    node.childForFieldName('parameters') ??
    node.children.find((c) => c.type === 'function_value_parameters');

  const returnTypeCandidates = node.children.filter(
    (c) => c.type === 'user_type' || c.type === 'type'
  );

  const dotIndex = node.children.findIndex((c) => c.text === '.');
  const returnType =
    dotIndex === -1
      ? returnTypeCandidates[returnTypeCandidates.length - 1]
      : returnTypeCandidates.find((c) => node.children.indexOf(c) > dotIndex);

  const receiverNode =
    dotIndex !== -1
      ? node.children.find((c) => c.type === 'user_type' && node.children.indexOf(c) < dotIndex)
      : null;

  let paramText = '';
  if (parameters) {
    const paramsText = normalizeWhitespace(parameters.text);
    paramText = paramsText.replace(/^\(|\)$/g, '');
  }

  let signature = '';
  if (returnType) {
    signature = paramText
      ? `fun ${name}(${paramText}): ${returnType.text}`
      : `fun ${name}(): ${returnType.text}`;
  } else {
    signature = paramText ? `fun ${name}(${paramText})` : `fun ${name}()`;
  }

  if (receiverNode) {
    signature = `fun ${receiverNode.text}.${signature.slice(4)}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  const declaration: ParsedDeclaration = {
    kind: 'fun',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };

  const localMembers = parseNestedDeclarations(node);
  if (localMembers.length > 0) {
    declaration.members = localMembers;
  }

  return declaration;
}

function parseClassDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { kind, modifiers: classModifier } = getClassKind(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const typeParameters =
    node.childForFieldName('type_parameters') ??
    node.children.find((c) => c.type === 'type_parameters');
  const primaryConstructor =
    node.childForFieldName('primary_constructor') ??
    node.children.find((c) => c.type === 'primary_constructor');
  const delegationSpecifiers = node.children.find((c) => c.type === 'delegation_specifiers');

  let signature = `${classModifier}${kind} ${name}`;

  if (typeParameters) {
    signature = `${classModifier}${kind} ${normalizeWhitespace(typeParameters.text)} ${name}`;
  }

  if (primaryConstructor) {
    const params = primaryConstructor.children.find((c) => c.type === 'class_parameters');
    if (params) {
      const paramsText = normalizeWhitespace(params.text);
      signature += paramsText;
    }
  }

  if (delegationSpecifiers) {
    signature += ` : ${normalizeWhitespace(delegationSpecifiers.text)}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind,
    name,
    modifiers: fullModifiers,
    signature: signature.trim(),
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseObjectDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const delegationSpecifiers = node.children.find((c) => c.type === 'delegation_specifiers');

  let signature = `object ${name}`;
  if (delegationSpecifiers) {
    signature += ` : ${normalizeWhitespace(delegationSpecifiers.text)}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'object',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseCompanionObject(node: SyntaxNodeType): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const nameNode = node.children.find((c) => c.type === 'identifier');
  const name = nameNode?.text ?? 'Companion';

  const delegationSpecifiers = node.children.find((c) => c.type === 'delegation_specifiers');

  let signature = `companion object ${name}`;
  if (delegationSpecifiers) {
    signature += ` : ${normalizeWhitespace(delegationSpecifiers.text)}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'companion',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parsePropertyDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const valOrVar = node.children.find((c) => c.type === 'val' || c.type === 'var');
  const kind = valOrVar?.type ?? 'val';

  const declarators = node.children.filter(
    (c) => c.type === 'property_declarator' || c.type === 'variable_declaration'
  );

  if (declarators.length === 0) {
    const nameNode = node.children.find((c) => c.type === 'identifier');
    if (nameNode === undefined) {
      return null;
    }

    const name = nameNode.text;
    const typeNode = node.children.find((c) => c.type === 'user_type' || c.type === 'type');
    const delegateNode = node.children.find((c) => c.type === 'property_delegate');

    let signature = '';
    if (typeNode) {
      signature = `${kind} ${name}: ${typeNode.text}`;
    } else {
      signature = kind + ' ' + name;
    }
    if (delegateNode) {
      const delegateText = normalizeWhitespace(delegateNode.text);
      signature += ` ${delegateText}`;
    }

    const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

    return {
      kind,
      name,
      modifiers: fullModifiers,
      signature: signature.trim(),
      startLine,
      endLine,
      startColumn,
      endColumn
    };
  }

  const firstDeclarator = declarators[0];
  const nameNode = firstDeclarator?.children.find((c) => c.type === 'identifier');
  if (nameNode === undefined) {
    return null;
  }

  const name = nameNode.text;
  const typeNode = firstDeclarator?.children.find(
    (c) => c.type === 'user_type' || c.type === 'type'
  );
  const delegateNode = node.children.find((c) => c.type === 'property_delegate');

  let signature = '';
  if (typeNode) {
    signature = `${kind} ${name}: ${typeNode.text}`;
  } else {
    signature = kind + ' ' + name;
  }
  if (delegateNode) {
    const delegateText = normalizeWhitespace(delegateNode.text);
    signature += ` ${delegateText}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind,
    name,
    modifiers: fullModifiers,
    signature: signature.trim(),
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseSecondaryConstructor(node: SyntaxNodeType): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const parameters = node.children.find((c) => c.type === 'function_value_parameters');
  const delegationCall = node.children.find((c) => c.type === 'constructor_delegation_call');

  let paramText = '';
  if (parameters) {
    const paramsText = normalizeWhitespace(parameters.text);
    paramText = paramsText.replace(/^\(|\)$/g, '');
  }

  let signature = `constructor(${paramText})`;
  if (delegationCall) {
    signature += ` : ${normalizeWhitespace(delegationCall.text)}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'constructor',
    name: 'constructor',
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseInitBlock(node: SyntaxNodeType): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);
  const { startColumn, endColumn } = getColumnSpan(node, false);

  return {
    kind: 'init',
    name: 'init',
    modifiers: '',
    signature: 'init',
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseTypeAlias(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const typeParameters =
    node.childForFieldName('type_parameters') ??
    node.children.find((c) => c.type === 'type_parameters');

  const typeNode = node.children.find(
    (c) => c.type === 'user_type' || c.type === 'function_type' || c.type === 'type'
  );

  let signature = `typealias ${name}`;
  if (typeParameters) {
    signature = `typealias ${normalizeWhitespace(typeParameters.text)} ${name}`;
  }
  if (typeNode) {
    signature += ` = ${typeNode.text}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'typealias',
    name,
    modifiers: fullModifiers,
    signature: signature.trim(),
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseEnumEntry(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const { startColumn, endColumn } = getColumnSpan(node, false);

  const enumEntryBody = node.children.find((c) => c.type === 'class_body');
  const members = enumEntryBody ? parseClassBody(enumEntryBody) : [];

  const declaration: ParsedDeclaration = {
    kind: 'enum-entry',
    name,
    modifiers: '',
    signature: '',
    startLine,
    endLine,
    startColumn,
    endColumn
  };

  if (members.length > 0) {
    declaration.members = members;
  }

  return declaration;
}

function parseObjectLiteral(node: SyntaxNodeType): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);
  const { startColumn, endColumn } = getColumnSpan(node, false);

  const delegationSpecifiers = node.children.find((c) => c.type === 'delegation_specifiers');
  const objectBody = node.children.find((c) => c.type === 'class_body');
  const members = objectBody ? parseClassBody(objectBody) : [];

  let signature = 'object';
  if (delegationSpecifiers) {
    signature += ` : ${normalizeWhitespace(delegationSpecifiers.text)}`;
  }

  const declaration: ParsedDeclaration = {
    kind: 'object-literal',
    name: 'object',
    modifiers: '',
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };

  if (members.length > 0) {
    declaration.members = members;
  }

  return declaration;
}

type KotlinDeclarationParser = (node: SyntaxNodeType) => ParsedDeclaration | null;

const KOTLIN_DECLARATION_PARSERS: Readonly<Record<string, KotlinDeclarationParser>> = {
  class_declaration: parseClassDeclaration,
  object_declaration: parseObjectDeclaration,
  function_declaration: parseFunctionDeclaration,
  property_declaration: parsePropertyDeclaration,
  type_alias: parseTypeAlias,
  object_literal: parseObjectLiteral
};

const KOTLIN_BODY_PARSERS: Readonly<Record<string, KotlinDeclarationParser>> = {
  ...KOTLIN_DECLARATION_PARSERS,
  secondary_constructor: parseSecondaryConstructor,
  companion_object: parseCompanionObject,
  enum_entry: parseEnumEntry,
  init_statement: parseInitBlock
};

function parseClassBody(node: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];
  const body =
    node.childForFieldName('body') ??
    node.children.find((c) => c.type === 'class_body' || c.type === 'enum_class_body');
  if (!body) {
    return declarations;
  }

  for (const child of body.children) {
    if (child.type === 'anonymous_initializer') {
      const decl = parseInitBlock(child);
      if (decl !== null) {
        declarations.push(decl);
      }
      continue;
    }

    const parserFn = KOTLIN_BODY_PARSERS[child.type];
    if (parserFn === undefined) {
      continue;
    }
    const decl = parserFn(child);
    if (decl !== null) {
      if (child.type === 'companion_object') {
        const companionMembers = parseClassBody(child);
        declarations.push({ ...decl, members: companionMembers });
      } else if (child.type === 'class_declaration' || child.type === 'object_declaration') {
        const nestedMembers = parseClassBody(child);
        declarations.push({ ...decl, members: nestedMembers });
      } else {
        declarations.push(decl);
      }
    }
  }

  return declarations;
}

function findObjectLiterals(node: SyntaxNodeType): SyntaxNodeType[] {
  const results: SyntaxNodeType[] = [];

  function traverse(n: SyntaxNodeType): void {
    if (n.type === 'object_literal') {
      results.push(n);
    }
    for (const child of n.children) {
      traverse(child);
    }
  }

  traverse(node);
  return results;
}

function findLocalClasses(node: SyntaxNodeType): SyntaxNodeType[] {
  const results: SyntaxNodeType[] = [];

  function traverse(n: SyntaxNodeType): void {
    if (n.type === 'class_declaration') {
      results.push(n);
    }
    for (const child of n.children) {
      traverse(child);
    }
  }

  traverse(node);
  return results;
}

function parseNestedDeclarations(node: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];

  for (const child of node.children) {
    const parserFn = KOTLIN_BODY_PARSERS[child.type];
    if (parserFn) {
      const decl = parserFn(child);
      if (decl !== null) {
        if (
          child.type === 'class_declaration' ||
          child.type === 'object_declaration' ||
          child.type === 'object_literal'
        ) {
          const nestedMembers = parseClassBody(child);
          declarations.push({ ...decl, members: nestedMembers });
        } else {
          declarations.push(decl);
        }
      }
      continue;
    }

    if (child.type === 'class_body' || child.type === 'enum_class_body') {
      for (const bodyChild of child.children) {
        const bodyParserFn = KOTLIN_BODY_PARSERS[bodyChild.type];
        if (bodyParserFn === undefined) {
          continue;
        }
        const decl = bodyParserFn(bodyChild);
        if (decl !== null) {
          if (
            bodyChild.type === 'class_declaration' ||
            bodyChild.type === 'object_declaration' ||
            bodyChild.type === 'object_literal'
          ) {
            const nestedMembers = parseClassBody(bodyChild);
            declarations.push({ ...decl, members: nestedMembers });
          } else {
            declarations.push(decl);
          }
        }
      }
    }
  }

  const objectLiterals = findObjectLiterals(node);
  for (const objLit of objectLiterals) {
    const decl = parseObjectLiteral(objLit);
    if (decl !== null) {
      declarations.push(decl);
    }
  }

  const localClasses = findLocalClasses(node);
  for (const localClass of localClasses) {
    const decl = parseClassDeclaration(localClass);
    if (decl !== null) {
      const nestedMembers = parseClassBody(localClass);
      declarations.push({ ...decl, members: nestedMembers });
    }
  }

  return declarations;
}

function parseKotlinDeclarations(content: string): ParsedDeclaration[] {
  const parser = createKotlinParser();
  const tree = parser.parse(content);
  const declarations: ParsedDeclaration[] = [];

  const rootNode = tree.rootNode;

  for (const node of rootNode.children) {
    const nodeType = node.type;

    if (
      nodeType === 'comment' ||
      nodeType === 'package_declaration' ||
      nodeType === 'package_header' ||
      nodeType === 'import_declaration' ||
      nodeType === 'import_header'
    ) {
      continue;
    }

    if (nodeType === 'class_declaration' || nodeType === 'object_declaration') {
      const decl = KOTLIN_DECLARATION_PARSERS[nodeType]?.(node);
      if (decl) {
        const members = parseClassBody(node);
        if (members.length > 0) {
          declarations.push({ ...decl, members });
        } else {
          declarations.push(decl);
        }
      }
      continue;
    }

    if (nodeType === 'annotated_expression') {
      const innerNode = node.children.find(
        (c) =>
          c.type === 'class_declaration' ||
          c.type === 'object_declaration' ||
          c.type === 'function_declaration' ||
          c.type === 'property_declaration'
      );

      if (innerNode) {
        const parserFn = KOTLIN_DECLARATION_PARSERS[innerNode.type];
        if (parserFn) {
          const decl = parserFn(innerNode);
          if (decl) {
            const annotations = getAnnotationsText(node);
            decl.modifiers = annotations
              ? `${annotations} ${decl.modifiers}`.trim()
              : decl.modifiers;
            decl.startLine = getStartLineWithAnnotations(node);

            if (innerNode.type === 'class_declaration' || innerNode.type === 'object_declaration') {
              const members = parseClassBody(innerNode);
              if (members.length > 0) {
                declarations.push({ ...decl, members });
              } else {
                declarations.push(decl);
              }
            } else {
              declarations.push(decl);
            }
          }
        }
      }
      continue;
    }

    const parserFn = KOTLIN_DECLARATION_PARSERS[nodeType];
    if (parserFn === undefined) {
      continue;
    }

    const decl = parserFn(node);
    if (decl !== null) {
      declarations.push(decl);
    }
  }

  return declarations;
}

function extractHeaderComment(
  content: string
): { rawLines: string[]; joinedText: string; startLine: number } | null {
  const lines = content.split('\n');
  const rawLines: string[] = [];
  let startLine = 1;
  let inBlockComment = false;
  let foundComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    const trimmed = line.trim();

    if (
      trimmed.startsWith('package ') ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('as ')
    ) {
      if (!foundComment) {
        continue;
      }
      break;
    }

    if (!inBlockComment && (trimmed.startsWith('//') || trimmed.startsWith('/*'))) {
      if (rawLines.length === 0) {
        startLine = i + 1;
      }
      foundComment = true;
    }

    if (!foundComment) {
      if (trimmed === '' || trimmed.startsWith('@')) {
        continue;
      }
      break;
    }

    if (trimmed.startsWith('//')) {
      rawLines.push(trimmed);
      continue;
    }

    if (trimmed.startsWith('/*')) {
      inBlockComment = true;
      if (trimmed.endsWith('*/')) {
        rawLines.push(trimmed);
        inBlockComment = false;
        break;
      }
      rawLines.push(trimmed);
      continue;
    }

    if (inBlockComment) {
      rawLines.push(trimmed);
      if (trimmed.endsWith('*/')) {
        inBlockComment = false;
        break;
      }
      continue;
    }

    break;
  }

  if (rawLines.length === 0) {
    return null;
  }

  const commentTexts = rawLines.map((line) => {
    if (line.startsWith('//')) {
      return line.slice(2).trim();
    }
    if (line.startsWith('/*')) {
      let cleaned = line
        .replace(/^\/\*\*?/, '')
        .replace(/\*\/$/, '')
        .trim();
      if (cleaned.startsWith('*')) {
        cleaned = cleaned.slice(1).trim();
      }
      return cleaned;
    }
    if (line.startsWith('*')) {
      return line.slice(1).trim();
    }
    return line;
  });

  const joinedText = commentTexts.filter((t) => t.length > 0).join(' ');

  return {
    rawLines,
    joinedText,
    startLine
  };
}

function generateKotlinOutline(options: OutlineOptions): OutlineResult {
  const { filePath, content } = options;
  const declarations = parseKotlinDeclarations(content);

  const headerComment = extractHeaderComment(content);

  const lines: OutlineLine[] = [{ kind: 'file-path', text: filePath }];

  lines.push(...buildHeaderCommentOutlineLines(headerComment));
  lines.push(...buildDeclarationOutlineLines(declarations));

  return createOutlineResult(lines, headerComment?.joinedText ?? null);
}

function extractKotlinSummary(content: string): SummaryResult {
  const headerComment = extractHeaderComment(content);
  return { summary: headerComment?.joinedText ?? null };
}

export const kotlinLanguageEngine: OutlineLanguageEngine = {
  id: 'kotlin',
  matchesFilePath: matchesKotlinFilePath,
  generateOutline: generateKotlinOutline,
  extractSummary: extractKotlinSummary
};
