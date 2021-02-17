import 'isomorphic-fetch'
import * as jsonld from 'jsonld'
import { expect } from 'chai'
import { JSDOM } from 'jsdom'

import EmaMei from '../src/EmaMei'
import EmaMeiProcessor from '../src/EmaMeiProcessor'

const j: JSDOM = new JSDOM()
const xmlParser = new j.window.DOMParser()

const nanopubServer = 'http://digitalduchemin.org:8080/nanopub-server'
const nanopubListURL = `${nanopubServer}/nanopubs.txt`
const OASpecificResource = 'http://www.w3.org/ns/oa#SpecificResource'
const OAHasSource = 'http://www.w3.org/ns/oa#hasSource'
// const totPages = 11

describe('EMA for MEI - Remote Digital DuChemin Tests', () => {
  // Get a page of Digital DuChemin Nanopublications and
  // test the EMA expression there against the old python implementation.
  it('should test a page of Digital DuChemin nanopubs', async () => {
    const list: string = await fetch(`${nanopubListURL}?page=1`).then(response => {
      if (!response.ok) {
        throw new Error(response.statusText)
      }
      return response.text()
    })

    const npURIs = list.split('\r\n').filter(x => x !== '')

    for (const npURI of npURIs) {
      // for (const npURI of [npURIs[0]]) {
      const npID = npURI.substring(npURI.lastIndexOf('.')+1)
      const npURL = `${nanopubServer}/${npID}.jsonld`

      const graphs = await fetch(npURL).then(r => {
        if (!r.ok) {
          throw new Error(r.statusText)
        }
        return r.json()
      })

      const ema = await jsonld.frame(graphs, {
        '@type': OASpecificResource
      }).then(f => {
        const subGraph = f[OAHasSource] as jsonld.NodeObject
        return subGraph['@id'].replace('mith.umd.edu/ema', 'ema.mith.us')
      })

      let untestable = false
      const omasResult = await fetch(ema).then(r => {
        if (r.status >= 400) {
          untestable = true
          return
        }
        if (!r.ok) {
          throw new Error(r.statusText)
        }
        return r.text()
      })

      if (untestable) {
        console.log(`Could not retrieve ${ema}`)
        continue
      }

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
      for (const [i, om] of Array.from(omasMeasures).entries()) {
        const jm = emaJsMeasures[i]
        const omasStaves = om.querySelectorAll('*|staff')
        const emaJsStaves = jm.querySelectorAll('*|staff')
        expect(omasStaves.length)
          .equal(emaJsStaves.length)

        // Compare number of elements in staff and layer
        for (const [i, os] of Array.from(omasStaves).entries()) {
          const js = emaJsStaves[i]

          expect(os.querySelectorAll('*').length)
            .equal(js.querySelectorAll('*').length)

          expect(os.querySelectorAll('*|layer *').length)
            .equal(js.querySelectorAll('*|layer *').length)

        }
      }
    }
  }).timeout(Infinity)
})
