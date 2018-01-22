# Template Tag Common

Simplifies authoring JS template tag handlers.

```js
myTag`...`
```

invokes the `myTag` function.  This library is for authors of those
tags.

See "[Tagged template literals][]" for details about how template tag
handlers are called.

## Example

The example code below defines a CSV (Comma-separated value file)
formatter that takes into account whether an interpolation happens
inside quotes.

```js
const {
  memoizedTagFunction,
  trimCommonWhitespaceFromLines,
  TypedString
} = require('template-tag-common')

class CsvFragment extends TypedString {
}

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
function interpolateValuesIntoCsv({ raw, contexts }, strings, values) {
  const len = values.length
  let result = ''
  for (let i = 0; i < len; ++i) {
    const alreadyQuoted = contexts[i]
    const value = values[i]
    let escaped = null
    if (value instanceof CsvFragment) {
      // Allow a CSV fragment to specify multiple cells
      escaped = alreadyQuoted
        ? `"${value.content}"`
        : value.content
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
  return new CsvFragment(result)
}

console.log(
  '%s',
  csv`
    foo,${ 1 },${ new CsvFragment('bar,bar') }
    ${ 'ab"c' },baz,"boo${ '\n' }",far`)
// Logs something like
// foo,1,bar,bar
// "ab\"c",baz,"boo\n",far

module.exports = {
  csv,
  CsvFragment
}
```


## API

### `calledAsTemplateTag(firstArgument, nArguments)`

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

### `calledAsTemplateTagQuick(firstArgument, nArguments)`

Like `calledAsTemplateTag` but doesn't check that the
strings array contains only strings.

### `memoizedTagFunction(computeStaticHelper, computeResultHelper)`

Memoizes operations on the static portions so the per-use cost
of a tagged template literal is related to the complexity of handling
the dynamic values.

* `computeStaticHelper` : `{!function (Array.<string>): T}`
   called when there is no entry for the
   frozen static strings object, and cached weakly thereafter.
   Receives a string of arrays with a `.raw` property that is
   a string array of the same length.
*  `computeResultHelper` : `{!function (T, !Array.<string>, !Array.<*>): R}`
   a function that takes three parameters:

Returns `{!function (!Array.<string>, ...*): R}` a template tag
function that calls `computeStaticHelper` as needed on the static
portion and returns the result of applying `computeResultHelper`.

By splitting tagged template processing into separate static analysis
and dynamic value handling phases, we encourage granting privilege to
the static portions which the developer specifies and treating with
suspicion the dynamic values which may be controlled by an attacker.

### `trimCommonWhitespaceFromLines(strings, options)`

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


[Tagged template literals]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#Tagged_template_literals
[GetTemplateObject]: https://www.ecma-international.org/ecma-262/6.0/#sec-gettemplateobject
