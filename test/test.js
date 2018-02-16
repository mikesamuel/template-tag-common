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

/* eslint "no-magic-numbers": off, "no-warning-comments": off */

const { expect } = require('chai')
const { describe, it } = require('mocha')
const {
  calledAsTemplateTag,
  calledAsTemplateTagQuick,
  memoizedTagFunction,
  trimCommonWhitespaceFromLines,
  TypedString
} = require('../index')
const { Mintable } = require('node-sec-patterns')

describe('template-tag-common', () => {
  describe('calledAsTemplateTag', () => {
    function mayBeATag (...args) {
      return calledAsTemplateTag(args[0], args.length)
    }
    it('empty tag', () => {
      expect(mayBeATag``).to.equal(true)
    })
    it('simple tag', () => {
      expect(mayBeATag`foo`).to.equal(true)
    })
    it('empty subst', () => {
      expect(mayBeATag`foo ${1} bar`).to.equal(true)
    })
    it('chunk with escape', () => {
      expect(mayBeATag`foo\bar`).to.equal(true)
    })
    it('no arguments', () => {
      expect(mayBeATag()).to.equal(false)
    })
    it('numeric arguments', () => {
      expect(mayBeATag(0, 1, 2)).to.equal(false)
    })
    it('array arguments', () => {
      expect(mayBeATag([ 'foo', 'bar' ], 1)).to.equal(false)
    })
    it('frozen array no raw', () => {
      expect(mayBeATag(Object.freeze([ 'foo', 'bar' ]), 1)).to.equal(false)
    })
    it('frozen not an array has raw', () => {
      expect(
        mayBeATag(
          { 'raw': [ 'foo', 'bar' ], 'length': 2, '0': 'foo', '1': 'bar' },
          1))
        .to.equal(false)
    })
    it('null', () => {
      expect(mayBeATag(null, null)).to.equal(false)
    })
    it('masquerade arity mismatch', () => {
      const arr = [ 'foo', 'bar' ]
      arr.raw = Object.freeze([ 'foo', 'bar' ])
      Object.freeze(arr)
      expect(mayBeATag(arr, 0, 1)).to.equal(false)
      expect(mayBeATag(arr)).to.equal(false)
    })
    it('masquerade raw length mismatch', () => {
      const arr = [ 'foo', 'bar' ]
      arr.raw = Object.freeze([ 'foo' ])
      Object.freeze(arr)
      expect(mayBeATag(arr, 1)).to.equal(false)
    })
    it('masquerade non-string member', () => {
      const arr = [ 'foo', 0 ]
      arr.raw = Object.freeze([ 'foo', 'bar' ])
      Object.freeze(arr)
      expect(mayBeATag(arr, 1)).to.equal(false)
    })
    it('masquerade non-string raw member', () => {
      const arr = [ 'foo', 'bar' ]
      arr.raw = Object.freeze([ 'foo', 0 ])
      Object.freeze(arr)
      expect(mayBeATag(arr, 1)).to.equal(false)
    })
  })

  describe('calledAsTemplateTagQuick', () => {
    function mayBeATag (...args) {
      return calledAsTemplateTagQuick(args[0], args.length)
    }
    it('empty tag', () => {
      expect(mayBeATag``).to.equal(true)
    })
    it('simple tag', () => {
      expect(mayBeATag`foo`).to.equal(true)
    })
    it('empty subst', () => {
      expect(mayBeATag`foo ${1} bar`).to.equal(true)
    })
    it('chunk with escape', () => {
      expect(mayBeATag`foo\bar`).to.equal(true)
    })
    it('no arguments', () => {
      expect(mayBeATag()).to.equal(false)
    })
    it('numeric arguments', () => {
      expect(mayBeATag(0, 1, 2)).to.equal(false)
    })
    it('array arguments', () => {
      expect(mayBeATag([ 'foo', 'bar' ], 1)).to.equal(false)
    })
    it('frozen array no raw', () => {
      expect(mayBeATag(Object.freeze([ 'foo', 'bar' ]), 1)).to.equal(false)
    })
    it('frozen not an array has raw', () => {
      expect(
        mayBeATag(
          { 'raw': [ 'foo', 'bar' ], 'length': 2, '0': 'foo', '1': 'bar' },
          1))
        .to.equal(false)
    })
    it('null', () => {
      expect(mayBeATag(null, null)).to.equal(false)
    })
    it('masquerade arity mismatch', () => {
      const arr = [ 'foo', 'bar' ]
      arr.raw = Object.freeze([ 'foo', 'bar' ])
      Object.freeze(arr)
      expect(mayBeATag(arr, 0, 1)).to.equal(false)
      expect(mayBeATag(arr)).to.equal(false)
    })
    it('masquerade raw length mismatch', () => {
      const arr = [ 'foo', 'bar' ]
      arr.raw = Object.freeze([ 'foo' ])
      Object.freeze(arr)
      expect(mayBeATag(arr, 1)).to.equal(false)
    })
  })

  describe('memoizedTagFunction', () => {
    it('simple tag usage', () => {
      const myTag = memoizedTagFunction(
        (strings) => strings.length,
        (options, computed, statics, dynamics) =>
          [ computed, JSON.stringify(statics), JSON.stringify(dynamics) ])
      for (let i = 0; i < 10; ++i) {
        expect(myTag`foo${i}bar`).to.deep.equal(
          [ 2, '["foo","bar"]', JSON.stringify([ i ]) ])
      }
    })
    describe('invalid arguments', () => {
      const myTag = memoizedTagFunction(
        (strings) => strings.length,
        (options, computed, statics, dynamics) =>
          [ computed, JSON.stringify(statics), JSON.stringify(dynamics) ])
      it('empty array', () => {
        expect(() => myTag([])).throws()
      })
      it('string array no raw', () => {
        expect(() => myTag([ 'foo' ])).throws()
      })
      it('bad value in raw', () => {
        const baked = [ 'foo' ]
        baked.raw = [ 123 ]
        expect(() => myTag(baked)).throws()
      })
      it('bad value in baked', () => {
        const baked = [ 123 ]
        baked.raw = [ '123' ]
        expect(() => myTag(baked)).throws()
      })
      it('too few args', () => {
        const baked = [ '123', '456' ]
        baked.raw = [ '123', '456' ]
        expect(() => myTag(baked)).throws()
      })
      it('too many args', () => {
        const baked = [ '123', '456' ]
        baked.raw = [ '123', '456' ]
        expect(() => myTag(baked, 1, 2, 3)).throws()
      })
    })
    it('failure computing static state', () => {
      let dynamicValueHelperReached = false
      let staticHelperInvocationCount = 0
      const myTag = memoizedTagFunction(
        (strings) => {
          ++staticHelperInvocationCount
          throw new Error(strings[0])
        },
        (options, computed, statics, dynamics) => {
          dynamicValueHelperReached = true
        })
      function fails () {
        return myTag`Panic`
      }

      // Try it once to prime the cache
      expect(fails).to.throw()
      // It should throw the second and subsequent time
      expect(fails).to.throw()

      expect(() => myTag``).to.throw()

      expect(dynamicValueHelperReached).to.equal(false)
      expect(staticHelperInvocationCount).to.equal(2)
    })
    it('mutation of chunks array', () => {
      const myTag = memoizedTagFunction(
        (strings) => strings.length,
        (options, computed, statics, dynamics) =>
          [ computed, JSON.stringify(statics), JSON.stringify(dynamics) ])
      const strings = [ 'foo', 'bar' ]
      strings.raw = [ 'foo', 'bar' ]

      expect(myTag(strings, 0)).to.deep.equal(
        [ 2, '["foo","bar"]', '[0]' ])

      strings.push('baz')
      strings.raw.push('baz')

      expect(myTag(strings, 0, 1)).to.deep.equal(
        [ 3, '["foo","bar","baz"]', '[0,1]' ])
    })
    it('called once', () => {
      // This test may be flaky since it assumes that something
      // persists in a weak map.
      let callCount = 0
      const myTag = memoizedTagFunction(
        (strings) => {
          ++callCount
          return strings.length
        },
        (options, computed, statics, dynamics) =>
          [ computed, JSON.stringify(statics), JSON.stringify(dynamics) ])

      for (let i = 0; i < 10; ++i) {
        expect(myTag`foo${i}bar`).to.deep.equal(
          [ 2, '["foo","bar"]', JSON.stringify([ i ]) ])
      }

      expect(callCount).to.equal(1)
    })
    it('configurations routed', () => {
      const myTag = memoizedTagFunction(
        (strings) => ({ nStrings: strings.length }),
        (options, computed, statics, dynamics) =>
          ({ options, computed, dynamics }))

      const results = []
      for (let i = 0; i < 3; ++i) {
        // Here we configure a tag dynamically.
        results.push(myTag({ i })`foo:${i};`)
      }
      expect(results).to.deep.equal(
        [
          {
            options: { i: 0 },
            computed: { nStrings: 2 },
            dynamics: [ 0 ]
          },
          {
            options: { i: 1 },
            computed: { nStrings: 2 },
            dynamics: [ 1 ]
          },
          {
            options: { i: 2 },
            computed: { nStrings: 2 },
            dynamics: [ 2 ]
          }
        ])
    })
  })

  describe('trimCommonWhitespaceFromLines', () => {
    function ign (x) {
      // This function body intentionally left blank.
      // Standard doesn't like side-effecting getters which
      // breaks some chai assertions.
    }
    // A tag handler that trims whitespace and returns the results.
    function trimmed (strings, ...values) {
      const adjusted = trimCommonWhitespaceFromLines(strings)
      ign(expect(adjusted).to.be.frozen)
      ign(expect(adjusted.raw).to.be.frozen)
      return {
        cooked: Array.prototype.slice.call(adjusted),
        raw: Array.prototype.slice.call(adjusted.raw)
      }
    }

    it('empty string', () => {
      expect(trimmed``).to.deep.equal({
        cooked: [ '' ],
        raw: [ '' ]
      })
    })
    it('one line', () => {
      expect(trimmed`foo`).to.deep.equal({
        cooked: [ 'foo' ],
        raw: [ 'foo' ]
      })
    })
    it('one line + esc', () => {
      expect(trimmed`\\oo`).to.deep.equal({
        cooked: [ '\\oo' ],
        raw: [ '\\\\oo' ]
      })
    })
    it('two lines', () => {
      expect(trimmed`
      `).to.deep.equal({
        cooked: [ '\n' ],
        raw: [ '\n' ]
      })
    })
    it('three lines + escs', () => {
      expect(trimmed`
      \foo \u1234 \x56 \n        \r\n \0
      \bar`).to.deep.equal({
        cooked: [ '\n\foo \u1234 \x56 \n        \r\n \0\n\bar' ],
        raw: [ '\n\\foo \\u1234 \\x56 \\n        \\r\\n \\0\n\\bar' ]
      })
    })
    it('variable indentation', () => {
      const world = 'Earth'
      expect(trimmed`
      {
        Hello, ${world}!
      }`).to.deep.equal({
        cooked: [ '\n{\n  Hello, ', '!\n}' ],
        raw: [ '\n{\n  Hello, ', '!\n}' ]
      })
    })
    it('line continuation', () => {
      expect(trimmed`
      foo\
      bar`).to.deep.equal({
        cooked: [ '\nfoobar' ],
        raw: [ '\nfoo\\\nbar' ]
      })
    })
    it('redundant escape', () => {
      expect(trimmed`
      foo\/bar
      baz`).to.deep.equal({
        cooked: [ '\nfoo/bar\nbaz' ],
        raw: [ '\nfoo\\/bar\nbaz' ]
      })
    })
    it('minimum in subsequent line', () => {
      const world = 'Earth'
      expect(trimmed`
        >
      Hello, ${world}!
        <`)
        .to.deep.equal({
          cooked: [ '\n  >\nHello, ', '!\n  <' ],
          raw: [ '\n  >\nHello, ', '!\n  <' ]
        })
    })
    it('mix of spaces and tabs', () => {
      const world = 'Earth'

      const strings = [ '\n\t>\n Hello, ', '!\n\t<' ]
      strings.raw = Object.freeze(strings.slice())
      Object.freeze(strings)

      expect(trimmed(strings, world))
        .to.deep.equal({
          cooked: [ '\n\t>\n Hello, ', '!\n\t<' ],
          raw: [ '\n\t>\n Hello, ', '!\n\t<' ]
        })
    })
    it('late line not indented', () => {
      expect(trimmed`
        foo
        bar
baz`)
        .to.deep.equal({
          cooked: [ '\n        foo\n        bar\nbaz' ],
          raw: [ '\n        foo\n        bar\nbaz' ]
        })
    })
    describe('eol flags', () => {
      function trimmer (options) {
        return (strings, ...vals) => {
          const trimmedStrings = trimCommonWhitespaceFromLines(strings, options)
          return {
            cooked: trimmedStrings.slice(),
            raw: trimmedStrings.raw
          }
        }
      }
      it('at start', () => {
        expect(
          trimmer({ trimEolAtStart: true })`
          bar
          `)
          .to.deep.equal({
            cooked: [ 'bar\n' ],
            raw: [ 'bar\n' ]
          })
      })
      it('at end', () => {
        expect(
          trimmer({ trimEolAtEnd: true })`
          bar
          `)
          .to.deep.equal({
            cooked: [ '\nbar' ],
            raw: [ '\nbar' ]
          })
      })
      it('at both', () => {
        expect(
          trimmer({ trimEolAtStart: true, trimEolAtEnd: true })`
          bar
          `)
          .to.deep.equal({
            cooked: [ 'bar' ],
            raw: [ 'bar' ]
          })
      })
      it('without dedenting', () => {
        expect(
          trimmer({ trimEolAtStart: true, trimEolAtEnd: true })`
bar
`)
          .to.deep.equal({
            cooked: [ 'bar' ],
            raw: [ 'bar' ]
          })
      })
    })
  })

  describe('TypedString', () => {
    class MyTypedString extends TypedString {}
    Object.defineProperty(
      MyTypedString, 'contractKey', { value: 'MyTypedString' })
    const verifier = Mintable.verifierFor(MyTypedString)

    it('mints', () => {
      const instance = Mintable.minterFor(MyTypedString)('foo')
      expect(instance.content).to.equal('foo')
      expect(String(instance)).to.equal('foo')
      expect(verifier(instance)).to.equal(true)
    })
    it('read-only', () => {
      const instance = Mintable.minterFor(MyTypedString)('foo')
      expect(
        function mutate () { // eslint-disable-line prefer-arrow-callback
          // ESLint is just wrong about strict being unnecessary in a module context
          // eslint-disable-next-line strict
          'use strict'

          instance.content = 'bar'
        })
        .throws()
      expect(instance.content).to.equal('foo')
    })
  })

  describe('example code from README', () => {
    // WARNING:
    // These tests come from the README.md.  If you make changes here,
    // be sure to reflect them there.
    it('csv', () => {
      /**
       * A fragment of CSV.
       * Unlike simple strings, numbers, or Dates,
       * fragments may span multiple cells.
       */
      class CsvFragment extends TypedString {}

      Object.defineProperty(
        CsvFragment,
        'contractKey',
        { value: 'CsvFragment' })

      const isCsvFragment = Mintable.verifierFor(CsvFragment)
      const mintCsvFragment = Mintable.minterFor(CsvFragment)

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
          // Standard JS complains about ${...} in a string literal
          const placeholder = [ '$', '{...}' ].join('')
          throw new Error(
            `Missing quote in CSV: \`${raw.join(placeholder)}\``)
        }
        return { raw, contexts }
      }

      // Called with the result above, then the static chunks of text, then the
      // dynamic values to compute the actual result.
      function interpolateValuesIntoCsv (options, { raw, contexts }, strings, values) {
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

      expect(
        csv`
          foo,${1},${mintCsvFragment('bar,bar')}
          ${'ab"c'},baz,"boo${'\n'}",far
          `
          .toString())
        .to.equal(
          'foo,"1",bar,bar\n' +
          '"ab\\"c",baz,"boo\\n",far')
    })
  })
})
