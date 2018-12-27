import compile from './compile';

type Code = { [fileName: string]: string };

test('single const import removes import', () => {
  const code = {
    'file1.ts': `
export const x: string = "constantvalue";
`,
    'file2.ts': `
import {x} from "./file1";
let y = x;
    `,
  };

  const expected = {
    'file1.js': `
export const x = "constantvalue";
`,
    'file2.js': `
const x = "constantvalue"
let y = x;
`,
  };

  expectEqual(expected, compile(code));
});

test('double const import removes import', () => {
  const code = {
    'file1.ts': `
export const x: string = "constantvalue1";
export const y: string = "constantvalue2";
`,
    'file2.ts': `
import { x, y } from "./file1";
let z = x;
let q = y;
    `,
  };

  const expected = {
    'file1.js': `
export const x = "constantvalue1";
export const y = "constantvalue2";
`,
    'file2.js': `
const x = "constantvalue1"
const y = "constantvalue2"
let z = x;
let q = y;
`,
  };

  expectEqual(expected, compile(code));
});

test("one function and one const import doesn't remove import", () => {
  const code = {
    'file1.ts': `
export const x: string = "constantvalue";
export function y() { return null; }
`,
    'file2.ts': `
import { x, y } from "./file1";
let z = x;
y();
    `,
  };

  const expected = {
    'file1.js': `
export const x = "constantvalue";
export function y() { return null; }
`,
    'file2.js': `
import { y } from "./file1";
const x = "constantvalue"
let z = x;
y();
`,
  };

  expectEqual(expected, compile(code));
});

test('exporting a previously declared const works', () => {
  const code = {
    'file1.ts': `
const x = "constantvalue";
const y = 1;
export { x, y };
`,
    'file2.ts': `
import { x } from "./file1";
let y = x;
    `,
  };

  const expected = {
    'file1.js': `
const x = "constantvalue";
const y = 1;
export { x, y };
`,
    'file2.js': `
const x = "constantvalue"
let y = x;
`,
  };

  expectEqual(expected, compile(code));
});

function expectEqual(expected: Code, compiled: Code) {
  Object.keys(expected).forEach(fileName => {
    expect(compiled[fileName].trim()).toBe(expected[fileName].trim());
  });
}
