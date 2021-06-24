import {DocInfo, StavesInfo, BeatsInfo} from '@emajs/parser'
import parseFromString from './domParser/server'
import {v4} from 'uuid'

export default class MeiDoc {
  public ns: string = 'http://www.music-encoding.org/ns/mei'
  public mei: Document
  public docInfo: DocInfo
  private measures: NodeList
  constructor(doc: Document) {
    this.mei = doc
  }

  public static fromString(s: string) {
    const mei = parseFromString(s)
    return new MeiDoc(mei)
  }

  public getDocumentInfo(): DocInfo {
    // Return document info if available or compute it.
    // NB query selectors should be expressed as `*|ElName` to match all ns prefixes;
    //    the matched elements ns should always be checked against this.ns.
    if (!this.docInfo) {
      this.measures = this.mei.querySelectorAll('*|music *|measure')
      const measureLabels: string[] = []
      this.measures.forEach((m: Node) => {
        const measure = m as Element
        if (measure.namespaceURI === this.ns) {
          measureLabels.push(measure.getAttribute('n') || '')
        }
      })

      const scoreDefs = this.mei.querySelectorAll('*|music *|scoreDef')
      const {staves, beats} = this.getScoreInfo(scoreDefs)
      this.docInfo = {
        measures: this.measures.length,
        measure_labels: measureLabels,
        staves,
        beats,
      }
    }
    return this.docInfo
  }

  private getScoreInfo(scoreDefs: NodeList): {staves: StavesInfo, beats: BeatsInfo} {
    const stavesInfo: StavesInfo = {}
    const beatsInfo: BeatsInfo = {}

    scoreDefs.forEach(sd => {
      const scoreDef = sd as Element
      if (scoreDef.namespaceURI === this.ns) {
        const nextEl = scoreDef.nextElementSibling

        // Locate measure
        let measureIdx: number = -1
        let measure: Element
        if (nextEl.namespaceURI === this.ns
            && nextEl.tagName.toLowerCase().split(':').pop() === 'measure') {
          measure = nextEl
        } else {
          // Look down
          measure = nextEl.getElementsByTagNameNS(this.ns, 'measure')[0]
          if (!measure) {
            throw new Error('Could not locate measure after new score definition')
          }
        }
        // Get measure index
        let id = measure.getAttribute('xml:id')
        // if it doesn't have an id, assign a temporary one.
        if (!id) {
          id = `m-${v4()}`
          measure.setAttribute('xml:id', id)
        }
        this.measures.forEach((m, idx) => {
          const mEl = m as Element
          if (mEl.namespaceURI === this.ns && mEl.getAttribute('xml:id') === id) {
            measureIdx = idx
          }
        })

        // Get staff labels
        if (scoreDef.getElementsByTagNameNS(this.ns, 'staffGrp').length > 0) {
          const staves = scoreDef.getElementsByTagNameNS(this.ns, 'staffDef')
          const stavesLabels: string[] = []
          Array.from(staves).map(s => {
            // Try to get label in this order:
            // @label, /label, @label.abbr
            let label: string = ''
            label = s.getAttribute('label')
            if (!label) {
              const labelEl = s.getElementsByTagNameNS(this.ns, 'label')
              label = labelEl[0] ? labelEl[0].textContent.replace(/\s+/g, ' ') : ''
            }
            if (!label) {
              label = s.getAttribute('label.abbr')
            }
            stavesLabels.push(label)
          })
          stavesInfo[measureIdx] = stavesLabels
        }

        // Get meter
        let count = parseInt(scoreDef.getAttribute('meter.count'), 10)
        let unit = parseInt(scoreDef.getAttribute('meter.unit'), 10)

        if (count && unit) {
          beatsInfo[measureIdx] = {count, unit}
        } else {
          const meter = scoreDef.getElementsByTagNameNS(this.ns, 'meterSig')
          if (meter.length > 1) {
            throw new Error('Mixed meter is not supported')
          }
          count = parseInt(meter[0].getAttribute('meter.count'), 10)
          unit = parseInt(meter[0].getAttribute('meter.unit'), 10)
          if (count && unit) {
            beatsInfo[measureIdx] = {count, unit}
          } else {
            throw new Error('Could not locate meter and compute beat change.')
          }
        }
      }
    })
    return {staves: stavesInfo, beats: beatsInfo}
  }

  
}
