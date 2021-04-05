import 'isomorphic-fetch'
import { JSDOM } from 'jsdom'
import * as fs from 'fs'
import * as path from 'path'
import * as csvParse from 'csv-parse/lib/sync'

import EmaMei from '../src/EmaMei'
import EmaMeiProcessor from '../src/EmaMeiProcessor'

const j: JSDOM = new JSDOM()
const xmlParser = new j.window.DOMParser()

const csvData: string = fs.readFileSync(path.resolve(__dirname, 'data/results.csv')).toString()
const results = csvParse(csvData)

let report = 'Expression, Passed, Notes\n'
async function run() {
  for (const [i, result] of results.entries()) {
    // if (i !== 1539) continue // use this for testing specific row.
    if (i === 0) continue

    // Known wrong Omas results
    if (i === 154 || i === 538 || i === 1588) {
      console.warn(`Skipping ${result[0]} because OMAS returns the wrong amount of measures`)
      report += `"${result[0]}", No, OMAS returns the wrong amount of measures\n`
      continue
    }
    if (i === 1531 || i === 1819 || i === 3110 || i === 3158) {
      console.warn(`Skipping ${result[0]} because OMAS returns the wrong amount of non continuous beats`)
      report += `"${result[0]}", No, OMAS returns the wrong amount of non-continuous beats\n`
      continue
    }
    if (result[1] !== '200') continue // skip failed downloads

    const expr: string = result[0]
    const file = result[2]
    const emaExpr = expr.replace('https://ema.crimproject.org/', '')

    const resultData: string = fs.readFileSync(path.resolve(__dirname, file)).toString()
    if (resultData.substring(0,1) !== '<') {
      console.warn(`Skipping ${emaExpr} because OMAS returned this message: ${resultData}`)
      report += `"${emaExpr}", No, EMA expression may be wrong. OMAS returned this message: ${resultData}\n`
      continue
    }

    const omasSelection = xmlParser.parseFromString(resultData, 'text/xml')

    const emaMei: EmaMeiProcessor = await EmaMei.withFullExpr(emaExpr)
    const emaJsSelection = emaMei.getSelection()

    compare(emaExpr, omasSelection, emaJsSelection)
  }
  return report
}

function compare (expr: string, omas: Document, emajs: Document) {
  const omasMeasures: NodeListOf<Element> = omas.querySelectorAll('*|music *|measure')
  const emaJsMeasures = emajs.querySelectorAll('*|music *|measure')
  console.log(`Checking ${expr}`)
  // Compare measures total
  if (omasMeasures.length !== emaJsMeasures.length) {
    throw new Error(`Different number of measures. Expected ${omasMeasures.length} but got ${emaJsMeasures.length}`)
  }
  for (const [mIdx, om] of Array.from(omasMeasures).entries()) {
    const jm = emaJsMeasures[mIdx]
    // NB: only checking measure > staff because editorial elements (e.g. app/rdg)
    // are treated differently in the two implementations (API is agnostic).
    const omasStaves = om.querySelectorAll('*|measure > *|staff')
    const emaJsStaves = jm.querySelectorAll('*|measure > *|staff')

    if (omasStaves.length !== emaJsStaves.length) {
      throw new Error(`Different number of staves (measure ${mIdx + 1}). Expected ${omasStaves.length} but got ${omasStaves.length}`)
    }
  }
  for (const [mIdx, om] of Array.from(omasMeasures).entries()) {
    const jm = emaJsMeasures[mIdx]
    // NB: only checking measure > staff because editorial elements (e.g. app/rdg)
    // are treated differently in the two implementations (API is agnostic).
    const omasStaves = om.querySelectorAll('*|measure > *|staff')
    const emaJsStaves = jm.querySelectorAll('*|measure > *|staff')

    // Compare number of elements in staff and layer
    for (const [sIdx, os] of Array.from(omasStaves).entries()) {
      const js = emaJsStaves[sIdx]

      // Ignore <mei:space>s at the end of layer (error in omas)
      const osEvents = os.querySelectorAll('*|layer *')
      let osEvLength = 0
      const spaces = os.querySelectorAll('*|layer *|space')
      const jsEvents = js.querySelectorAll('*|layer *')
      const jsEvLength = jsEvents.length

      // if it's all spaces, os and js are in agreement, but the expression may be imprecise so flag it.
      if (osEvents.length === spaces.length) {
        if (spaces.length === js.querySelectorAll('*|layer *|space').length) {
          console.warn(`Part of this expression (measure ${mIdx + 1}, staff ${sIdx + 1}) doesn't select anything (ie returns only spaces): ${expr}`)
          report += `"${expr}", Yes, "Part of this expression (measure ${mIdx + 1}, staff ${sIdx + 1}) doesn't select anything (ie returns only spaces)"\n`
          osEvLength = jsEvLength
        } else if (jsEvents[jsEvents.length - 1].tagName.toLowerCase() === 'space') {
          // If js also ends with spaces, the expression is likely imprecise
          osEvLength = jsEvLength
        }
      } else if (jsEvents[jsEvents.length - 1].tagName.toLowerCase() === 'space') {
        // If js also ends with spaces, the expression is likely imprecise
        console.warn(`Part of this expression (measure ${mIdx + 1}, staff ${sIdx + 1}) doesn't select anything (ie returns spaces at the end of a measure): ${expr}`)
        report += `"${expr}", Yes, "Part of this expression (measure ${mIdx + 1}, staff ${sIdx + 1}) doesn't select anything (ie returns spaces at the end of a measure)"\n`
        osEvLength = jsEvLength
      } else {
        let extraSpaces = 0
        for (let i = osEvents.length - 1; i >= 0; i--) {
          if (osEvents[i].children.length > 0 && (osEvents[i].children.length === osEvents[i].querySelectorAll('*|space').length)) {
            extraSpaces++
            continue
          }
          if (osEvents[i].tagName.toLowerCase() !== 'space') break
          extraSpaces++
        }
        osEvLength = osEvents.length - extraSpaces
      }

      if (osEvLength !== jsEvLength) {
        console.log(os.querySelector('*|layer').outerHTML)
        console.log(js.querySelector('*|layer').outerHTML)
        throw new Error(`Different number of events in staff (measure ${mIdx + 1}, staff ${sIdx + 1}). Expected ${osEvLength} but got ${jsEvLength}`)
      }
    }
  }
  report += `${expr}, Yes,\n`
}

run().then(report => {
  const filepath = path.resolve(__dirname, 'crim_test_report.csv')
  fs.writeFile(filepath, report, function (err) {
    if (err) return console.error(err)
    console.log(`Wrote report ${filepath}`)
  })
}).catch(err => {
  console.error(err)
})