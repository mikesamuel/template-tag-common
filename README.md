<img align="right" src="https://cdn.rawgit.com/mikesamuel/template-tag-common/7f0159bda72d616af30645d49c3c9203c963c0a6/images/logo.png" alt="Sisyphus Logo">

# Template Tag Common

[![Build Status](https://travis-ci.org/mikesamuel/template-tag-common.svg?branch=master)](https://travis-ci.org/mikesamuel/template-tag-common)
[![Dependencies Status](https://david-dm.org/mikesamuel/template-tag-common/status.svg)](https://david-dm.org/mikesamuel/template-tag-common)
[![npm](https://img.shields.io/npm/v/template-tag-common.svg)](https://www.npmjs.com/package/template-tag-common)
[![Coverage Status](https://coveralls.io/repos/github/mikesamuel/template-tag-common/badge.svg?branch=master)](https://coveralls.io/github/mikesamuel/template-tag-common?branch=master)
[![Known Vulnerabilities](https://snyk.io/test/github/mikesamuel/template-tag-common/badge.svg?targetFile=package.json)](https://snyk.io/test/github/mikesamuel/template-tag-common?targetFile=package.json)

Simplifies authoring JS string template tags.  Tagged string templates
allow embedding a mini-language with JavaScript, and the example below
is syntactic sugar for a call to `myMiniLang`.

```js
myMiniLang`...`
```

This library makes it easier to write your own.
See "[Tagged template literals][]" for details about how template tag
functions are called.

## Contents

*  [Example](#example)
*  [API](#api)
   *  [`calledAsTemplateTag`](#calledAsTemplateTag)
   *  [`calledAsTemplateTagQuick`](#calledAsTemplateTagQuick)
   *  [`memoizedTagFunction`](#memoizedTagFunction)
      *  [Configuring tag handlers by passing an `options` object](#configuring)
      *  [Life-cycle of a tag function](#lifecycle)
   *  [`trimCommonWhitespaceFromLines`](#trimCommonWhitespaceFromLines)
   *  [`TypedString`](#TypedString)


## Example <a name="example"></a>

The example code below defines a CSV (Comma-separated value file)
formatter that takes into account whether an interpolation happens
inside quotes.

<!-- This example code also appears in test/test.js as a testcase.
     If you change it here, reflect changes there. -->

```js
// Import this library.
const {
  memoizedTagFunction,
  trimCommonWhitespaceFromLines,
  TypedString
} = require('template-tag-common')
const { Mintable } = require('node-sec-patterns')

/**
 * A fragment of CSV.
 * Unlike simple strings, numbers, or Dates,
 * fragments may span multiple cells.
 */
class CsvFragment extends TypedString {}
Object.defineProperty(
  CsvFragment, 'contractKey', { value: 'CsvFragment' })
const isCsvFragment = Mintable.verifierFor(CsvFragment)
// Assumes module-keys/babel plugin
const mintCsvFragment = require.keys.unbox(
    Mintable.minterFor(CsvFragment), null,
    (x) => String(x))

/**
 * A template tag function that composes a CSV fragment
 * by ensuring that simple values are properly quoted.
 */
const csv = memoizedTagFunction(
  computeCsvContexts, interpolateValuesIntoCsv)

// memoizeTagFunction caches the results of this
// if csv`...` happens inside a loop, this only
// happens once.
function computeCsvContexts (strings) {
  const { raw } = trimCommonWhitespaceFromLines(
    strings, { trimEolAtStart: true, trimEolAtEnd: true })
  const contexts = []
  let betweenQuotes = false
  raw.forEach((chunk) => {
    (/""?|\\./g.exec(chunk) || []).forEach((token) => {
      if (token === '"') {
        // "" and \" are escape sequences
        betweenQuotes = !betweenQuotes
      }
    })
    contexts.push(betweenQuotes)
  })
  if (betweenQuotes) {
    const placeholder = '${...}'
    throw new Error(
      `Missing quote in CSV: \`${raw.join(placeholder)}\``)
  }
  return { raw, contexts }
}

// Called with the contexts computed above, the static chunks of text,
// then the dynamic values to compute the actual result.
function interpolateValuesIntoCsv(options, { raw, contexts }, strings, values) {
  const len = values.length
  let result = ''
  for (let i = 0; i < len; ++i) {
    const alreadyQuoted = contexts[i]
    const value = values[i]
    let escaped = null
    if (isCsvFragment(value)) {
      // Allow a CSV fragment to specify multiple cells
      escaped = alreadyQuoted
        ? `"${value.content}"`
        : value.content
    // TODO: maybe convert date to 2018-01-01T12:00:00Z format
    } else {
      escaped = JSON.stringify(String(values[i]))
      if (alreadyQuoted) {
        escaped = escaped.replace(/^"|"$/g, '')
      }
    }
    result += raw[i]
    result += escaped
  }
  result += raw[len]
  return mintCsvFragment(result)
}

console.log(
  '%s',
  csv`
    foo,${ 1 },${ mintCsvFragment('bar,bar') }
    ${ 'ab"c' },baz,"boo${ '\n' }",far`)
// Logs something like
// foo,1,bar,bar
// "ab\"c",baz,"boo\n",far

module.exports = {
  csv,
  CsvFragment
}
```


## API  <a name="api"></a>

### `calledAsTemplateTag(firstArgument, nArguments)` <a name="calledAsTemplateTag"></a>

If defining a function that may be used as a template tag
or called normally, then pass the first argument and
the argument count and this will return true if the call
was via a string template.

```js
const { calledAsTemplateTag } = require('template-tag-common')

function myFunction (...args) {
  if (calledAsTemplateTag(args[0], args.length)) {
    // Assume template tag calling convention
    const [ staticStrings, ...dynamicValues ] = args
    ...
  } else {
    // Assume regular function calling convention
    ...
  }
}
```

This is true iff `firstArgument` could be a result of
**[GetTemplateObject][]**
and the number of dynamic arguments is consistent with a
template call.

It is possible, but unlikely, for this function to return true when
the caller is not a template literal.  It is not likely that an
attacker could cause an untrusted input to specify static strings; no
`firstArgument` deserialized via `JSON.parse` will pass this function.

### `calledAsTemplateTagQuick(firstArgument, nArguments)` <a name="calledAsTemplateTagQuick"></a>

Like `calledAsTemplateTag` but doesn't check that the
strings array contains only strings.

### `memoizedTagFunction(computeStaticHelper, computeResultHelper)`  <a name="memoizedTagFunction"></a>

Memoizes operations on the static portions so the per-use cost
of a tagged template literal is related to the complexity of handling
the dynamic values.

* `computeStaticHelper` : `{!function (Array.<string>): T}`
   called when there is no entry for the
   frozen static strings object, and cached weakly thereafter.
   Receives a string of arrays with a `.raw` property that is
   a string array of the same length.
*  `computeResultHelper` : `{!function (O, T, !Array.<string>, !Array.<*>): R}`
   a function that takes four parameters:
   1. An options object.  By default, an empty object.
   2. The result of computeStaticHelper above.
   3. The static chunks of text that surround the `${...}`
   4. The dynamic values that result from evaluating the contents of `${...}`

Returns `{!function (!Array.<string>, ...*): R}` a template tag
function that calls `computeStaticHelper` as needed on the static
portion and returns the result of applying `computeResultHelper`.

By splitting tagged template processing into separate static analysis
and dynamic value handling phases, we encourage granting privilege to
the static portions which the developer specifies and treating with
suspicion the dynamic values which may be controlled by an attacker.

#### Configuring tag handlers by passing an `options` object <a name="configuring"></a>

A `computeResultHelper`'s `options` parameter bundles optional
configuration data together.

Configurations can be passed to a tag as a single argument before the
template literal:

```js
myTag(options)`Foo ${ bar } baz`
```

Configurations can be associated with a tag and then later used:

```js
const myConfiguredTag = myTag({ property: value })

const tagResult = myConfiguredTag`foo ${ bar } baz`
```

Arrays cannot be valid `options` objects because of the way we
distinguish a call to specify options from a use of the tag.

#### Life-cycle of a tag function <a name="lifecycle"></a>

Execution of

```js
const { memoizedTagFunction } = require('template-tag-common')

const myTag = memoizedTagFunction(computeStaticHelper, computeResultHelper)

const result = myTag(options)`string0 ${ value0 } string1 ${ value1 } string2\n`
```

is equivalent to

```js
// The JavaScript engine does this under the hood.
// It is hoisted to the top of the module.
const staticStrings = [ 'string0 ', ' string1 ', ' string2\n' ]
staticStrings.raw =   [ 'string0 ', ' string1 ', ' string2\\n' ]
Object.freeze(staticStrings.raw)
Object.freeze(staticString)

// This is the part that memoizedTagFunction does.
const result = computeResultHelper(
    options,
    computeStaticHelper(staticStrings),
    staticStrings,
    [ value0, value1 ])
```

but if this happened in a loop, the call to `computeStaticHelper` would
probably only happen once.

### `trimCommonWhitespaceFromLines(strings, options)`  <a name="trimCommonWhitespaceFromLines"></a>

Simplifies tripping common leading whitespace from a multiline
template tag so that a template tag can be re-indented as a block.

This function takes the first argument to a tag handler.

A memoized tag handler's `computeStaticHandler` function (see above)
can call this so that the cost is not incurred every time a particular
template is reached.

Using this in template tag handlers ensures that code blocks like the
two below are treated the same even though the string templates'
contents have been indented differently so as to flow nicely with the
surrounding code.

```js
function f () {
  if (x) {
    return null
  }
  return aTagHandler`
    {
      ...
    }`
  // Indent level 2
}
```

```js
function f () {
  if (x) {
    return null
  } else {
    return aTagHandler`
      {
        ...
      }`
    // Indent level 3
  }
}
```

The `options` parameter is optional as are all its properties.  Options include

| option property name | meaning | default |
| -------------------- | ------- | ------- |
| `trimEolAtStart`     | trim starting line terminator from first chunk | `false` |
| `trimEolAtEnd`     | trim ending line terminator from last chunk | `false` |

### `TypedString`  <a name="TypedString"></a>

A `TypedString` is an object that represents a string that matches a known
contract.  Each `subclass` of `TypedString` encapsulates such a contract.

Create a subclass of `TypedString` when you want to treat some kinds of
strings specially.

This can make it very easy to write *composable* tag handlers -- tag
handlers that can easily be split up or refactored into multiple steps.

The [CSV example](#example) does not re-escape `CSVFragment`s.

```js
class CSVFragment extends TypedString {}
Object.defineProperty(
  CSVFragment, 'contractKey', { value: 'CSVFragment' })
```

Note that each concrete sub-class of `TypedString` **must** have
a static property `contractKey`.  This allows using a minter and
verifier instead of error-prone `instanceof` checks.  That
module fetches them thus

```js
const isCsvFragment = Mintable.verifierFor(CsvFragment)
const mintCsvFragment = require.keys.unbox(
    Mintable.minterFor(CsvFragment), null,
    (x) => String(x))
```

`Mintable.minterFor` returns a [box][] that is openable when
there's a grant for the current module.  The `(x) => String(x))`
allows it to degrade gracefully to returning a simple string.

Later that example checks whether a value has a particular content
type before re-escaping

```js
  if (isCsvFragment(value))
```

The output of <code>csv&#96;...&#96;</code> is also a `CSVFragment`

```js
  return mintCsvFragment(result)
```

which makes it easy to compose multiple uses of <code>csv&#96;...&#96;</code>
or split and refactor a single use.

```js
const row0 = csv`...`
const row1 = csv`...`

// Combine two rows into one
csv`
${row0}
${row1}
`
```


[Tagged template literals]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#Tagged_template_literals
[GetTemplateObject]: https://www.ecma-international.org/ecma-262/6.0/#sec-gettemplateobject
[box]: https://www.npmjs.com/package/module-keys#class-box
