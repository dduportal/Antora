/* eslint-env mocha */
'use strict'

const { expect, expectCalledWith, heredoc, spy } = require('../../../test/test-utils')

const convertDocument = require('@antora/document-converter')

describe('convertDocument()', () => {
  let inputFile

  const expectPageLink = (html, url, content) => expect(html).to.include(`<a href="${url}" class="page">${content}</a>`)

  beforeEach(() => {
    inputFile = {
      path: 'modules/module-a/pages/page-a.adoc',
      dirname: 'modules/module-a/pages',
      mediaType: 'text/asciidoc',
      src: {
        path: 'modules/module-a/pages/page-a.adoc',
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relative: 'page-a.adoc',
        basename: 'page-a.adoc',
        stem: 'page-a',
        extname: '.adoc',
        mediaType: 'text/asciidoc',
        moduleRootPath: '..',
      },
      pub: {
        url: '/component-a/1.2.3/module-a/page-a.html',
        moduleRootPath: '..',
        rootPath: '../../..',
      },
    }
  })

  it('should convert AsciiDoc contents on file to HTML', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Page Title

      == Section Title

      Grab the link:{attachmentsdir}/quickstart-project.zip[quickstart project].

      * list item 1
      * list item 2
      * list item 3

      image::screenshot.png[]
    `)
    expect(convertDocument(inputFile))
      .to.be.fulfilled()
      .then(() => {
        expect(inputFile.mediaType).to.equal('text/html')
        expect(inputFile.contents.toString()).to.equal(heredoc`
          <div class="sect1">
          <h2 id="_section_title"><a class="anchor" href="#_section_title"></a>Section Title</h2>
          <div class="sectionbody">
          <div class="paragraph">
          <p>Grab the <a href="../_attachments/quickstart-project.zip">quickstart project</a>.</p>
          </div>
          <div class="ulist">
          <ul>
          <li>
          <p>list item 1</p>
          </li>
          <li>
          <p>list item 2</p>
          </li>
          <li>
          <p>list item 3</p>
          </li>
          </ul>
          </div>
          <div class="imageblock">
          <div class="content">
          <img src="../_images/screenshot.png" alt="screenshot">
          </div>
          </div>
          </div>
          </div>
        `)
      })
  })

  it('should set formatted document title to asciidoc.doctitle property on file object', () => {
    inputFile.contents = Buffer.from(heredoc`
      = _Awesome_ Document Title

      article contents
    `)
    expect(convertDocument(inputFile))
      .to.be.fulfilled()
      .then(() => {
        expect(inputFile.asciidoc).to.exist()
        expect(inputFile.asciidoc.doctitle).to.equal('<em>Awesome</em> Document Title')
      })
  })

  it('should not set asciidoc.doctitle property on file object if document has no header', () => {
    inputFile.contents = Buffer.from(heredoc`
      article contents only
    `)
    expect(convertDocument(inputFile))
      .to.be.fulfilled()
      .then(() => {
        expect(inputFile.asciidoc).to.exist()
        expect(inputFile.asciidoc.doctitle).to.not.exist()
      })
  })

  it('should save document header attributes to asciidoc.attributes property on file object', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Document Title
      :keywords: CSS, flexbox, layout, box model

      article contents
    `)
    expect(convertDocument(inputFile))
      .to.be.fulfilled()
      .then(() => {
        expect(inputFile.asciidoc).to.exist()
        const attrs = inputFile.asciidoc.attributes
        expect(attrs).to.exist()
        expect(attrs).to.include({
          docfile: inputFile.path,
          env: 'site',
          imagesdir: inputFile.pub.moduleRootPath + '/_images',
          keywords: 'CSS, flexbox, layout, box model',
        })
      })
  })

  it('should pass custom attributes to processor', () => {
    const customAttrs = {
      'product-name': 'Hi-Speed Tonic',
      'source-highlighter': 'html-pipeline',
    }
    inputFile.contents = Buffer.from(heredoc`
      = Document Title

      Get there in a flash with {product-name}.
    `)
    expect(convertDocument(inputFile, customAttrs))
      .to.be.fulfilled()
      .then(() => {
        expect(inputFile.contents.toString()).to.include(customAttrs['product-name'])
        expect(inputFile.asciidoc).to.exist()
        const attrs = inputFile.asciidoc.attributes
        expect(attrs).to.exist()
        expect(attrs).to.include(customAttrs)
      })
  })

  it('should convert page reference to URL of page in content catalog', () => {
    inputFile.contents = Buffer.from('xref:module-b:page-b.adoc[Page B]')
    const targetFile = {
      pub: {
        url: '/component-a/1.2.3/module-b/page-b.html',
      },
    }
    const contentCatalog = { getById: spy(() => targetFile) }
    expect(convertDocument(inputFile, {}, contentCatalog))
      .to.be.fulfilled()
      .then(() => {
        expectCalledWith(contentCatalog.getById, {
          component: 'component-a',
          version: '1.2.3',
          module: 'module-b',
          family: 'page',
          relative: 'page-b.adoc',
        })
        expectPageLink(inputFile.contents.toString(), '../module-b/page-b.html', 'Page B')
      })
  })

  it('should resolve target of include directive to file in content catalog', () => {
    inputFile.contents = Buffer.from('include::{partialsdir}/definitions.adoc[]')
    const partialFile = {
      path: 'modules/module-a/pages/_partials/definitions.adoc',
      dirname: 'modules/module-a/pages/_partials',
      contents: Buffer.from(`cloud: someone else's computer`),
      src: {
        path: 'modules/module-a/pages/_partials/definitions.adoc',
        dirname: 'modules/module-a/pages/_partials',
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'partial',
        relative: 'definitions.adoc',
      },
    }
    const contentCatalog = { getById: spy(() => partialFile) }
    expect(convertDocument(inputFile, {}, contentCatalog))
      .to.be.fulfilled()
      .then(() => {
        expectCalledWith(contentCatalog.getById, {
          component: 'component-a',
          version: '1.2.3',
          module: 'module-a',
          family: 'partial',
          relative: 'definitions.adoc',
        })
        expect(inputFile.contents.toString()).to.include('cloud: someone else&#8217;s computer')
      })
  })

  it('should be able to include a page marked as a partial which has already been converted', () => {
    inputFile.contents = Buffer.from(heredoc`
      = Page Title

      == Recent Changes

      include::changelog.adoc[tag=entries,leveloffset=+1]
    `)
    const includedFile = {
      path: 'modules/module-a/pages/changelog.adoc',
      dirname: 'modules/module-a/pages',
      contents: Buffer.from(heredoc`
        = Changelog
        :page-partial:

        // tag::entries[]
        == Version 1.1

        * Bug fixes.
        // end::entries[]
      `),
      src: {
        path: 'modules/module-a/pages/changelog.adoc',
        dirname: 'modules/module-a/pages',
        component: 'component-a',
        version: '1.2.3',
        module: 'module-a',
        family: 'page',
        relative: 'changelog.adoc',
      },
      pub: {
        url: '/component-a/1.2.3/module-a/changelog.html',
        moduleRootPath: '..',
        rootPath: '../../..',
      },
    }
    const contentCatalog = { getByPath: spy(() => includedFile) }
    expect(convertDocument(includedFile))
      .to.be.fulfilled()
      .then(() => {
        expect(convertDocument(inputFile, {}, contentCatalog))
          .to.be.fulfilled()
          .then(() => {
            expectCalledWith(contentCatalog.getByPath, {
              component: 'component-a',
              version: '1.2.3',
              path: 'modules/module-a/pages/changelog.adoc',
            })
            expect(inputFile.contents.toString()).to.include(heredoc`
              <div class="sect1">
              <h2 id="_recent_changes"><a class="anchor" href="#_recent_changes"></a>Recent Changes</h2>
              <div class="sectionbody">
              <div class="sect2">
              <h3 id="_version_1_1"><a class="anchor" href="#_version_1_1"></a>Version 1.1</h3>
              <div class="ulist">
              <ul>
              <li>
              <p>Bug fixes.</p>
              </li>
              </ul>
              </div>
              </div>
              </div>
              </div>
            `)
          })
      })
  })
})