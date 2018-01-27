/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview
 * Provides utilities to simplify creating template tag handlers.
 */

const { every } = Array.prototype

function isString (val) {
  return (typeof val) === 'string'
}

function isStringArray (arr) {
  return Array.isArray(arr) && every.call(arr, isString)
}

/**
 * True if the arguments are template function inputs.
 * It is possible, but unlikely, for this function to return true when
 * the caller is not a template literal.
 *
 * This is similar to {@code calledAsTemplateTag} but does not check
 * that array elements are strings.
 *
 * @param {*} firstArgument The first argument to the function that may
 *     have been called as a template tag handler.
 * @return true iff firstArgument might be an output from
 *     https://www.ecma-international.org/ecma-262/6.0/#sec-gettemplateobject
 *     and the number of dynamic arguments is consistent with a
 *     template call.
 */
function calledAsTemplateTagQuick (firstArgument, argumentCount) {
  if (firstArgument && Object.isFrozen(firstArgument) &&
      Array.isArray(firstArgument)) {
    const { raw, length } = firstArgument
    return length === argumentCount && Boolean(raw) &&
      length === raw.length && Object.isFrozen(raw) &&
      Array.isArray(raw)
  }
  return false
}

/**
 * True if the arguments are template function inputs.
 * It is possible, but unlikely, for this function to return true when
 * the caller is not a template literal.
 *
 * @return true iff firstArgument might be an output from
 *     https://www.ecma-international.org/ecma-262/6.0/#sec-gettemplateobject
 *     and the number of dynamic arguments is consistent with a
 *     template call.
 */
function calledAsTemplateTag (firstArgument, argumentCount) {
  // Additional checks that we could do but do not:
  // 1. that the cooked version of a static chunk is consistent with
  //    the raw version.
  // 2. That there are no custom properties besides "raw"
  // 3. That the arrays are in the same realm.
  return calledAsTemplateTagQuick(firstArgument, argumentCount) &&
    every.call(firstArgument, isString) &&
    every.call(firstArgument.raw, isString)
}

function requireValidTagInputs (staticStrings, dynamicValues) {
  const { raw, length } = staticStrings
  if (!(length === raw.length && isStringArray(staticStrings) &&
        isStringArray(raw))) {
    throw new Error('Invalid static strings')
  }
  if (dynamicValues.length + 1 !== length) {
    throw new Error(`Too many or too few dynamic values: ${length} != ${dynamicValues.length}`)
  }
}

/**
 * A function that either takes an options object (O), in which case it returns
 * another configurableTemplateTag; or it takes a TemplateObject and returns a result of
 * type R.
 *
 * @template O
 * @template R
 * @typedef {!function (O|Array.<string>, ...*): (configurableTemplateTag<O, R>|R)}
 */
let configurableTemplateTag  // eslint-disable-line

/**
 * Memoizes operations on the static portions so the per-use cost
 * of a tagged template literal is related to the complexity of handling
 * the dynamic values.
 *
 * @template O
 * @template R
 * @template T
 * @param {!function (Array.<string>): T} computeStaticHelper
 *   called when there is no entry for the
 *   frozen static strings object, and cached weakly thereafter.
 *   Receives a string of arrays with a {@code .raw} property that is
 *   a string array of the same length.
 * @param {!function (O, T, !Array.<string>, !Array.<*>): R} computeResultHelper
 *    a function that takes three parameters:
 * @return {configurableTemplateTag<O, R>}
 *    A function that either takes an options object (O), in which case it returns
 *    another configurableTemplateTag; or it takes a TemplateObject and returns a result of
 *    type R.
 *    When used as a template tag it calls computeStaticHelper as needed
 *    on the static portion and returns the result of applying
 *    computeResultHelper.
 */
function memoizedTagFunction (computeStaticHelper, computeResultHelper) {
  const memoTable = new WeakMap()

  /**
   * @param {!Array.<string>} staticStrings
   * @return {T}
   */
  function staticStateFor (staticStrings) {
    let staticState = null
    const canMemoize = Object.isFrozen(staticStrings) &&
          Object.isFrozen(staticStrings.raw)
    if (canMemoize) {
      staticState = memoTable.get(staticStrings)
    }
    let failure = null
    if (!staticState) {
      try {
        staticState = { pass: computeStaticHelper(staticStrings) }
      } catch (exc) {
        failure = exc
        staticState = { fail: exc.message || 'Failure' }
      }
      if (canMemoize) {
        memoTable.set(staticStrings, staticState)
      }
    }
    if (staticState.fail) {
      throw failure || new Error(staticState.fail)
    }
    return staticState.pass
  }

  /** @param {O} options */
  function usingOptions (options) {
    return (staticStringsOrOptions, ...dynamicValues) => {
      // If we've only been passed an options object,
      // return a template tag that uses it.
      if (dynamicValues.length === 0 && !Array.isArray(staticStringsOrOptions)) {
        return usingOptions(staticStringsOrOptions)
      }

      const staticStrings = staticStringsOrOptions
      requireValidTagInputs(staticStrings, dynamicValues)

      return computeResultHelper(
        options, staticStateFor(staticStrings), staticStrings, dynamicValues)
    }
  }

  return usingOptions(/** @type {O} */ ({})) // eslint-disable-line no-inline-comments
}

/** The longest prefix of a that is also a prefix of b */
function commonPrefixOf (a, b) { // eslint-disable-line id-length
  const minLen = Math.min(a.length, b.length)
  let i = 0
  for (; i < minLen; ++i) {
    if (a[i] !== b[i]) {
      break
    }
  }
  return a.substring(0, i)
}

function commonPrefixOfTemplateStrings ({ raw, length }) {
  if (!LINE_TERMINATORS.exec(raw[0])) {
    return ''
  }
  let commonPrefix = null
  // Scan the raw array and compute the common prefix for each line.
  for (let i = 0; i < length; ++i) {
    const lines = String(raw[i]).split(LINE_TERMINATORS)
    // Start at 1 since element 0 either follows a substitution or
    // the starting back-tick.
    for (let lnum = 1, nLines = lines.length; lnum < nLines; ++lnum) {
      const [ prefix ] = WS_RUN.exec(lines[lnum])
      commonPrefix = (commonPrefix === null)
        ? prefix
        : commonPrefixOf(commonPrefix, prefix)
      if (!commonPrefix) {
        break
      }
    }
  }
  return commonPrefix
}

// Matches zero or more Whitespace at the start of input
// https://www.ecma-international.org/ecma-262/6.0/#sec-white-space
const WS_RUN = /^[\t\u000B\u000C \u00A0\uFeFF]*/
// https://www.ecma-international.org/ecma-262/6.0/#sec-line-terminators
const LINE_TERMINATORS = /[\n\r\u2028\u2029]+/
const LINE_TERMINATOR_AT_START = /^(?:\r\n?|[\n\u2028\u2029])/
const LINE_TERMINATOR_AT_END = /(?:\r\n?|[\n\r\u2028\u2029])$/

/**
 * Simplifies tripping common leading whitespace from a multiline
 * template tag so that a template tag can be re-indented as a block.
 *
 * This may be called from a computeStaticHandler so that it need not
 * happen every time a particular template is reached.
 *
 * "Whitespace" and "line terminators" mean the same as they do in ES6:
 * https://www.ecma-international.org/ecma-262/6.0/#sec-white-space
 * https://www.ecma-international.org/ecma-262/6.0/#sec-line-terminators
 */
function trimCommonWhitespaceFromLines (
  templateStrings,
  {
    trimEolAtStart = false,
    trimEolAtEnd = false
  } = {}) {
  // Find a common prefix to remove
  const commonPrefix = commonPrefixOfTemplateStrings(templateStrings)

  let prefixPattern = null
  if (commonPrefix) {
    // commonPrefix contains no RegExp metacharacters since it only contains
    // whitespace.
    prefixPattern = new RegExp(
      `(${LINE_TERMINATORS.source})${commonPrefix}`, 'g')
  } else if (trimEolAtStart || trimEolAtEnd) {
    // We don't need to remove a prefix, but we might need to do some
    // post processing, so just use a prefix pattern that never matches.
    prefixPattern = /(?!)/
  } else {
    // Fast path.
    return templateStrings
  }

  const { raw, length } = templateStrings

  // Apply slice so that raw is in the same realm as the tag function.
  const trimmedRaw = Array.prototype.slice.apply(raw).map(
    (chunk) => chunk.replace(prefixPattern, '$1'))
  if (trimEolAtStart) {
    trimmedRaw[0] = trimmedRaw[0].replace(LINE_TERMINATOR_AT_START, '')
  }
  if (trimEolAtEnd) {
    trimmedRaw[length - 1] = trimmedRaw[length - 1]
      .replace(LINE_TERMINATOR_AT_END, '')
  }
  const trimmedCooked = trimmedRaw.map(cook)

  trimmedCooked.raw = trimmedRaw
  Object.freeze(trimmedRaw)
  Object.freeze(trimmedCooked)
  return trimmedCooked
}

// The parts between `|` match, in order:
// *  Any non-special escaped character or special control sequence
// *  2-digit hex escape
// *  4-digit UTF-16 code-unit escape
// *  Legacy octal escape
// *  More legacy octal escape
// *  Line continuation that uses a CR or CRLF
const ESCAPE_SEQUENCE =
  /\\(?:[^ux0-7\r]|x[0-9A-Fa-f]{0,2}|u[0-9A-Fa-f]{4}|[0-3][0-7]{0,2}|[4-7][0-7]?|\r\n?)/g

// SV is defined in the ES 6 specification to be the string value of
// an escape sequence.
const SV_TABLE = {
  'b': '\u0008',
  't': '\u0009',
  'n': '\u000A',
  'v': '\u000B',
  'f': '\u000C',
  'r': '\u000D',
  // Line continuations contribute no characters
  '\n': '',
  '\r': '',
  '\u2028': '',
  '\u2029': ''
}
// eslint-disable-next-line no-multi-assign, dot-notation
SV_TABLE['x'] = SV_TABLE['u'] =
  (x) => String.fromCharCode(parseInt(x.substr(2), 16))

// eslint-disable-next-line no-multi-assign
SV_TABLE['0'] = SV_TABLE['1'] = SV_TABLE['2'] =
  // eslint-disable-next-line no-multi-assign
  SV_TABLE['3'] = SV_TABLE['4'] = SV_TABLE['5'] =
  // eslint-disable-next-line no-multi-assign
  SV_TABLE['6'] = SV_TABLE['7'] =
  (x) => String.fromCharCode(parseInt(x.substr(1), 8))

/**
 * The cooked string template chunk corresponding to the given raw chunk.
 * TRV -> TV per
 * https://www.ecma-international.org/ecma-262/6.0/#sec-static-semantics-tv-and-trv
 */
function cook (trv) {
  // There are two changes that we need to make to convert a TV to a TRV:
  // 1.  The TV of TemplateCharacter :: \ EscapeSequence is the
  //     SV of EscapeSequence.
  // 2.  LineContinuation is replaced with the empty string
  // Adjusting CRLF and CR -> LF should already have happened.
  return trv.replace(
    ESCAPE_SEQUENCE,
    (escSeq) => {
      const chr = escSeq.charAt(1)
      const repl = SV_TABLE[chr]
      if (repl === undefined) { // eslint-disable-line no-undefined
        return chr
      }
      if (typeof repl === 'function') {
        return repl(escSeq)
      }
      return repl
    })
}

/**
 * Wraps a content string so that `instanceof` checks can be used
 * to test whether the string meets a specific contract.
 *
 * Template tags may `extend` this type to define wrapped strings
 * with relevant contracts.
 */
class TypedString {
  constructor (content) {
    Object.defineProperty(
      this, 'content',
      { configurable: false, writable: false, value: String(content) })
  }
  toString () {
    return this.content
  }
}

module.exports = Object.freeze({
  calledAsTemplateTag,
  calledAsTemplateTagQuick,
  memoizedTagFunction,
  trimCommonWhitespaceFromLines,
  TypedString
})
