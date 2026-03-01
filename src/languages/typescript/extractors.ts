/**
 * Declaration extraction functions for TypeScript AST nodes.
 * Barrel export for all extractor modules.
 */

export {
  getNodeLineRange,
  getDeclarationName,
  buildLineRangeKey,
  getNodeLineRangeBasic,
  getDeclarationColumnSpan,
  getDeclaratorColumnSpan,
  type ColumnSpanParams
} from './extractors/node-utils.js';
export { buildFunctionSignature, getFunctionSignature } from './extractors/signature-builder.js';
export {
  createFunctionDeclaration,
  createClassDeclaration,
  createInterfaceDeclaration,
  createTypeDeclaration,
  createEnumDeclaration
} from './extractors/declaration-creators.js';
export { extractAmbientDeclaration } from './extractors/ambient-extractor.js';
export { extractNamespaceDeclaration } from './extractors/namespace-extractor.js';
export { extractImportAliasDeclaration } from './extractors/import-extractor.js';
export { extractFunctionSignatureDeclaration } from './extractors/function-signature-extractor.js';
export { extractClassMembers } from './extractors/class-member-extractor.js';
