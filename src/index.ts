import * as ts from 'typescript';

export default function transformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
  return (context: ts.TransformationContext) => (file: ts.SourceFile) => visitNodeAndChildren(file, program, context);
}

function visitNodeAndChildren(
  node: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
): ts.SourceFile;
function visitNodeAndChildren(
  node: ts.Node,
  program: ts.Program,
  context: ts.TransformationContext,
): ts.Node | ts.Node[];
function visitNodeAndChildren(
  node: ts.Node,
  program: ts.Program,
  context: ts.TransformationContext,
): ts.Node | ts.Node[] {
  return ts.visitEachChild(
    visitNode(node, program),
    childNode => visitNodeAndChildren(childNode, program, context),
    context,
  );
}

function visitNode(node: ts.Node, program: ts.Program): any /* TODO */ {
  const typeChecker = program.getTypeChecker();
  // We want to replace `import { x } from 'file';`
  // with `const x = 'x';` if we can prove that `x` has a constant, compile time value
  if (isImportDeclaration(node)) {
    const nodes: ts.Node[] = [node];
    const namedBindings = node.importClause.namedBindings;

    if (isNamedImports(namedBindings)) {
      const importSymbol = typeChecker.getSymbolAtLocation(node.moduleSpecifier);
      const exportSymbols = typeChecker.getExportsOfModule(importSymbol);
      const constants = getConstantValueExpressions(namedBindings.elements, exportSymbols, typeChecker);

      const identifierNames = Object.keys(constants);
      if (identifierNames.length) {
        identifierNames.forEach(i => {
          nodes.push(
            ts.createVariableDeclarationList([ts.createVariableDeclaration(i, null, constants[i])], ts.NodeFlags.Const),
          );
        });

        const importNames = namedBindings.elements.map(e => e.name.escapedText.toString());
        if (importNames.every(i => identifierNames.indexOf(i) !== -1)) {
          nodes.splice(nodes.indexOf(node), 1);
        } else {
          const newNode = ts.createImportDeclaration(
            node.decorators,
            node.modifiers,
            ts.createImportClause(node.importClause.name, removeImportNames(namedBindings, identifierNames)),
            node.moduleSpecifier,
          );
          nodes.splice(nodes.indexOf(node), 1, newNode);
        }

        return nodes;
      }
    }
  } else if (isExportFromFileDeclaration(node)) {
    // We want to replace `export { x } from 'file';`
    // with `const x = 'x';` if we can prove that `x` has a constant, compile time value
    const nodes: ts.Node[] = [node];
    const exportFromSymbol = typeChecker.getSymbolAtLocation(node.moduleSpecifier);
    const exportSymbols = typeChecker.getExportsOfModule(exportFromSymbol);
    const constants = getConstantValueExpressions(node.exportClause.elements, exportSymbols, typeChecker);

    const identifierNames = Object.keys(constants);
    if (identifierNames.length) {
      identifierNames.forEach(i => {
        nodes.push(
          ts.createVariableDeclarationList([ts.createVariableDeclaration(i, null, constants[i])], ts.NodeFlags.Const),
        );
      });

      const exportNames = node.exportClause.elements.map(e => e.name.escapedText.toString());
      if (exportNames.every(i => identifierNames.indexOf(i) !== -1)) {
        nodes.splice(nodes.indexOf(node), 1);
        nodes.push(
          ts.createExportDeclaration(
            node.decorators,
            node.modifiers,
            ts.createNamedExports(identifierNames.map(i => ts.createExportSpecifier(undefined, i))),
          ),
        );
      } else {
        const newNode = ts.createExportDeclaration(
          node.decorators,
          node.modifiers,
          ts.createNamedExports(
            node.exportClause.elements.filter(
              e => identifierNames.indexOf((e.propertyName || e.name).escapedText.toString()) === -1,
            ),
          ),
          node.moduleSpecifier,
        );
        nodes.push(
          ts.createExportDeclaration(
            node.decorators,
            node.modifiers,
            ts.createNamedExports(
              identifierNames
                .filter(i => exportNames.indexOf(i) !== -1)
                .map(i => ts.createExportSpecifier(undefined, i)),
            ),
          ),
        );
        nodes.splice(nodes.indexOf(node), 1, newNode);
      }

      return nodes;
    }
  }
  return node;
}

function getConstantValueExpressions(
  elements: ts.NodeArray<ts.ImportSpecifier> | ts.NodeArray<ts.ExportSpecifier>,
  exportSymbols: ts.Symbol[],
  typeChecker: ts.TypeChecker,
) {
  let constants = {};
  for (const element of elements) {
    const importedIdentifier = (element.propertyName || element.name).escapedText.toString();
    const exported = exportSymbols.find(e => e.name === importedIdentifier);
    if (exported) {
      const declaration = exported.valueDeclaration;
      let constantValueExpression: ts.Expression = null;

      // This checks for `export const x = 'x';`
      if (declaration && isVariableDeclaration(declaration)) {
        if (declaration.parent.flags === ts.NodeFlags.Const) {
          // Note that we only get a constant expression here if the value is a
          // literal. If it's another variable such as `export const x = y;` we bail
          // because we don't follow assignments more than exports and imports.
          constantValueExpression = getConstantValue(declaration.initializer);
        }
      } else if (exported.declarations.length && exported.declarations[0].kind === ts.SyntaxKind.ExportSpecifier) {
        // If we end up here it means that it's `export { x };` so we need to grab the source file
        // and look for identifiers
        const decl = exported.declarations[0] as ts.ExportSpecifier;
        if (
          decl.parent &&
          decl.parent.parent &&
          decl.parent.parent.parent &&
          decl.parent.parent.parent.kind === ts.SyntaxKind.SourceFile
        ) {
          const sourceFile = decl.parent.parent.parent as ts.SourceFile;
          const variables = sourceFile.statements.filter(
            s => s.kind === ts.SyntaxKind.VariableStatement,
          ) as ts.VariableStatement[];

          // This deals with the fact that it's possible to `export { x as y }` and
          // `import { x as y }`
          let localVariableToLookFor = importedIdentifier;
          if (decl.propertyName) {
            localVariableToLookFor = decl.propertyName.escapedText.toString();
          }

          const exportedVariable = variables.find(
            v => (v.declarationList.declarations[0].name as ts.Identifier).escapedText === localVariableToLookFor,
          );

          // This checks for
          // ```
          // const x = 'x';
          // export { x };
          if (exportedVariable && exportedVariable.declarationList.flags === ts.NodeFlags.Const) {
            constantValueExpression = getConstantValue(exportedVariable.declarationList.declarations[0].initializer);
          } else {
            const exportDeclarations = sourceFile.statements.filter(
              s => s.kind === ts.SyntaxKind.ExportDeclaration,
            ) as ts.ExportDeclaration[];
            const exportDeclaration = exportDeclarations.find(e =>
              e.exportClause.elements.some(
                e => (e.propertyName || e.name).escapedText.toString() === localVariableToLookFor,
              ),
            );

            // This checks for `export { x } from 'file';` where `x` is the variable we want
            // If `moduleSpecifier` is set it means that it's a `export { x } from 'file';`
            // and not just a `export { x };`
            if (exportDeclaration && exportDeclaration.moduleSpecifier) {
              const exportSymbol = typeChecker.getSymbolAtLocation(exportDeclaration.moduleSpecifier);
              const exportSymbols = typeChecker.getExportsOfModule(exportSymbol);
              const innerConstants = getConstantValueExpressions(
                exportDeclaration.exportClause.elements,
                exportSymbols,
                typeChecker,
              );

              handleAlias(innerConstants, localVariableToLookFor, importedIdentifier);

              constants = {
                ...constants,
                ...innerConstants,
              };
            } else {
              // This checks for `import { x } from 'file';` where `x` is the variable we want
              const importDeclarations = sourceFile.statements.filter(
                s => s.kind === ts.SyntaxKind.ImportDeclaration,
              ) as ts.ImportDeclaration[];

              const importDeclaration = importDeclarations.find(i =>
                getImportElements(i).some(e => e.name.escapedText.toString() === localVariableToLookFor),
              );

              if (importDeclaration) {
                const importSymbol = typeChecker.getSymbolAtLocation(importDeclaration.moduleSpecifier);
                const importSymbols = typeChecker.getExportsOfModule(importSymbol);
                const innerConstants = getConstantValueExpressions(
                  getImportElements(importDeclaration),
                  importSymbols,
                  typeChecker,
                );

                handleAlias(innerConstants, localVariableToLookFor, importedIdentifier);

                constants = {
                  ...constants,
                  ...innerConstants,
                };
              }
            }
          }
        }
      }
      if (constantValueExpression) {
        constants[element.name.escapedText.toString()] = constantValueExpression;
      }
    }
  }
  return constants;
}

function handleAlias(constants: {}, localVariableToLookFor: string, importedIdentifier: string) {
  // `constants` keys will be the names of the exports from the other module, but
  // this module might have imported with a different name such as `import { x as y } from 'file';`
  // which means that we have to remove `x` as key from `constants` and add that value in
  // `constants['y']` instead.
  if (localVariableToLookFor !== importedIdentifier) {
    constants[importedIdentifier] = constants[localVariableToLookFor];
    delete constants[localVariableToLookFor];
  }
}

function getImportElements(importDeclaration: ts.ImportDeclaration): ts.NodeArray<ts.ImportSpecifier> {
  const namedBindings = importDeclaration.importClause.namedBindings as ts.NamedImports;
  if (!namedBindings.elements) {
    return ([] as any) as ts.NodeArray<ts.ImportSpecifier>;
  }
  return namedBindings.elements;
}

function removeImportNames(namedBindings: ts.NamedImports, importNamesToRemove: string[]): ts.NamedImports {
  return {
    ...namedBindings,
    elements: (namedBindings.elements.filter(
      e => importNamesToRemove.indexOf((e.propertyName || e.name).text) === -1,
    ) as any) as ts.NodeArray<ts.ImportSpecifier>,
  };
}

function getConstantValue(expression: ts.Expression) {
  if (expression.kind === ts.SyntaxKind.StringLiteral) {
    return ts.createStringLiteral((expression as ts.StringLiteral).text);
  } else if (expression.kind === ts.SyntaxKind.NumericLiteral) {
    return ts.createNumericLiteral((expression as ts.NumericLiteral).text);
  } else if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return ts.createTrue();
  } else if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return ts.createFalse();
  } else if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return ts.createNull();
  } else if (expression.kind === ts.SyntaxKind.UndefinedKeyword) {
    return null; // TODO: For some reason there's no ts.createUndefined()
  }
  return null;
}

function isVariableDeclaration(x: ts.Declaration): x is ts.VariableDeclaration {
  return !!(x as ts.VariableDeclaration).initializer;
}

function isNamedImports(x: ts.NamedImportBindings): x is ts.NamedImports {
  return !!(x as ts.NamedImports).elements;
}

function isImportDeclaration(node: ts.Node): node is ts.ImportDeclaration {
  if (node.kind === ts.SyntaxKind.ImportDeclaration) {
    return true;
  }
  return false;
}

function isExportFromFileDeclaration(node: ts.Node): node is ts.ExportDeclaration {
  const exp = node as ts.ExportDeclaration;
  if (exp.kind === ts.SyntaxKind.ExportDeclaration && exp.moduleSpecifier) {
    return true;
  }
  return false;
}
