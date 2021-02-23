import 'isomorphic-fetch'
import * as jsonld from 'jsonld'
import { expect } from 'chai'
import { JSDOM } from 'jsdom'
import * as pLimit from 'p-limit'

import EmaMei from '../src/EmaMei'
import EmaMeiProcessor from '../src/EmaMeiProcessor'

const j: JSDOM = new JSDOM()
const xmlParser = new j.window.DOMParser()

const nanopubServer = 'http://digitalduchemin.org:8080/nanopub-server'
const nanopubListURL = `${nanopubServer}/nanopubs.txt`
const OASpecificResource = 'http://www.w3.org/ns/oa#SpecificResource'
const OAHasSource = 'http://www.w3.org/ns/oa#hasSource'
// const totPages = 11

const limit = pLimit(1)

describe('EMA for MEI - Remote Digital DuChemin Tests', () => {
  // Get a page of Digital DuChemin Nanopublications and
  // test the EMA expression there against the old python implementation.
  it('should test a page of Digital DuChemin nanopubs', async () => {
    const resList = await fetch(`${nanopubListURL}?page=1`)
    if (!resList.ok) {
      throw new Error(resList.statusText)
    }
    const list: string = await resList.text()

    const npURIs = list.split('\r\n').filter(x => x !== '')

    for (const npURI of npURIs) {
      // for (const npURI of [npURIs[0]]) {
      const npID = npURI.substring(npURI.lastIndexOf('.')+1)
      const npURL = `${nanopubServer}/${npID}.jsonld`

      const resGraphs = await fetch(npURL)
      if (!resGraphs.ok) {
        throw new Error(resGraphs.statusText)
      }
      const graphs = await resGraphs.json()

      const frame = await jsonld.frame(graphs, {
        '@type': OASpecificResource
      })

      const subGraph = frame[OAHasSource] as jsonld.NodeObject
      const ema = subGraph['@id'].replace('mith.umd.edu/ema', 'ema.mith.us')

      const resOmas = await limit(async () => await fetch(ema))
      if (resOmas.status >= 400) {
        console.log(`Could not retrieve ${ema}`)
        continue
      }
      if (!resOmas.ok) {
        throw new Error(resOmas.statusText)
      }
      const omasResult = await resOmas.text()

      const emaExpr = ema.replace('http://ema.mith.us', '')
      console.log(`Checking: ${emaExpr}`)
      const emaMei: EmaMeiProcessor = await EmaMei.withFullExpr(emaExpr)

      const omasSelection = xmlParser.parseFromString(omasResult, 'text/xml')
      const emaJsSelection = emaMei.getSelection()

      const omasMeasures = omasSelection.querySelectorAll('*|music *|measure')
      const emaJsMeasures = emaJsSelection.querySelectorAll('*|music *|measure')

      // Compare measures total
      expect(omasMeasures.length)
        .equal(emaJsMeasures.length)

      // Compare staves total per measure
      for (const [mIdx, om] of Array.from(omasMeasures).entries()) {
        const jm = emaJsMeasures[mIdx]
        // NB: only checking measure > staff because editorial elements (e.g. app/rdg)
        // are treated differently in the two implementations (API is agnostic).
        const omasStaves = om.querySelectorAll('*|measure > *|staff')
        const emaJsStaves = jm.querySelectorAll('*|measure > *|staff')
        expect(omasStaves.length)
          .equal(emaJsStaves.length)

        // Compare number of elements in staff and layer
        for (const [sIdx, os] of Array.from(omasStaves).entries()) {
          const js = emaJsStaves[sIdx]

          expect(os.querySelectorAll('*').length)
            .equal(js.querySelectorAll('*').length)

          expect(os.querySelectorAll('*|layer *').length)
            .equal(js.querySelectorAll('*|layer *').length)

        }
      }
    }
  }).timeout(Infinity)
})
