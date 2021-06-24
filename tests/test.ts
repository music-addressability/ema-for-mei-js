// tslint:disable: no-unused-expression
import { expect } from 'chai'
import * as fs from 'fs'
import * as path from 'path'
import MeiDoc from '../src/MeiDoc'
import { DocInfo } from '@emajs/parser'
import EmaMei from '../src/EmaMei'
import EmaMeiProcessor from '../src/EmaMeiProcessor'

const bachPath: string = path.resolve(__dirname, './data/Bach_Musikalisches_Opfer_Trio.mei')
const bach: string = fs.readFileSync(bachPath).toString()
const bachEma: MeiDoc = MeiDoc.fromString(bach)

const crimPath: string = path.resolve(__dirname, './data/CRIM_Mass_0009_3.mei')
const crim: string = fs.readFileSync(crimPath).toString()

const crimTupletPath: string = path.resolve(__dirname, './data/CRIM_Model_0017.mei')
const crimTuplet: string = fs.readFileSync(crimTupletPath).toString()

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
      .querySelectorAll('*|staff').length)
    .equal(1)
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

  it('should return a modified MEI document with the selection applied (beats, simple in-layer)', async () => {
    const expr = `1-2/all/@1-2.5`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    const layers = emaMei.getSelection().querySelectorAll('*|music *|measure *|layer')
    // time sig: 3/4
    expect(layers[0].querySelectorAll('*').length).equal(1) // mRest
    expect(layers[1].querySelectorAll('*|note').length).equal(4) // beat 1-2: 8. 16, 8grace 4
    expect(layers[2].querySelectorAll('*|note').length).equal(4) // beat 1-2: 8 8, 8 8
  })

  it('should return a modified MEI document with the selection applied (beats, ranges in-layer)', async () => {
    const expr = `1-2/all/@1-2@3`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    const layers = emaMei.getSelection().querySelectorAll('*|music *|measure *|layer')
    // time sig: 3/4
    expect(layers[0].querySelectorAll('*').length).equal(1) // mRest
    expect(layers[1].querySelectorAll('*|note').length).equal(4) // beat 1-2: 8. 16, 8grace 4; beat 3: n/a
    expect(layers[2].querySelectorAll('*|note').length).equal(4) // beat 1-2: 8 8, 8; beat 3: 8
  })

  it('should return a modified MEI document with the selection applied (beats, fill gaps)', async () => {
    const expr = `1/3/@1-1.5@3-3.5`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    const layer = emaMei.getSelection().querySelector('*|music *|measure *|layer')
    // time sig: 3/4
    // expected result: 8 8 (8) (8) 8 8
    expect(layer.querySelectorAll('*|note').length).equal(4)
    expect(layer.querySelectorAll('*|space').length).equal(2)
  })

  it('should return a modified MEI document with the selection applied (beats, ranges out-of-layer, @tstamp)', async () => {
    const expr = `2/all/@1-2`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    const measures = emaMei.getSelection().querySelectorAll('*|music *|measure')
    // time sig: 3/4
    expect(measures[0].querySelector('*|harm[tstamp="1"]')).exist
    expect(measures[0].querySelector('*|harm[tstamp="3"]')).not.exist
  })

  it('should return a modified MEI document with the selection applied (beats, ranges out-of-layer, @startid)', async () => {
    const expr = `2/all/@1-2`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    const measures = emaMei.getSelection().querySelectorAll('*|music *|measure')
    // time sig: 3/4
    expect(measures[0].querySelector('*|slur[startid="#m2_s2_e2"]')).not.exist
    expect(measures[0].querySelector('*|slur[startid="#m2_s3_e1"]')).exist
  })

  it('should return an MEI document with an annot element pointing to the selected events (completeness: highlight, mRest)', async () => {
    const expr = `1/1/@1/highlight`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    const annot = emaMei.getSelection().querySelector('*|annot')
    expect(annot.getAttribute('plist')).equal('#t-1 #t-4')
  })


  it('should return a modified MEI document with the selection applied (beats, ranges in-layer)', async () => {
    const expr = `7/all/@1-2@3/highlight`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(bach, expr)
    const annot = emaMei.getSelection().querySelector('*|annot')
    expect(annot.getAttribute('plist')).equal('#m7-t1 #m7-t2 #m7-t3 #m7-t4 #m7-t5 #m7-t9 #m7-t11 #m7-t12 #m7-t13 #m7-t14 #m7-t16 #m7-t17 #m7-t18 #m7-t20 #m7-t22 #m7-t23 #m7-t24')
  })

  it('should return the right number of events for this CRIM file', async () => {
    const expr= `1-6/1,1,1+3,1+3,3,3/@1-4,@1-3,@1-3+@1-4,@1-3+@1-3,@1-3,@1`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(crim, expr)
    const s = emaMei.emaExp.selection.getMeasure(3).getStaff(3)[0]
    expect(s.start).equal(1)
    expect(s.end).equal(4)
  })

  it('should return replace unselected tuplets with the right amount of spaces', async () => {
    const expr= `15/4/@4`
    const emaMei: EmaMeiProcessor = await EmaMei.withDocumentString(crimTuplet, expr)
    // console.log(emaMei.emaExp.selection.getMeasure(15).getStaff(4))
    const mei = emaMei.getSelection()
    expect(mei.querySelectorAll('*|measure[n="15"] *|staff[n="4"] *|tuplet *|space').length).equal(3)
  })

})