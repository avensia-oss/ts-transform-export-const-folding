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
  if (isImportDeclaration(node)) {
    const nodes: ts.Node[] = [node];
    const namedBindings = node.importClause.namedBindings;
    const constants = {};

    if (isNamedImports(namedBindings)) {
      const importSymbol = typeChecker.getSymbolAtLocation(node.moduleSpecifier);
      const exports = typeChecker.getExportsOfModule(importSymbol);

      for (const element of namedBindings.elements) {
        const exported = exports.find(e => e.name === element.name.escapedText.toString());
        if (exported) {
          const declaration = exported.valueDeclaration;
          let constantValueExpression: ts.Expression = null;
          if (declaration && isVariableDeclaration(declaration)) {
            if (declaration.parent.flags === ts.NodeFlags.Const) {
              constantValueExpression = getConstantValue(declaration.initializer);
            } else {
              //console.info('Skipping', declaration.name, "since it's a variable but not a const");
            }
          } else if (exported.declarations.length && exported.declarations[0].kind === ts.SyntaxKind.ExportSpecifier) {
            console.log(exported as any /*.parent.valueDeclaration*/);
            console.log(exported.declarations[0].parent);
          }
          if (constantValueExpression) {
            constants[element.name.escapedText.toString()] = constantValueExpression;
          }
        }
      }

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
      }
    }

    return nodes;
  }
  return node;
}

function removeImportNames(namedBindings: ts.NamedImports, importNamesToRemove: string[]): ts.NamedImports {
  return {
    ...namedBindings,
    elements: (namedBindings.elements.filter(
      e => importNamesToRemove.indexOf((e.name || e.propertyName).text) === -1,
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
    return ts.createLiteral('undefined'); // TODO
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
