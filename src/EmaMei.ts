import EmaExp from '@ema/parser'
import MeiDoc from './MeiDoc'
import EmaMeiProcessor from './EmaMeiProcessor'
import * as fetch from 'isomorphic-fetch'

export default class EmaMei {
  static async withFullExpr(expr: string) {
    // Split URI from rest of expression
    const splitExpr = expr.match(/^\/?([^\/]+?)\/(.+?)$/)
    const meiURI = splitExpr[1]
    const selectors = splitExpr[2]

    // Attempt to fetch XML
    const decodedMeiURI = decodeURIComponent(meiURI)
    let meiData = ''
    try {
      await fetch(decodedMeiURI).then( async (response) => {
        if (response.status !== 200) {
          throw new Error('Could not retrieve MEI data via fetch.')
        }
        meiData = await response.text()
      })
    } catch (err) {
      throw new Error('Could not retrieve MEI data via fetch.')
    }

    return this.withDocumentString(meiData, selectors)
  }

  static withDocumentString(meiData: string, selectors: string): EmaMeiProcessor {
    // get MeiDoc via MeiDocParser
    const meiDoc: MeiDoc = MeiDoc.fromString(meiData)

    // get EmaExpr via parser
    const docInfo = meiDoc.getDocumentInfo()
    const emaExpr: EmaExp = EmaExp.fromString(docInfo, selectors)

    return new EmaMeiProcessor(meiDoc, emaExpr)
  }
}