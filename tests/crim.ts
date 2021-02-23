import 'isomorphic-fetch'
import { expect } from 'chai'
import { JSDOM } from 'jsdom'
import * as csvparse from 'csv-parse'
import * as fs from 'fs'
import * as path from 'path'

import EmaMei from '../src/EmaMei'
import EmaMeiProcessor from '../src/EmaMeiProcessor'

const j: JSDOM = new JSDOM()
const xmlParser = new j.window.DOMParser()

describe('EMA for MEI - CRIM Tests', () => {
  // Put together CRIM EMA expressions from data/crim.csv and
  // test the EMA expression there against the old python implementation.

  const crimMEIBaseURL = 'https://crimproject.org/mei/'

  it('should test CRIM EMA expressions', async () => {
    const csvParser = await csvparse({columns: true}, async (err, records) => {
      for (const record of records) {
        const meiURL = encodeURIComponent(`${crimMEIBaseURL}${record['piece.piece_id']}.mei`)
        const emaExpr = `${meiURL}/${record.ema}`

        const resOmas = await fetch(`http://ema.crimproject.org/${emaExpr}`)
        if (resOmas.status >= 400) {
          console.log(`Could not retrieve http://ema.crimproject.org/${emaExpr}. Error: ${resOmas.statusText}`)
          return
        }
        if (!resOmas.ok) {
          throw new Error(resOmas.statusText)
        }
        const omasResult = await resOmas.text()

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

            // console.log(os.outerHTML)
            // console.log(js.outerHTML)

            expect(os.querySelectorAll('*').length)
              .equal(js.querySelectorAll('*').length)

            expect(os.querySelectorAll('*|layer *').length)
              .equal(js.querySelectorAll('*|layer *').length)

          }
        }
      }
    })

    await fs.createReadStream(path.resolve(__dirname, 'data/crim.csv')).pipe(csvParser)

  }).timeout(Infinity)
})
