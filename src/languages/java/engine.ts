import type Parser from 'tree-sitter';
import { type SyntaxNode as SyntaxNodeType } from 'tree-sitter';
import Java from 'tree-sitter-java';

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

const JAVA_EXTENSION = '.java';

function matchesJavaFilePath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(JAVA_EXTENSION);
}

function createJavaParser(): Parser {
  return createConfiguredParser(Java);
}

function getAnnotations(node: SyntaxNodeType): string[] {
  const annotations: string[] = [];
  for (const child of node.children) {
    if (child.type === 'marker_annotation' || child.type === 'annotation') {
      annotations.push(child.text);
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
    if (child.type === 'marker_annotation' || child.type === 'annotation') {
      const annotationLine = child.startPosition.row + 1;
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
      if (child.type === 'marker_annotation' || child.type === 'annotation') {
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
  const identifierNode = node.childForFieldName('name');
  if (identifierNode) {
    return identifierNode.text;
  }
  const fallback = node.children.find(
    (child) => child.type === 'identifier' || child.type === 'type_identifier'
  );
  return fallback?.text ?? null;
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
  return modifiers.join(' ');
}

function getTypeParameters(node: SyntaxNodeType): string | null {
  const typeParams = node.childForFieldName('type_parameters');
  if (!typeParams) {
    return null;
  }
  return typeParams.text;
}

function buildSignatureWithGenerics(baseSignature: string, typeParams: string | null): string {
  if (typeParams !== null && typeParams !== '') {
    return `${typeParams} ${baseSignature}`;
  }
  return baseSignature;
}

function parseMethodDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const typeParams = getTypeParameters(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const parameters = node.childForFieldName('parameters');
  const returnType = node.childForFieldName('type');
  const throwsClause = node.childForFieldName('throws');

  let signature = '';
  let paramText = '';
  if (parameters) {
    const paramsNodeText = parameters.text;
    paramText = paramsNodeText.replace(/^\(|\)$/g, '');
  }

  if (returnType) {
    signature = `${returnType.text} ${name}(${paramText})`;
  } else {
    signature = `${name}(${paramText})`;
  }

  if (throwsClause) {
    signature += ` throws ${throwsClause.text}`;
  }

  signature = buildSignatureWithGenerics(signature, typeParams);

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'method',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseConstructorDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const typeParams = getTypeParameters(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const parameters = node.childForFieldName('parameters');
  const throwsClause = node.childForFieldName('throws');

  let paramText = '';
  if (parameters) {
    const paramsNodeText = parameters.text;
    paramText = paramsNodeText.replace(/^\(|\)$/g, '');
  }

  let signature = `${name}(${paramText})`;

  if (throwsClause) {
    signature += ` throws ${throwsClause.text}`;
  }

  signature = buildSignatureWithGenerics(signature, typeParams);

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'constructor',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseFieldDeclaration(node: SyntaxNodeType): ParsedDeclaration[] {
  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const declarators = node.children.filter((c) => c.type === 'variable_declarator');

  if (declarators.length === 0) {
    return [];
  }

  const typeNode = node.childForFieldName('type');
  const type = typeNode?.text ?? '';
  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  const declarations: ParsedDeclaration[] = [];

  for (const declarator of declarators) {
    const nameNode = declarator.children.find((c) => c.type === 'identifier');
    if (nameNode === undefined) {
      continue;
    }

    const name = nameNode.text;
    const signature = type ? `${type} ${name}` : name;

    declarations.push({
      kind: 'field',
      name,
      modifiers: fullModifiers,
      signature,
      startLine,
      endLine,
      startColumn,
      endColumn
    });
  }

  return declarations;
}

function parseClassDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const typeParams = getTypeParameters(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const superclass = node.childForFieldName('superclass');
  const interfaces = node.childForFieldName('interfaces');
  const permits = node.childForFieldName('permits');

  let signature = `class ${name}`;
  if (typeParams !== null && typeParams !== '') {
    signature = `class ${name}${typeParams}`;
  }

  if (superclass) {
    signature += ` ${superclass.text}`;
  }
  if (interfaces) {
    signature += ` ${interfaces.text}`;
  }
  if (permits) {
    signature += ` ${permits.text}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'class',
    name,
    modifiers: fullModifiers,
    signature: signature.trim(),
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseInterfaceDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const typeParams = getTypeParameters(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const extendsClause = node.childForFieldName('extends_interfaces');
  const permits = node.childForFieldName('permits');

  let signature = `interface ${name}`;
  if (typeParams !== null && typeParams !== '') {
    signature = `interface ${name}${typeParams}`;
  }

  if (extendsClause) {
    signature += ` ${extendsClause.text}`;
  }

  if (permits) {
    signature += ` ${permits.text}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'interface',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseEnumDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const interfaces = node.childForFieldName('super_interfaces');

  let signature = `enum ${name}`;
  if (interfaces) {
    signature += ` ${interfaces.text}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'enum',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseEnumConstant(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const { startColumn, endColumn } = getColumnSpan(node, false);

  return {
    kind: 'enum-constant',
    name,
    modifiers: '',
    signature: '',
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseAnnotationDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'annotation-type',
    name,
    modifiers: fullModifiers,
    signature: '',
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseAnnotationMethodDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const returnType =
    node.childForFieldName('type') ?? node.children.find((c) => c.type === 'type_identifier');
  const defaultValueNode =
    node.childForFieldName('default') ?? node.children.find((c) => c.type === 'default');

  let signature = '';
  if (returnType) {
    signature = `${returnType.text} ${name}()`;
  } else {
    signature = `${name}()`;
  }

  if (defaultValueNode) {
    const valueNode = defaultValueNode.nextNamedSibling;
    if (valueNode) {
      signature += ` default ${valueNode.text}`;
    }
  }

  return {
    kind: 'annotation-method',
    name,
    modifiers: '',
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseRecordDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const parameters = node.childForFieldName('parameters');
  const interfaces = node.childForFieldName('interfaces');

  let signature = '';
  if (parameters) {
    signature = parameters.text;
  }
  if (interfaces) {
    const ifaceText = normalizeWhitespace(interfaces.text);
    signature += signature ? ` implements ${ifaceText}` : `implements ${ifaceText}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'record',
    name,
    modifiers: fullModifiers,
    signature: signature ? `record ${name} ${signature}` : `record ${name}`,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseCompactConstructorDeclaration(node: SyntaxNodeType): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const annotations = getAnnotationsText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const throwsClause = node.childForFieldName('throws');

  let signature = `${name}()`;

  if (throwsClause) {
    signature += ` throws ${throwsClause.text}`;
  }

  const fullModifiers = annotations ? `${annotations} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'compact-constructor',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

type JavaDeclarationParserResult = ParsedDeclaration | ParsedDeclaration[] | null;

type JavaDeclarationParser = (node: SyntaxNodeType) => JavaDeclarationParserResult;

const JAVA_DECLARATION_PARSERS: Readonly<Record<string, JavaDeclarationParser>> = {
  class_declaration: parseClassDeclaration,
  interface_declaration: parseInterfaceDeclaration,
  enum_declaration: parseEnumDeclaration,
  annotation_type_declaration: parseAnnotationDeclaration,
  method_declaration: parseMethodDeclaration,
  constructor_declaration: parseConstructorDeclaration,
  field_declaration: parseFieldDeclaration,
  record_declaration: parseRecordDeclaration,
  compact_constructor_declaration: parseCompactConstructorDeclaration
};

const JAVA_BODY_PARSERS: Readonly<Record<string, JavaDeclarationParser>> = {
  ...JAVA_DECLARATION_PARSERS,
  enum_constant: parseEnumConstant,
  annotation_type_element_declaration: parseAnnotationMethodDeclaration
};

function toJavaDeclarationList(result: JavaDeclarationParserResult): ParsedDeclaration[] {
  if (result === null) {
    return [];
  }

  return Array.isArray(result) ? result : [result];
}

function parseClassBody(node: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];
  const body = node.childForFieldName('body');
  if (!body) {
    return declarations;
  }

  for (const child of body.children) {
    const parserFn = JAVA_BODY_PARSERS[child.type];
    if (parserFn === undefined) {
      continue;
    }
    for (const decl of toJavaDeclarationList(parserFn(child))) {
      if (
        child.type === 'class_declaration' ||
        child.type === 'interface_declaration' ||
        child.type === 'enum_declaration' ||
        child.type === 'record_declaration'
      ) {
        const nestedMembers = parseClassBody(child);
        declarations.push({ ...decl, members: nestedMembers });
      } else {
        declarations.push(decl);
      }
    }
  }

  return declarations;
}

function parseEnumBody(node: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];
  const body = node.childForFieldName('body');
  if (!body) {
    return declarations;
  }

  for (const child of body.children) {
    if (child.type === 'enum_constant') {
      const decl = parseEnumConstant(child);
      if (decl !== null) {
        declarations.push(decl);
      }
      continue;
    }

    if (child.type === 'enum_body_declarations') {
      for (const grandchild of child.children) {
        const parserFn = JAVA_DECLARATION_PARSERS[grandchild.type];
        if (parserFn === undefined) {
          continue;
        }
        for (const decl of toJavaDeclarationList(parserFn(grandchild))) {
          declarations.push(decl);
        }
      }
      continue;
    }

    const parserFn = JAVA_DECLARATION_PARSERS[child.type];
    if (parserFn === undefined) {
      continue;
    }
    for (const decl of toJavaDeclarationList(parserFn(child))) {
      declarations.push(decl);
    }
  }

  return declarations;
}

function parseAnnotationBody(node: SyntaxNodeType): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];
  const body =
    node.childForFieldName('body') ?? node.children.find((c) => c.type === 'annotation_type_body');
  if (!body) {
    return declarations;
  }

  for (const child of body.children) {
    if (child.type === 'annotation_type_element_declaration') {
      const decl = parseAnnotationMethodDeclaration(child);
      if (decl !== null) {
        declarations.push(decl);
      }
    }
  }

  return declarations;
}

function parseJavaDeclarations(content: string): ParsedDeclaration[] {
  const parser = createJavaParser();
  const tree = parser.parse(content);
  const declarations: ParsedDeclaration[] = [];

  const rootNode = tree.rootNode;

  for (const node of rootNode.children) {
    const nodeType = node.type;

    if (
      nodeType === 'comment' ||
      nodeType === 'package_declaration' ||
      nodeType === 'import_declaration'
    ) {
      continue;
    }

    if (
      nodeType === 'class_declaration' ||
      nodeType === 'interface_declaration' ||
      nodeType === 'record_declaration'
    ) {
      const parserFn = JAVA_DECLARATION_PARSERS[nodeType];
      const decl = parserFn ? toJavaDeclarationList(parserFn(node))[0] : null;
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

    if (nodeType === 'enum_declaration') {
      const decl = parseEnumDeclaration(node);
      if (decl) {
        const members = parseEnumBody(node);
        if (members.length > 0) {
          declarations.push({ ...decl, members });
        } else {
          declarations.push(decl);
        }
      }
      continue;
    }

    if (nodeType === 'annotation_type_declaration') {
      const decl = parseAnnotationDeclaration(node);
      if (decl) {
        const members = parseAnnotationBody(node);
        if (members.length > 0) {
          declarations.push({ ...decl, members });
        } else {
          declarations.push(decl);
        }
      }
      continue;
    }

    const parserFn = JAVA_DECLARATION_PARSERS[nodeType];
    if (parserFn === undefined) {
      continue;
    }

    for (const decl of toJavaDeclarationList(parserFn(node))) {
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

    if (trimmed.startsWith('package ') || trimmed.startsWith('import ')) {
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
      if (trimmed === '') {
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

function generateJavaOutline(options: OutlineOptions): OutlineResult {
  const { filePath, content } = options;
  const declarations = parseJavaDeclarations(content);

  const headerComment = extractHeaderComment(content);

  const lines: OutlineLine[] = [{ kind: 'file-path', text: filePath }];

  lines.push(...buildHeaderCommentOutlineLines(headerComment));
  lines.push(...buildDeclarationOutlineLines(declarations));

  return createOutlineResult(lines, headerComment?.joinedText ?? null);
}

function extractJavaSummary(content: string): SummaryResult {
  const headerComment = extractHeaderComment(content);
  return { summary: headerComment?.joinedText ?? null };
}

export const javaLanguageEngine: OutlineLanguageEngine = {
  id: 'java',
  matchesFilePath: matchesJavaFilePath,
  generateOutline: generateJavaOutline,
  extractSummary: extractJavaSummary
};
