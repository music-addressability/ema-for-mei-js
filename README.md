# EMA for MEI

A TypeScript processor of Enhancing Music Notation Addressability (EMA) expressions ([read the API specification here](https://github.com/music-addressability/ema/blob/master/docs/api.md)) for the [Music Encoding Initiative](https://music-encoding.org) format. This implementation is isomorphic for NodeJS and modern web browsers.

## API Coverage

### Completeness

This implementation supports the default completeness behavior: beats encountered at the end of a beat range are returned in their entirety. E.g. a 4/4 measure with two half notes will be returned in full with both the beat selections `1-3` and `1-4`.

Additionally, the following completeness values are currently supported:

* `highlight`

## Simple usage

### Node.js (TypeScript)

The processor is available as a package on npm as `@emajs/mei` and can be installed like this:

```
npm install @emajs/mei
```

Example usage

```ts
import EmaMei from '../src/EmaMei'
import EmaMeiProcessor from '../src/EmaMeiProcessor'

const fullExpr = `/https%3A%2F%2Fraw.githubusercontent.com%2Fmusic-encoding%2Fsample-encodings%2Fmaster%2FMEI_4.0%2FMusic%2FComplete_examples%2FBach_Musikalisches_Opfer_Trio.mei/all/all/@all`

const emaMei: EmaMeiProcessor = await EmaMei.withFullExpr(fullExpr)

// The result:
const addressedSelection = emaMei.getSelection()
```

### Browser

`ema-mei.js` is available in the `dist` directory via `npm` or can be built locally after installation (example uses `yarn` but `npm` is fine, too):

```sh
yarn install
yarn build
```

```html
<script src="ema-mei.js"></script>
<script>
  const expr = `/https%3A%2F%2Fraw.githubusercontent.com%2Fmusic-encoding%2Fsample-encodings%2Fmaster%2FMEI_4.0%2FMusic%2FComplete_examples%2FBach_Musikalisches_Opfer_Trio.mei/all/all/@all`

  EmaMei.withFullExpr(expr)
    .then(function (r) {
      // The result:
      const selection = r.getSelection()   
    }
    .catch(function (err) {
      console.log(err)
    })
</script>
```

## Other methods

### Get a processor from an MEI document as string

```ts
import EmaMei from '../src/EmaMei'
import EmaMeiProcessor from '../src/EmaMeiProcessor'

const music = '<mei/>'
const expr = `all/all/@all`
const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(music, expr)

// The result:
const addressedSelection = emaMei.getSelection()
```

### Parse an MEI document from string without processing an EMA expression

This can be useful to get the full document information as specified by the EMA API.

```ts
import MeiDoc from '../src/MeiDoc'
import { DocInfo } from '@emajs/parser'

const music = '<mei/>'
const meiDoc: MeiDoc = MeiDoc.fromString(music)

const docInfo: DocInfo = meiDoc.getDocumentInfo()
```

### Get `<annot>` with completeness set to `highlight`

The `<annot>` element will contain a `@plist` of `@xml:id`s pointing to MEI elements that fell within the selection addressed by the EMA expression. The rest of the MEI document is returned in its entirety with `@xml:id`s added when needed.

```ts
import EmaMei from '../src/EmaMei'
import EmaMeiProcessor from '../src/EmaMeiProcessor'

const music = '<mei/>'
const expr = `7/all/@1-2@3/highlight`
const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(music, expr)
const annot = emaMei.getSelection().querySelector('*|annot')
```
