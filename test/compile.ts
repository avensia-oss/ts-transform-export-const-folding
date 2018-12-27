import * as path from 'path';
import * as fs from 'fs';
import * as ts from 'typescript';
import transformer from '../src/';

export default function compile(files: { [fileName: string]: string }) {
  const outputs: { [fileName: string]: string } = {};

  const compilerOptions: ts.CompilerOptions = {
    noEmitOnError: true,
    target: ts.ScriptTarget.Latest,
  };

  const compilerHost: ts.CompilerHost = {
    getSourceFile(filename, languageVersion) {
      if (filename in files) {
        return ts.createSourceFile(filename, files[filename], ts.ScriptTarget.Latest);
      }
      if (filename.indexOf('.d.ts') !== -1) {
        return ts.createSourceFile(
          filename,
          fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'typescript', 'lib', filename)).toString(),
          ts.ScriptTarget.Latest,
        );
      }
      console.log('TS asked for file', filename, 'but that was not passed in to the compile function');
      return undefined;
    },
    readFile(fileName: string) {
      return fileName;
    },
    fileExists(fileName: string) {
      return true;
    },
    getDefaultLibFileName(options: ts.CompilerOptions) {
      return 'lib.d.ts';
    },
    writeFile: function(fileName, data, writeByteOrderMark) {
      outputs[fileName] = data;
    },
    getDirectories(path: string) {
      return null as any;
    },
    useCaseSensitiveFileNames: function() {
      return false;
    },
    getCanonicalFileName: function(filename) {
      return filename;
    },
    getCurrentDirectory: function() {
      return '';
    },
    getNewLine: function() {
      return '\n';
    },
  };

  const program = ts.createProgram(Object.keys(files), compilerOptions, compilerHost);
  const transformers: ts.CustomTransformers = {
    before: [transformer(program)],
    after: [],
  };

  const writeFileCallback: ts.WriteFileCallback = (fileName: string, data: string) => {
    outputs[fileName] = data;
  };
  const { emitSkipped, diagnostics } = program.emit(undefined, writeFileCallback, undefined, false, transformers);

  if (emitSkipped) {
    throw new Error(diagnostics.map(diagnostic => diagnostic.messageText).join('\n'));
  }

  return outputs;
}
