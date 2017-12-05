/* eslint-env mocha */
'use strict'

const { expect, spy } = require('../../../test/test-utils')
const convertDocument = require('../lib/index')

const Buffer = require('buffer').Buffer

// because of how Opal works, we can't use ".to.have.been.called.with({})" on spies
// it makes the tests hang indefinitely when the test fails
// instead we directly use the spy calls property
// expect(mySpy.__spy.calls[0][0]).to.eql({})

function spyResult (mySpy) {
  return mySpy.__spy.calls[0][0]
}

describe('convertDocument()', () => {
  let file

  function setAsciiDocContents (asciiDocContents) {
    if (!Array.isArray(asciiDocContents)) {
      setAsciiDocContents([asciiDocContents])
    } else {
      file.contents = Buffer.from(asciiDocContents.join('\n'))
    }
  }

  beforeEach(() => {
    file = {
      path: '/modules/module-foo/documents/page-one.adoc',
      src: {
        component: 'component-foo',
        version: 'v1.2.3',
        module: 'module-foo',
        family: 'page',
        subpath: '',
        moduleRootPath: '..',
        stem: 'page-one',
        extname: '.adoc',
      },
      out: {
        dirname: '/component-foo/v1.2.3/module-foo/the-subpath',
        basename: 'page-one.html',
        path: '/component-foo/v1.2.3/module-foo/the-subpath/page-one.html',
        moduleRootPath: '..',
        rootPath: '../../../..',
      },
      pub: {
        url: '/component-foo/v1.2.3/module-foo/the-subpath/page-one.html',
        absoluteUrl: 'https://the-website.tld/component-foo/v1.2.3/module-foo/the-subpath/page-one.html',
        rootPath: '../../../..',
      },
    }
  })

  it('should attach correct attributes', () => {
    setAsciiDocContents('= The Title')
    return expect(convertDocument(file))
      .to.be.fulfilled()
      .then(() => {
        expect(file.asciidoc.attributes).to.include({
          // from option safe: 'safe'
          'safe-mode-name': 'safe',
          'safe-mode-safe': '',
          // from fixed attributes
          docname: 'page-one',
          docfile: '/modules/module-foo/documents/page-one.adoc',
          docfilesuffix: '.adoc',
          'env-site': '',
          imagesdir: '../_images',
          attachmentsdir: '../_attachments',
          fragmentsdir: '$fragments$',
          samplesdir: '$samples$',
          // from overridable attributes
          'source-highlighter': 'highlight.js',
          sectanchors: '',
          idprefix: '',
          idseparator: '-',
          icons: 'font',
          // other important attributes
          doctitle: 'The Title',
        })
      })
  })

  it('should use overridable attributes from playbook', () => {
    setAsciiDocContents('= The Title')
    return expect(
      convertDocument(file, {
        'source-highlighter': 'highlighter-foo',
        sectanchors: 'sectanchors',
        idprefix: 'idprefix',
        idseparator: 'idseparator',
        icons: 'icons',
      })
    )
      .to.be.fulfilled()
      .then(() => {
        expect(file.asciidoc.attributes).to.include({
          'source-highlighter': 'highlighter-foo',
          sectanchors: 'sectanchors',
          idprefix: 'idprefix',
          idseparator: 'idseparator',
          icons: 'icons',
        })
      })
  })

  it('should NOT override "fixed" attributes with playbook', () => {
    setAsciiDocContents('= The Title')
    return expect(
      convertDocument(file, {
        docname: 'foobar',
        docfile: 'foobar',
        docfilesuffix: 'foobar',
        'env-site': 'foobar',
        imagesdir: 'foobar',
        attachmentsdir: 'foobar',
        samplesdir: 'foobar',
        fragmentsdir: 'foobar',
      })
    )
      .to.be.fulfilled()
      .then(() => {
        expect(file.asciidoc.attributes).not.to.include({
          docname: 'foobar',
          docfile: 'foobar',
          docfilesuffix: 'foobar',
          'env-site': 'foobar',
          imagesdir: 'foobar',
          attachmentsdir: 'foobar',
          samplesdir: 'foobar',
          fragmentsdir: 'foobar',
        })
      })
  })

  it('should convert simple AsciiDoc contents', () => {
    setAsciiDocContents(['= The Title', '', '== The Subtitle', '', '* One', '* Two', '* Three'])
    return expect(convertDocument(file))
      .to.be.fulfilled()
      .then(() => {
        const asciidocContents = file.contents.toString()
        expect(asciidocContents).to.equal(
          [
            '<div class="sect1">',
            '<h2 id="the-subtitle"><a class="anchor" href="#the-subtitle"></a>The Subtitle</h2>',
            '<div class="sectionbody">',
            '<div class="ulist">',
            '<ul>',
            '<li>',
            '<p>One</p>',
            '</li>',
            '<li>',
            '<p>Two</p>',
            '</li>',
            '<li>',
            '<p>Three</p>',
            '</li>',
            '</ul>',
            '</div>',
            '</div>',
            '</div>',
          ].join('\n')
        )
      })
  })

  describe('should convert AsciiDoc contents with include', () => {
    function fakeCatalogWithContents (stringContents) {
      return {
        getById: spy(() => ({ contents: Buffer.from(stringContents) })),
      }
    }

    it('sample', () => {
      setAsciiDocContents('include::{samplesdir}/included-file.json[]')
      const vfileCatalog = fakeCatalogWithContents('{ "foobar": 42 }')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          const asciidocContents = file.contents.toString()
          expect(asciidocContents).to.equal(['<div class="paragraph">', '<p>{ "foobar": 42 }</p>', '</div>'].join('\n'))
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-foo',
            family: 'sample',
            subpath: '',
            basename: 'included-file.json',
          })
        })
    })

    it('sample in a subpath', () => {
      setAsciiDocContents('include::{samplesdir}/the-subpath/included-file.json[]')
      const vfileCatalog = fakeCatalogWithContents('{ "foobar": 42 }')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          const asciidocContents = file.contents.toString()
          expect(asciidocContents).to.equal(['<div class="paragraph">', '<p>{ "foobar": 42 }</p>', '</div>'].join('\n'))
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-foo',
            family: 'sample',
            subpath: 'the-subpath',
            basename: 'included-file.json',
          })
        })
    })

    it('fragment', () => {
      setAsciiDocContents('include::{fragmentsdir}/included-file.adoc[]')
      const vfileCatalog = fakeCatalogWithContents('Hello *World*!')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          const asciidocContents = file.contents.toString()
          expect(asciidocContents).to.equal(
            ['<div class="paragraph">', '<p>Hello <strong>World</strong>!</p>', '</div>'].join('\n')
          )
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-foo',
            family: 'fragment',
            subpath: '',
            basename: 'included-file.adoc',
          })
        })
    })

    it('fragment in a sub/subpath)', () => {
      setAsciiDocContents('include::{fragmentsdir}/subpath-foo/subpath-bar/included-file.adoc[]')
      const vfileCatalog = fakeCatalogWithContents('Hello *World*!')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          const asciidocContents = file.contents.toString()
          expect(asciidocContents).to.equal(
            ['<div class="paragraph">', '<p>Hello <strong>World</strong>!</p>', '</div>'].join('\n')
          )
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-foo',
            family: 'fragment',
            subpath: 'subpath-foo/subpath-bar',
            basename: 'included-file.adoc',
          })
        })
    })

    it('with bad format', () => {
      setAsciiDocContents('include::/foobar/some-file.adoc[]')
      const vfileCatalog = { getById: spy() }
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          const asciidocContents = file.contents.toString()
          expect(asciidocContents).to.equal(
            ['<div class="paragraph">', '<p>include::/foobar/some-file.adoc[]</p>', '</div>'].join('\n')
          )

          expect(vfileCatalog.getById).not.to.have.been.called()
        })
    })

    it('unknown in the catalog', () => {
      setAsciiDocContents('include::{samplesdir}/included-file.json[]')
      const vfileCatalog = { getById: spy(() => null) }
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          const asciidocContents = file.contents.toString()
          expect(asciidocContents).to.equal(
            ['<div class="paragraph">', '<p>include::$samples$/included-file.json[]</p>', '</div>'].join('\n')
          )
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-foo',
            family: 'sample',
            subpath: '',
            basename: 'included-file.json',
          })
        })
    })
  })

  describe('should convert AsciiDoc contents with xref', () => {
    function expectLink (file, link, title) {
      const asciidocContents = file.contents.toString()
      expect(asciidocContents).to.equal(
        ['<div class="paragraph">', `<p><a href="${link}">${title}</a></p>`, '</div>'].join('\n')
      )
    }

    function fakeCatalogWithUrl (url) {
      return {
        getById: spy(() => ({ pub: { url } })),
      }
    }

    it('version + component + module + subpath + file', () => {
      setAsciiDocContents('xref:v4.5.6@component-bar:module-bar:subpath-foo/subpath-bar/the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-bar/v4.5.6/module-bar/subpath-foo/subpath-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          '/component-foo/v1.2.3/the-module/the-subpath/page-one.html'
          expectLink(
            file,
            '../../../../component-bar/v4.5.6/module-bar/subpath-foo/subpath-bar/the-page.html',
            'The Title'
          )
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-bar',
            version: 'v4.5.6',
            module: 'module-bar',
            family: 'page',
            subpath: 'subpath-foo/subpath-bar',
            basename: 'the-page.adoc',
          })
        })
    })

    it('version + component + module + subpath + file with fragment', () => {
      setAsciiDocContents(
        'xref:v4.5.6@component-bar:module-bar:subpath-foo/subpath-bar/the-page#the-fragment[The Title]'
      )
      const vfileCatalog = fakeCatalogWithUrl(
        '/component-bar/v4.5.6/module-bar/subpath-foo/subpath-bar/the-page.html#fragment'
      )
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(
            file,
            '../../../../component-bar/v4.5.6/module-bar/subpath-foo/subpath-bar/the-page.html#fragment',
            'The Title'
          )
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-bar',
            version: 'v4.5.6',
            module: 'module-bar',
            family: 'page',
            subpath: 'subpath-foo/subpath-bar',
            basename: 'the-page.adoc',
          })
        })
    })

    it('version + module + subpath + file', () => {
      setAsciiDocContents('xref:v4.5.6@module-bar:the-subpath/the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v4.5.6/module-bar/subpath-foo/subpath-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../v4.5.6/module-bar/subpath-foo/subpath-bar/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v4.5.6',
            module: 'module-bar',
            family: 'page',
            subpath: 'the-subpath',
            basename: 'the-page.adoc',
          })
        })
    })

    it('component + module + subpath + file', () => {
      setAsciiDocContents('xref:component-bar:module-bar:subpath-foo/subpath-bar/the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-bar/master/module-bar/subpath-foo/subpath-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(
            file,
            '../../../../component-bar/master/module-bar/subpath-foo/subpath-bar/the-page.html',
            'The Title'
          )
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-bar',
            version: 'master',
            module: 'module-bar',
            family: 'page',
            subpath: 'subpath-foo/subpath-bar',
            basename: 'the-page.adoc',
          })
        })
    })

    it('version + component + subpath + file', () => {
      setAsciiDocContents('xref:v4.5.6@component-bar::subpath-foo/subpath-bar/the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-bar/v4.5.6/ROOT/subpath-foo/subpath-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../../component-bar/v4.5.6/ROOT/subpath-foo/subpath-bar/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-bar',
            version: 'v4.5.6',
            module: 'ROOT',
            family: 'page',
            subpath: 'subpath-foo/subpath-bar',
            basename: 'the-page.adoc',
          })
        })
    })

    it('version + component + module + file', () => {
      setAsciiDocContents('xref:v4.5.6@component-bar:module-bar:the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-bar/v4.5.6/module-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../../component-bar/v4.5.6/module-bar/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-bar',
            version: 'v4.5.6',
            module: 'module-bar',
            family: 'page',
            subpath: '',
            basename: 'the-page.adoc',
          })
        })
    })

    it('component + subpath + file', () => {
      setAsciiDocContents('xref:component-bar::subpath-foo/subpath-bar/the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-bar/master/ROOT/subpath-foo/subpath-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../../component-bar/master/ROOT/subpath-foo/subpath-bar/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-bar',
            version: 'master',
            module: 'ROOT',
            family: 'page',
            subpath: 'subpath-foo/subpath-bar',
            basename: 'the-page.adoc',
          })
        })
    })

    it('component + module + file', () => {
      setAsciiDocContents('xref:component-bar:module-bar:the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-bar/master/module-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../../component-bar/master/module-bar/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-bar',
            version: 'master',
            module: 'module-bar',
            family: 'page',
            subpath: '',
            basename: 'the-page.adoc',
          })
        })
    })

    it('version + subpath + file', () => {
      setAsciiDocContents('xref:v4.5.6@the-subpath/the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v4.5.6/ROOT/the-subpath/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../v4.5.6/ROOT/the-subpath/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v4.5.6',
            module: 'ROOT',
            family: 'page',
            subpath: 'the-subpath',
            basename: 'the-page.adoc',
          })
        })
    })

    it('version + module + file', () => {
      setAsciiDocContents('xref:v4.5.6@module-bar:the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v4.5.6/module-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../v4.5.6/module-bar/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v4.5.6',
            module: 'module-bar',
            family: 'page',
            subpath: '',
            basename: 'the-page.adoc',
          })
        })
    })

    it('version + component + file', () => {
      setAsciiDocContents('xref:v4.5.6@component-bar::the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-bar/v4.5.6/ROOT/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../../component-bar/v4.5.6/ROOT/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-bar',
            version: 'v4.5.6',
            module: 'ROOT',
            family: 'page',
            subpath: '',
            basename: 'the-page.adoc',
          })
        })
    })

    it('module + subpath + file', () => {
      setAsciiDocContents('xref:module-bar:subpath-foo/subpath-bar/the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v1.2.3/module-bar/subpath-foo/subpath-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../module-bar/subpath-foo/subpath-bar/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-bar',
            family: 'page',
            subpath: 'subpath-foo/subpath-bar',
            basename: 'the-page.adoc',
          })
        })
    })

    it('version + file', () => {
      setAsciiDocContents('xref:v4.5.6@the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v4.5.6/ROOT/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../v4.5.6/ROOT/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v4.5.6',
            module: 'ROOT',
            family: 'page',
            subpath: '',
            basename: 'the-page.adoc',
          })
        })
    })

    it('component + file', () => {
      setAsciiDocContents('xref:component-bar::the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-bar/master/ROOT/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../../../component-bar/master/ROOT/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-bar',
            version: 'master',
            module: 'ROOT',
            family: 'page',
            subpath: '',
            basename: 'the-page.adoc',
          })
        })
    })

    it('subpath/subpath + file', () => {
      setAsciiDocContents('xref:subpath-foo/subpath-bar/the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v1.2.3/module-foo/subpath-foo/subpath-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../subpath-foo/subpath-bar/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-foo',
            family: 'page',
            subpath: 'subpath-foo/subpath-bar',
            basename: 'the-page.adoc',
          })
        })
    })

    it('subpath + file', () => {
      setAsciiDocContents('xref:the-subpath/the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v1.2.3/module-foo/subpath-foo/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../subpath-foo/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-foo',
            family: 'page',
            subpath: 'the-subpath',
            basename: 'the-page.adoc',
          })
        })
    })

    it('module + file', () => {
      setAsciiDocContents('xref:module-bar:the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v1.2.3/module-bar/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../../module-bar/the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-bar',
            family: 'page',
            subpath: '',
            basename: 'the-page.adoc',
          })
        })
    })

    it('file', () => {
      setAsciiDocContents('xref:the-page.adoc[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v1.2.3/module-foo/the-page.html')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../the-page.html', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-foo',
            family: 'page',
            subpath: '',
            basename: 'the-page.adoc',
          })
        })
    })

    it('file with #fragment', () => {
      setAsciiDocContents('xref:the-page.adoc#the-fragment[The Title]')
      const vfileCatalog = fakeCatalogWithUrl('/component-foo/v1.2.3/module-foo/the-page.html#fragment')
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '../the-page.html#fragment', 'The Title')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'module-foo',
            family: 'page',
            subpath: '',
            basename: 'the-page.adoc',
          })
        })
    })

    it('unknown in the catalog', () => {
      setAsciiDocContents('xref:v1.2.3@component-foo:the-module:subpath-foo/subpath-bar/the-page.adoc[The Title]')
      const vfileCatalog = { getById: spy(() => null) }
      return expect(convertDocument(file, null, vfileCatalog))
        .to.be.fulfilled()
        .then(() => {
          expectLink(file, '#', 'v1.2.3@component-foo:the-module:subpath-foo/subpath-bar/the-page')
          expect(spyResult(vfileCatalog.getById)).to.eql({
            component: 'component-foo',
            version: 'v1.2.3',
            module: 'the-module',
            family: 'page',
            subpath: 'subpath-foo/subpath-bar',
            basename: 'the-page.adoc',
          })
        })
    })
  })
})