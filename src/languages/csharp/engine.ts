import type Parser from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp';

import type { OutlineLanguageEngine, SummaryResult } from '../../core/language-engine.js';
import type {
  OutlineLine,
  OutlineOptions,
  OutlineResult,
  ParsedDeclaration
} from '../../core/types.js';
import { createOutlineResult } from '../../core/outline-renderer.js';
import { buildDeclarationOutlineLines } from '../../core/declaration-lines.js';
import { buildHeaderCommentOutlineLines } from '../../core/header-comment-lines.js';
import { createConfiguredParser } from '../shared/parser-factory.js';

const CSHARP_EXTENSION = '.cs';

function matchesCSharpFilePath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(CSHARP_EXTENSION);
}

function createCSharpParser(): Parser {
  return createConfiguredParser(CSharp);
}

function getAttributes(node: ReturnType<Parser['parse']>['rootNode']): string[] {
  const attributes: string[] = [];
  for (const child of node.children) {
    if (child.type === 'attribute') {
      attributes.push(child.text);
    }
  }
  return attributes;
}

function getAttributesText(node: ReturnType<Parser['parse']>['rootNode']): string {
  const attributes = getAttributes(node);
  return attributes.join(' ');
}

function getStartLineWithAttributes(node: ReturnType<Parser['parse']>['rootNode']): number {
  let minLine = node.startPosition.row + 1;
  for (const child of node.children) {
    if (child.type === 'attribute') {
      const attrLine = child.startPosition.row + 1;
      if (attrLine < minLine) {
        minLine = attrLine;
      }
    }
  }
  return minLine;
}

function getNodeLineRange(node: ReturnType<Parser['parse']>['rootNode']): {
  startLine: number;
  endLine: number;
} {
  const startLine = getStartLineWithAttributes(node);
  return {
    startLine,
    endLine: node.endPosition.row + 1
  };
}

function getColumnSpan(
  node: ReturnType<Parser['parse']>['rootNode'],
  includeAttributes = true
): { startColumn: number; endColumn: number } {
  let startNode: ReturnType<Parser['parse']>['rootNode'] = node;

  if (includeAttributes) {
    for (const child of node.children) {
      if (child.type === 'attribute') {
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

function getIdentifier(node: ReturnType<Parser['parse']>['rootNode']): string | null {
  const identifierNode = node.childForFieldName('name');
  if (identifierNode) {
    return identifierNode.text;
  }
  const fallback = node.children.find(
    (child) => child.type === 'identifier' || child.type === 'type_identifier'
  );
  return fallback?.text ?? null;
}

function getModifiers(node: ReturnType<Parser['parse']>['rootNode']): string {
  const modifiers: string[] = [];
  for (const child of node.children) {
    if (child.type === 'modifier') {
      modifiers.push(child.text);
    }
  }
  return modifiers.join(' ');
}

function isExplicitInterfaceImplementation(node: ReturnType<Parser['parse']>['rootNode']): boolean {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) {
    return false;
  }
  const nameText = nameNode.text;
  return nameText.includes('.');
}

function isExtensionMethod(node: ReturnType<Parser['parse']>['rootNode']): boolean {
  const modifiers = getModifiers(node);
  if (!modifiers.includes('static')) {
    return false;
  }

  const parameters = node.childForFieldName('parameters');
  if (!parameters) {
    return false;
  }

  for (const child of parameters.children) {
    if (child.type === 'this_parameter') {
      return true;
    }
  }

  return false;
}

function getTypeParameters(node: ReturnType<Parser['parse']>['rootNode']): string | null {
  const typeParams = node.childForFieldName('type_parameters');
  if (!typeParams) {
    return null;
  }
  return typeParams.text;
}

function parseMethodDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const typeParams = getTypeParameters(node);
  const { startColumn, endColumn } = getColumnSpan(node);
  const isExplicit = isExplicitInterfaceImplementation(node);
  const isExtension = isExtensionMethod(node);

  const parameters = node.childForFieldName('parameters');
  let returnType = node.childForFieldName('return_type') ?? node.childForFieldName('type');
  if (!returnType) {
    const typeNode = node.children.find(
      (c) => c.type === 'predefined_type' || c.type === 'type' || c.type === 'generic_name'
    );
    if (typeNode) {
      returnType = typeNode;
    }
  }

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

  if (typeParams !== null && typeParams !== '') {
    signature = `${typeParams} ${signature}`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  let kind = 'method';
  if (isExplicit) {
    kind = 'explicit-interface-method';
  } else if (isExtension) {
    kind = 'extension-method';
  }

  return {
    kind,
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseConstructorDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const parameters = node.childForFieldName('parameters');

  let paramText = '';
  if (parameters) {
    const paramsNodeText = parameters.text;
    paramText = paramsNodeText.replace(/^\(|\)$/g, '');
  }

  const signature = `${name}(${paramText})`;

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

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

function parsePropertyDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const { startColumn, endColumn } = getColumnSpan(node);
  const isExplicit = isExplicitInterfaceImplementation(node);

  const type = node.childForFieldName('type');

  const accessors = node.childForFieldName('accessors');

  let signature = '';
  if (type) {
    signature = `${type.text} ${name}`;
  } else {
    signature = name;
  }

  if (accessors) {
    const accessorText = accessors.text;
    if (accessorText.includes('=>')) {
      signature += ' =>';
    } else if (accessorText.includes('get') && accessorText.includes('set')) {
      signature += ' { get; set; }';
    } else if (accessorText.includes('get')) {
      signature += ' { get; }';
    } else if (accessorText.includes('set')) {
      signature += ' { set; }';
    }
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  return {
    kind: isExplicit ? 'explicit-interface-property' : 'property',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseFieldDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const variableDeclaration = node.children.find((c) => c.type === 'variable_declaration');
  const type = variableDeclaration?.childForFieldName('type');
  const declarators =
    variableDeclaration?.children.filter((c) => c.type === 'variable_declarator') ?? [];

  if (declarators.length === 0) {
    return null;
  }

  const firstDeclarator = declarators[0];
  const nameNode =
    firstDeclarator?.childForFieldName('name') ??
    firstDeclarator?.children.find((c) => c.type === 'identifier');
  if (nameNode === undefined) {
    return null;
  }

  const name = nameNode.text;
  const typeText = type?.text ?? '';
  const signature = typeText ? `${typeText} ${name}` : name;

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  const kind = modifiers.includes('const') ? 'constant' : 'field';

  return {
    kind,
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseClassDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const typeParams = getTypeParameters(node);
  const constraintClause = getTypeParameterConstraint(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const baseList = node.childForFieldName('base_list');
  const interfaceList = node.childForFieldName('interface');
  const parameterList = node.children.find((c) => c.type === 'parameter_list');

  let signature = `class ${name}`;
  if (typeParams !== null && typeParams !== '') {
    signature = `class ${name}${typeParams}`;
  }

  if (parameterList) {
    signature += ` ${parameterList.text}`;
  }

  if (baseList) {
    signature += ` ${baseList.text}`;
  }
  if (interfaceList) {
    signature += ` ${interfaceList.text}`;
  }

  if (constraintClause !== null && constraintClause !== '') {
    signature += ` ${constraintClause}`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

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

function parseInterfaceDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const typeParams = getTypeParameters(node);
  const constraintClause = getTypeParameterConstraint(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const baseList = node.childForFieldName('base_list');
  const parameterList = node.children.find((c) => c.type === 'parameter_list');

  let signature = `interface ${name}`;
  if (typeParams !== null && typeParams !== '') {
    signature = `interface ${name}${typeParams}`;
  }

  if (parameterList) {
    signature += ` ${parameterList.text}`;
  }

  if (baseList) {
    signature += ` ${baseList.text}`;
  }

  if (constraintClause !== null && constraintClause !== '') {
    signature += ` ${constraintClause}`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

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

function parseStructDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const typeParams = getTypeParameters(node);
  const constraintClause = getTypeParameterConstraint(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const baseList = node.childForFieldName('base_list');
  const interfaceList = node.childForFieldName('interface');
  const parameterList = node.children.find((c) => c.type === 'parameter_list');

  let signature = `struct ${name}`;
  if (typeParams !== null && typeParams !== '') {
    signature = `struct ${name}${typeParams}`;
  }

  if (parameterList) {
    signature += ` ${parameterList.text}`;
  }

  if (baseList) {
    signature += ` ${baseList.text}`;
  }
  if (interfaceList) {
    signature += ` ${interfaceList.text}`;
  }

  if (constraintClause !== null && constraintClause !== '') {
    signature += ` ${constraintClause}`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'struct',
    name,
    modifiers: fullModifiers,
    signature: signature.trim(),
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseEnumDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const baseList = node.childForFieldName('base_list');

  let signature = `enum ${name}`;
  if (baseList) {
    signature += ` ${baseList.text}`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

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

function parseRecordDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const typeParams = getTypeParameters(node);
  const constraintClause = getTypeParameterConstraint(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const baseList = node.childForFieldName('base_list');
  const parameterList = node.children.find((c) => c.type === 'parameter_list');

  let signature = `record ${name}`;
  if (typeParams !== null && typeParams !== '') {
    signature = `record ${name}${typeParams}`;
  }

  if (parameterList) {
    signature += ` ${parameterList.text}`;
  }

  if (baseList) {
    signature += ` ${baseList.text}`;
  }

  if (constraintClause !== null && constraintClause !== '') {
    signature += ` ${constraintClause}`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'record',
    name,
    modifiers: fullModifiers,
    signature: signature.trim(),
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseDelegateDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const name = getIdentifier(node);
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const typeParams = getTypeParameters(node);
  const constraintClause = getTypeParameterConstraint(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const returnType = node.childForFieldName('return_type');
  const parameters = node.children.find((c) => c.type === 'parameter_list');

  let paramText = '';
  if (parameters) {
    paramText = parameters.text.replace(/^\(|\)$/g, '');
  }

  let signature = '';
  if (returnType) {
    signature = `${returnType.text} ${name}(${paramText})`;
  } else {
    signature = `${name}(${paramText})`;
  }

  if (typeParams !== null && typeParams !== '') {
    signature = `${typeParams} ${signature}`;
  }

  if (constraintClause !== null && constraintClause !== '') {
    signature += ` ${constraintClause}`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'delegate',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseEventDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  let name = getIdentifier(node);
  if (name === null) {
    const varDecl = node.children.find((c) => c.type === 'variable_declaration');
    if (varDecl) {
      const varDeclId = varDecl.children.find((c) => c.type === 'variable_declarator');
      if (varDeclId) {
        const nameNode = varDeclId.children.find((c) => c.type === 'identifier');
        if (nameNode) {
          name = nameNode.text;
        }
      }
    }
  }
  if (name === null) {
    return null;
  }

  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  let type: ReturnType<Parser['parse']>['rootNode'] | null = node.childForFieldName('type');
  if (!type) {
    const varDecl = node.children.find((c) => c.type === 'variable_declaration');
    if (varDecl) {
      const typeNode = varDecl.children.find(
        (c) =>
          c.type === 'identifier' ||
          c.type === 'predefined_type' ||
          c.type === 'generic_name' ||
          c.type === 'type'
      );
      if (typeNode) {
        type = typeNode;
      }
    }
  }

  let signature = '';
  if (type) {
    signature = `event ${type.text} ${name}`;
  } else {
    signature = `event ${name}`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'event',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseIndexerDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const type = node.childForFieldName('type');
  const parameters = node.childForFieldName('parameters');

  let paramText = '';
  if (parameters) {
    paramText = parameters.text.replace(/^\(|\)$/g, '');
  }

  let signature = '';
  if (type) {
    signature = `${type.text} this[${paramText}]`;
  } else {
    signature = `this[${paramText}]`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'indexer',
    name: 'this',
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseOperatorDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const returnType =
    node.childForFieldName('return_type') ??
    node.children.find((c) => c.type === 'identifier') ??
    null;
  const parameters = node.childForFieldName('parameters');

  const operatorSymbol = node.children.find(
    (c) =>
      c.type === 'operator' ||
      (c.type !== 'modifier' &&
        c.type !== 'identifier' &&
        c.type !== 'parameter_list' &&
        c.type !== ';' &&
        c.type !== 'explicit' &&
        c.type !== 'implicit')
  );

  let operatorText = 'operator';
  if (operatorSymbol) {
    operatorText = `operator${operatorSymbol.text}`;
  }

  let paramText = '';
  if (parameters) {
    paramText = parameters.text.replace(/^\(|\)$/g, '');
  }

  let signature = '';
  if (returnType) {
    signature = `${returnType.text} ${operatorText}(${paramText})`;
  } else {
    signature = `${operatorText}(${paramText})`;
  }

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'method',
    name: operatorText,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function parseFinalizerDeclaration(
  node: ReturnType<Parser['parse']>['rootNode']
): ParsedDeclaration | null {
  const { startLine, endLine } = getNodeLineRange(node);
  const modifiers = getModifiers(node);
  const attributes = getAttributesText(node);
  const { startColumn, endColumn } = getColumnSpan(node);

  const nameNode = node.children.find((c) => c.type === 'identifier');
  const name = nameNode ? nameNode.text : 'Finalize';

  const signature = `~${name}()`;

  const fullModifiers = attributes ? `${attributes} ${modifiers}`.trim() : modifiers;

  return {
    kind: 'destructor',
    name,
    modifiers: fullModifiers,
    signature,
    startLine,
    endLine,
    startColumn,
    endColumn
  };
}

function getTypeParameterConstraint(node: ReturnType<Parser['parse']>['rootNode']): string | null {
  const constraintClause = node.childForFieldName('constraint_clause');
  if (constraintClause) {
    return constraintClause.text;
  }
  return null;
}

type CSharpDeclarationParser = (
  node: ReturnType<Parser['parse']>['rootNode']
) => ParsedDeclaration | null;

const CSHARP_DECLARATION_PARSERS: Readonly<Record<string, CSharpDeclarationParser>> = {
  class_declaration: parseClassDeclaration,
  interface_declaration: parseInterfaceDeclaration,
  struct_declaration: parseStructDeclaration,
  enum_declaration: parseEnumDeclaration,
  record_declaration: parseRecordDeclaration,
  method_declaration: parseMethodDeclaration,
  constructor_declaration: parseConstructorDeclaration,
  property_declaration: parsePropertyDeclaration,
  field_declaration: parseFieldDeclaration,
  delegate_declaration: parseDelegateDeclaration,
  event_declaration: parseEventDeclaration,
  event_field_declaration: parseEventDeclaration,
  indexer_declaration: parseIndexerDeclaration,
  operator_declaration: parseOperatorDeclaration,
  conversion_operator_declaration: parseOperatorDeclaration,
  finalizer_declaration: parseFinalizerDeclaration
};

const CSHARP_BODY_PARSERS: Readonly<Record<string, CSharpDeclarationParser>> = {
  ...CSHARP_DECLARATION_PARSERS
};

function isCSharpContainerDeclaration(type: string): boolean {
  return (
    type === 'class_declaration' ||
    type === 'interface_declaration' ||
    type === 'struct_declaration' ||
    type === 'enum_declaration' ||
    type === 'record_declaration'
  );
}

function parseNamespaceMember(node: ReturnType<Parser['parse']>['rootNode']): ParsedDeclaration[] {
  if (node.type === 'namespace_declaration') {
    const body = node.childForFieldName('body');
    return body ? parseNamespaceBody(body) : [];
  }

  const parserFn = CSHARP_DECLARATION_PARSERS[node.type];
  if (parserFn === undefined) {
    return [];
  }

  const decl = parserFn(node);
  if (decl === null) {
    return [];
  }

  if (isCSharpContainerDeclaration(node.type)) {
    return [{ ...decl, members: parseClassBody(node) }];
  }

  return [decl];
}

function parseClassBody(node: ReturnType<Parser['parse']>['rootNode']): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];
  let body = node.childForFieldName('body');
  body ??= node.childForFieldName('declaration_list');
  if (!body) {
    return declarations;
  }

  for (const child of body.children) {
    const parserFn = CSHARP_BODY_PARSERS[child.type];
    if (parserFn === undefined) {
      continue;
    }
    const decl = parserFn(child);
    if (decl !== null) {
      if (isCSharpContainerDeclaration(child.type)) {
        const nestedMembers = parseClassBody(child);
        declarations.push({ ...decl, members: nestedMembers });
      } else {
        declarations.push(decl);
      }
    }
  }

  return declarations;
}

function parseNamespaceBody(node: ReturnType<Parser['parse']>['rootNode']): ParsedDeclaration[] {
  const declarations: ParsedDeclaration[] = [];

  for (const child of node.children) {
    declarations.push(...parseNamespaceMember(child));
  }

  return declarations;
}

function parseCSharpDeclarations(content: string): ParsedDeclaration[] {
  const parser = createCSharpParser();
  const tree = parser.parse(content);
  const declarations: ParsedDeclaration[] = [];

  const rootNode = tree.rootNode;

  for (const node of rootNode.children) {
    const nodeType = node.type;

    if (
      nodeType === 'comment' ||
      nodeType === 'using_directive' ||
      nodeType === 'extern_alias_directive'
    ) {
      continue;
    }

    if (nodeType === 'namespace_declaration') {
      const body = node.childForFieldName('body');
      if (body) {
        const namespaceDecls = parseNamespaceBody(body);
        declarations.push(...namespaceDecls);
      }
      continue;
    }

    if (
      nodeType === 'class_declaration' ||
      nodeType === 'interface_declaration' ||
      nodeType === 'struct_declaration' ||
      nodeType === 'record_declaration'
    ) {
      const decl = CSHARP_DECLARATION_PARSERS[nodeType]?.(node);
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
        const members = parseClassBody(node);
        if (members.length > 0) {
          declarations.push({ ...decl, members });
        } else {
          declarations.push(decl);
        }
      }
      continue;
    }

    if (nodeType === 'delegate_declaration') {
      const decl = parseDelegateDeclaration(node);
      if (decl !== null) {
        declarations.push(decl);
      }
      continue;
    }

    const parserFn = CSHARP_DECLARATION_PARSERS[nodeType];
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

    if (trimmed.startsWith('using ') || trimmed.startsWith('namespace ')) {
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

function generateCSharpOutline(options: OutlineOptions): OutlineResult {
  const { filePath, content } = options;
  const declarations = parseCSharpDeclarations(content);

  const headerComment = extractHeaderComment(content);

  const lines: OutlineLine[] = [{ kind: 'file-path', text: filePath }];

  lines.push(...buildHeaderCommentOutlineLines(headerComment));
  lines.push(...buildDeclarationOutlineLines(declarations));

  return createOutlineResult(lines, headerComment?.joinedText ?? null);
}

function extractCSharpSummary(content: string): SummaryResult {
  const headerComment = extractHeaderComment(content);
  return { summary: headerComment?.joinedText ?? null };
}

export const csharpLanguageEngine: OutlineLanguageEngine = {
  id: 'csharp',
  matchesFilePath: matchesCSharpFilePath,
  generateOutline: generateCSharpOutline,
  extractSummary: extractCSharpSummary
};
