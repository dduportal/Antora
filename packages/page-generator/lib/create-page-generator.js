'use strict'

const handlebars = require('handlebars')
const path = require('path')
const requireFromString = require('require-from-string')
const versionCompare = require('@antora/content-classifier/lib/util/version-compare-desc')

const { DEFAULT_LAYOUT_NAME, HANDLEBARS_COMPILE_OPTIONS } = require('./constants')

/**
 * Generates a function to generate a page.
 *
 * Compiles the Handlebars layouts, along with the partials and helpers, and
 * builds the shared site UI model. Passes these objects to a generated
 * function, which can then be used to apply a layout template to pages.
 *
 * @memberof page-generator
 *
 * @param {Object} playbook - The configuration object for Antora.
 * @param {ContentCatalog} contentCatalog - The content catalog
 *   that provides access to the virtual files in the site.
 * @param {UiCatalog} uiCatalog - The file catalog
 *   that provides access to the UI files for the site.
 * @returns {Function} A function to generate a page (i.e., wrap the embeddable
 *   HTML contents in a standalone page layout).
 */
function createPageGenerator (playbook, contentCatalog, uiCatalog) {
  uiCatalog
    .findByType('helper')
    .forEach((file) => handlebars.registerHelper(file.stem, requireFromString(file.contents.toString(), file.path)))

  uiCatalog.findByType('partial').forEach((file) => handlebars.registerPartial(file.stem, file.contents.toString()))

  const layouts = uiCatalog.findByType('layout').reduce((accum, file) => {
    accum[file.stem] = handlebars.compile(file.contents.toString(), HANDLEBARS_COMPILE_OPTIONS)
    return accum
  }, {})

  return createPageGeneratorInternal(buildSiteUiModel(playbook, contentCatalog), layouts)
}

function createPageGeneratorInternal (site, layouts) {
  /**
   * Wraps the embeddable HTML contents of the specified file in a page layout.
   *
   * Builds a UI model from the file and its context, executes on the specified
   * page layout on that model, and assigns the result to the contents property
   * of the file. If no layout is specified on the file, the default layout is
   * used.
   *
   * @memberof page-generator
   *
   * @param {File} file - The virtual file the contains embeddeable HTML
   *   contents to wrap in a layout.
   * @param {ContentCatalog} contentCatalog - The content catalog
   *   that provides access to the virtual files in the site.
   * @param {NavigationCatalog} navigationCatalog - The navigation catalog
   *   that provides access to the navigation menu for each component version.
   * @returns {File} The file whose contents was wrapped in the specified page layout.
   */
  return function generatePage (file, contentCatalog, navigationCatalog) {
    // QUESTION should we pass the playbook to the uiModel?
    const uiModel = buildUiModel(file, contentCatalog, navigationCatalog, site)

    let layout = uiModel.page.layout
    if (!(layout in layouts)) {
      const defaultLayout = uiModel.site.ui.defaultLayout
      if (layout === defaultLayout) {
        throw new Error(`Layout ${layout} not found in`, layouts)
      }
      if (!(defaultLayout in layouts)) {
        throw new Error(`Neither layout ${layout} or default layout ${defaultLayout} found in`, layouts)
      }
      // TODO log a warning that the default template is being used; perhaps on file?
      layout = defaultLayout
    }

    // QUESTION should we call trim() on result?
    file.contents = Buffer.from(layouts[layout](uiModel))
    return file
  }
}

function buildUiModel (file, contentCatalog, navigationCatalog, site) {
  return {
    page: buildPageUiModel(file, contentCatalog, navigationCatalog, site),
    site,
    siteRootPath: file.pub.rootPath,
    uiRootPath: path.join(file.pub.rootPath, site.ui.url),
    // TODO siteRootUrl should only be set if there's a start/home page for the site
    // FIXME this really belongs on site, perhaps as site.startUrl (and needs to be relativized)
    //siteRootUrl
  }
}

function buildSiteUiModel (playbook, contentCatalog) {
  const model = { title: playbook.site.title }

  let siteUrl = playbook.site.url
  if (siteUrl) {
    if (siteUrl.charAt(siteUrl.length - 1) === '/') siteUrl = siteUrl.substr(0, siteUrl.length - 1)
    model.url = siteUrl
  }

  // QUESTION should components be pre-sorted?
  model.components = contentCatalog.getComponents().sort((a, b) => a.title.localeCompare(b.title))

  //let keys = playbook.site.keys
  //if (keys) model.keys = keys

  const uiConfig = playbook.ui
  model.ui = {
    url: path.resolve('/', uiConfig.outputDir),
    defaultLayout: uiConfig.defaultLayout || DEFAULT_LAYOUT_NAME,
  }

  return model
}

function buildPageUiModel (file, contentCatalog, navigationCatalog, site) {
  // QUESTION should attributes be scoped to AsciiDoc, or should this work regardless of markup language? file.data?
  const asciidoc = file.asciidoc || {}
  const attributes = asciidoc.attributes || {}
  const pageAttributes = {}
  Object.keys(attributes)
    .filter((name) => !name.indexOf('page-'))
    .forEach((name) => (pageAttributes[name.substr(5)] = attributes[name]))

  const { component: componentName, version } = file.src
  const url = file.pub.url

  const component = contentCatalog.getComponent(componentName)
  // QUESTION can we cache versions on file.rel so only computed once per page version group?
  const versions =
    component.versions.length > 1 ? getPageVersions(file.src, component, contentCatalog, { sparse: true }) : undefined
  const navigation = navigationCatalog.getMenu(componentName, version) || []
  const breadcrumbs = getBreadcrumbs(url, navigation)

  const model = {
    contents: file.contents,
    title: asciidoc.doctitle,
    url,
    description: attributes.description,
    keywords: attributes.keywords,
    attributes: pageAttributes,
    layout: pageAttributes.layout || site.ui.defaultLayout,
    component,
    componentVersion: component.versions.find((candidate) => candidate.version === version),
    version,
    module: file.src.module,
    versions,
    navigation,
    breadcrumbs,
    //editUrl: file.pub.editUrl,
    // NOTE we won't have a home until we have a root (and/or start) component
    // FIXME should be precomputed as file.pub.home; not necessarily root index page
    home: false,
  }

  if (site.url) {
    model.canonicalUrl = file.pub.canonicalUrl = site.url + (versions ? versions[0].url : url)
  }

  return model
}

function getBreadcrumbs (matchUrl, menu) {
  for (let i = 0, numTrees = menu.length; i < numTrees; i++) {
    const breadcrumbs = findBreadcrumbPath(matchUrl, menu[i])
    if (breadcrumbs) return breadcrumbs
  }
  return []
}

function findBreadcrumbPath (matchUrl, currentItem, currentPath = []) {
  if (currentItem.url === matchUrl && currentItem.urlType === 'internal') {
    return currentPath.concat(currentItem)
  }
  const items = currentItem.items
  let numItems
  if (items && (numItems = items.length)) {
    for (let i = 0; i < numItems; i++) {
      const matchingPath = findBreadcrumbPath(
        matchUrl,
        items[i],
        currentItem.content ? currentPath.concat(currentItem) : currentPath
      )
      if (matchingPath) return matchingPath
    }
  }
}

// QUESTION should this go in ContentCatalog?
// should it accept module and relative instead of pageSrc?
function getPageVersions (pageSrc, component, contentCatalog, opts = {}) {
  const pageIdSansVersion = {
    component: pageSrc.component,
    module: pageSrc.module,
    family: 'page',
    relative: pageSrc.relative,
  }
  if (opts.sparse) {
    if (component.versions.length > 1) {
      let pageVersions = contentCatalog.findBy(pageIdSansVersion).reduce((accum, page) => {
        accum[page.src.version] = { version: page.src.version, url: page.pub.url }
        return accum
      }, {})

      return component.versions
        .map(({ version, url }) => (version in pageVersions ? pageVersions[version] : { version, url, missing: true }))
        .sort((a, b) => versionCompare(a.version, b.version))
    }
  } else {
    const pages = contentCatalog.findBy(pageIdSansVersion)
    if (pages.length > 1) {
      return pages
        .map((page) => ({ version: page.src.version, url: page.pub.url }))
        .sort((a, b) => versionCompare(a.version, b.version))
    }
  }
}

module.exports = createPageGenerator
module.exports.buildSiteUiModel = buildSiteUiModel
module.exports.buildPageUiModel = buildPageUiModel
module.exports.buildUiModel = buildUiModel