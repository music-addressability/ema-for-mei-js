// tslint:disable: no-unused-expression
import { expect } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import MeiDoc from '../src/MeiDoc'
import { DocInfo } from '@ema/parser'
import EmaMei from '../src/EmaMei'
import EmaMeiProcessor from '../src/EmaMeiProcessor'

const bachPath: string = path.resolve(__dirname, './data/Bach_Musikalisches_Opfer_Trio.mei')
const bach: string = fs.readFileSync(bachPath).toString()
const bachEma: MeiDoc = MeiDoc.fromString(bach)

describe('EMA for MEI', () => {
  it('should read an MEI file', () => {
    expect(bachEma).exist
  })

  it('should get a doc info', () => {
    const docInfo: DocInfo = bachEma.getDocumentInfo()
    expect(docInfo.measures).equal(49)
  })

  it('should build a parser from a full EMA expression', async () => {
    const expr = `all/all/@all`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    expect(emaMei.emaExp.docInfo).exist
  })

  it('should build a parser from a full EMA expression (remote)', async () => {
    const encUri = encodeURIComponent('https://raw.githubusercontent.com/music-encoding/sample-encodings/master/MEI_4.0/Music/Complete_examples/Bach_Musikalisches_Opfer_Trio.mei')
    const fullExpr = `/${encUri}/all/all/@all`
    const emaMei: EmaMeiProcessor = await EmaMei.withFullExpr(fullExpr)
    expect(emaMei.emaExp.docInfo).exist
  })

  it('should return a modified MEI document with the selection applied (measures, simple)', async () => {
    const expr = `1-2/all/@all`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    expect(emaMei.getSelection().querySelectorAll('*|music *|measure').length).equal(2)
  })

  it('should return a modified MEI document with the selection applied (measures, ranges)', async () => {
    const expr = `1-2,10-15/all/@all`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    expect(emaMei.getSelection().querySelectorAll('*|music *|measure').length).equal(8)
  })

  it('should return a modified MEI document with the selection applied (scoreDef removed)', async () => {
    const scoreDefTestFile: string = path.resolve(__dirname, './data/scoreDefTest.mei')
    const testData: string = fs.readFileSync(scoreDefTestFile).toString()
    const expr = `1-2,10-15/all/@all`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(testData, expr)
    expect(emaMei.getSelection().querySelectorAll('*|music *|scoreDef').length).equal(2)
  })

  it('should return a modified MEI document with the selection applied (staves, simple)', async () => {
    const expr = `1-2/2/@all`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    const selection = emaMei.getSelection()
    expect(
      selection
      .querySelector('*|music *|measure')
      .querySelectorAll('*|staff')
      .length)
    .equal(1)
    expect(
      selection
      .querySelector('*|music *|measure > *|trill[staff="2"]')
    ).exist
  })

  it('should return a modified MEI document with the selection applied (staves, ranges)', async () => {
    const expr = `1-2/2,1-2/@all`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    const selection = emaMei.getSelection()
    expect(
      selection
      .querySelector('*|music *|measure[n="1"]')
      .querySelector('*|staff[n="2"]'))
    .exist
    expect(
      selection
      .querySelector('*|music *|measure[n="2"]')
      .querySelectorAll('*|staff')
      .length)
    .equal(2)
    expect(
      selection
      .querySelector('*|music *|measure[n="2"] > *|slur[staff="2"]')
    ).exist
  })
})