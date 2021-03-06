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

test('default exports are ignored', () => {
  const code = {
    'file1.ts': `
export default "constantvalue";
`,
    'file2.ts': `
import x from "./file1";
let y = x;
    `,
  };

  const expected = {
    'file1.js': `
export default "constantvalue";
`,
    'file2.js': `
import x from "./file1";
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

test('exporting a previously declared const with a different name works', () => {
  const code = {
    'file1.ts': `
const x = "constantvalue";
const y = 1;
export { x as z, y };
`,
    'file2.ts': `
import { z } from "./file1";
let y = z;
    `,
  };

  const expected = {
    'file1.js': `
const x = "constantvalue";
const y = 1;
export { x as z, y };
`,
    'file2.js': `
const z = "constantvalue"
let y = z;
`,
  };

  expectEqual(expected, compile(code));
});

test('importing a constant from a module which exports it works', () => {
  const code = {
    'file1.ts': `
const x = "constantvalue";
export { x };
`,
    'file2.ts': `
export { x } from './file1';
    `,
    'file3.ts': `
import { x } from './file2';
let y = x;
    `,
  };

  const expected = {
    'file1.js': `
const x = "constantvalue";
export { x };
`,
    'file2.js': `
const x = "constantvalue"
export { x };
    `,
    'file3.js': `
const x = "constantvalue"
let y = x;
    `,
  };

  expectEqual(expected, compile(code));
});

test('importing a constant from a module which exports it and other variables works', () => {
  const code = {
    'file1.ts': `
const x = "constantvalue";
const y = () => true;
export { x, y };
  `,
    'file2.ts': `
export { x, y } from './file1';
      `,
    'file3.ts': `
import { x } from './file2';
let y = x;
      `,
  };

  const expected = {
    'file1.js': `
const x = "constantvalue";
const y = () => true;
export { x, y };
  `,
    'file2.js': `
export { y } from './file1';
const x = "constantvalue"
export { x };
      `,
    'file3.js': `
const x = "constantvalue"
let y = x;
      `,
  };

  expectEqual(expected, compile(code));
});

test('importing a constant from a module which exports it after first importing it works', () => {
  const code = {
    'file1.ts': `
const x = "constantvalue";
export { x };
`,
    'file2.ts': `
import { x } from './file1';
export { x };
    `,
    'file3.ts': `
import { x } from './file2';
let y = x;
    `,
  };

  const expected = {
    'file1.js': `
const x = "constantvalue";
export { x };
`,
    'file2.js': `
const x = "constantvalue"
export { x };
    `,
    'file3.js': `
const x = "constantvalue"
let y = x;
    `,
  };

  expectEqual(expected, compile(code));
});

test('importing a constant from a module which exports it with a different after first importing it works', () => {
  const code = {
    'file1.ts': `
const y = "constantvalue";
export { y };
  `,
    'file2.ts': `
import { y } from './file1';
export { y as x };
      `,
    'file3.ts': `
import { x } from './file2';
let y = x;
      `,
  };

  const expected = {
    'file1.js': `
const y = "constantvalue";
export { y };
  `,
    'file2.js': `
const y = "constantvalue"
export { y as x };
      `,
    'file3.js': `
const x = "constantvalue"
let y = x;
      `,
  };

  expectEqual(expected, compile(code));
});

test('importing a constant with a different name from a module which exports it with a different after first importing it works', () => {
  const code = {
    'file1.ts': `
const y = "constantvalue";
export { y };
    `,
    'file2.ts': `
import { y as z } from './file1';
export { z as x };
        `,
    'file3.ts': `
import { x } from './file2';
let y = x;
        `,
  };

  const expected = {
    'file1.js': `
const y = "constantvalue";
export { y };
    `,
    'file2.js': `
const z = "constantvalue"
export { z as x };
        `,
    'file3.js': `
const x = "constantvalue"
let y = x;
        `,
  };

  expectEqual(expected, compile(code));
});

function expectEqual(expected: Code, compiled: Code) {
  Object.keys(expected).forEach(fileName => {
    expect(fileName + ':\n' + compiled[fileName].trim()).toBe(fileName + ':\n' + expected[fileName].trim());
  });
}
