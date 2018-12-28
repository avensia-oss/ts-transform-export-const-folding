# ts-transform-export-const-folding

A rather long name, but a descriptive one (hopefully) at least. This is a TypeScript custom transform that removes imported constants by inlining them. An example would be:

```
// file1.ts
export const x = 'xxx';

// file2.ts
import { x } from './file1';
let y = x;
```

With this transform the above gets transformed into:

```
// file1.ts
export const x = 'xxx';

// file2.ts
const x = 'xxx';
let y = x;
```

What's the point of doing that? It removes the dependency between these modules, which means that they don't have to be bundled together.

# Installation

```
yarn add @avensia-oss/ts-transform-export-const-folding
```

## Usage with webpack

Unfortunately TypeScript doesn't let you specifiy custom transformers in `tsconfig.json`. If you're using `ts-loader` with webpack you can specify it like this:
https://github.com/TypeStrong/ts-loader#getcustomtransformers-----before-transformerfactory-after-transformerfactory--

The default export of this module is a function which expects a `ts.Program` an returns a transformer function. Your config should look something like this:

```
const exportConstFoldingTransform = require('@avensia-oss/ts-transform-export-const-folding');

return {
  ...
  options: {
    getCustomTransformers: (program) => ({
      before: [exportConstFoldingTransform(program)]
    })
  }
  ...
};
```
