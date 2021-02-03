import EmaExp from '@ema/parser/dist/EmaExp'
import {DocInfo, BeatInfo} from '@ema/parser'
import MeiDoc from './MeiDoc'

export default class EmaMeiProcessor {
  public ns: string
  public mei: Document
  public docInfo: DocInfo
  public emaExp: EmaExp
  private processed: boolean = false
  constructor(meiDoc: MeiDoc, emaExp: EmaExp) {
    this.mei = meiDoc.mei
    this.docInfo = meiDoc.docInfo
    this.ns = meiDoc.ns
    this.emaExp = emaExp
  }

  private _getCurrentMeter(mIdx: number) {
    // Return current meter information from docInfo based on measure index
    let meter: BeatInfo
    for (const change of Object.keys(this.docInfo.beats)) {
      const c = parseInt(change, 10)
      if (c + 1 <= mIdx) {
        meter = this.docInfo.beats[c]
      }
    }
    return meter
  }

  private _calculateDur(element: Element, meter: BeatInfo) {
    // Determine the duration of an element given a meter.
    let dur: number
    switch (element.getAttribute('dur')) {
      case 'breve':
        dur = 0.5
      case 'long':
        dur = 0.25
      default:
        dur = parseFloat(element.getAttribute('dur'))
    }
    let relativeDur = meter.unit / dur

    // Collect dots.
    let dots = 0
    if (element.getAttribute('dots')) {
      dots = parseInt(element.getAttribute('dots'), 10)
    } else if (element.querySelector('dot')) {
      dots = element.querySelectorAll('dot').length
    }

    let dotDur = dur
    for (const d of Array(dots)) {
      dotDur = dotDur * 2
      relativeDur += meter.unit / dotDur
    }

    // Account for tuplets.
    const tupl = element.closest('tuplet')
    if (tupl) {
      const numbase = tupl.getAttribute('numbase')
      const num = tupl.getAttribute('num')

      if (!num || !numbase) {
        throw new Error('Cannot understand tuplet beat: both @num and @numbase must be present')
      }

      const tuplRatio = parseFloat(numbase) / parseFloat(num)
      relativeDur = relativeDur * tuplRatio
    }

    return relativeDur
  }

  public getSelection() {
    // Return a modified MEI doc containing the selected notation
    // provided a EMA expression of measures, staves, and beats.
    if (this.processed) {
      return this.mei
    }

    // Remove all elements before and after a measure range,
    // leaving elements within range untouched

    // Things we need to keep track of as we traverse:
    let mCount = 0
    let inRange = false
    let meter: BeatInfo
    let currentBeat: number = 1.0

    // Stacks:
    const toRemove: Element[] = []
    const checkAgain: Element[] = []

    // Set up walker.
    const music = this.mei.querySelector('*|music')
    if (music.namespaceURI !== this.ns) {
      throw new Error('Could not find MEI <music> element')
    }

    const walker: TreeWalker = this.mei.createTreeWalker(music, 1)

    // Walk.
    while (walker.nextNode()) {
      const el = walker.currentNode as Element

      // Skip element if it's not MEI
      if (el.namespaceURI !== this.ns) continue

      if (el.tagName.toLowerCase() === 'measure') {
        mCount++
        if (this.emaExp.selection.getMeasure(mCount)) {
          // Check meter from docInfo
          meter = this._getCurrentMeter(mCount)
          inRange = true
        } else {
          inRange = false
        }

      } else if (inRange) {
        if (el.tagName.toLowerCase() === 'staff') {
          // Mark for deletion staves outside of staff range.

          const n = parseInt(el.getAttribute('n'), 10)
          if (isNaN(n)) continue
          if (!this.emaExp.selection.getMeasure(mCount).getStaff(n)) {
            toRemove.push(el)
          }
        } else if (el.getAttribute('staff')) {
          // Mark for deletion elements with @staff outside of staff range.

          const n = parseInt(el.getAttribute('staff'), 10)
          if (isNaN(n)) continue
          if (!this.emaExp.selection.getMeasure(mCount).getStaff(n)) {
            toRemove.push(el)
          }
        } else if (el.tagName.toLowerCase() === 'layer') {
          // Reset beat count at each layer in range.
          currentBeat = 1.0
        } else if (el.getAttribute('dur') && !el.getAttribute('grace')) {
          // Mark for deletion elements with @dur outside of beat range.

          // Determine staff.
          const n = el.closest('staff')
            ? parseInt(el.closest('staff').getAttribute('n'), 10)
            : parseInt(el.getAttribute('staff'), 10)
          if (isNaN(n)) {
            throw new Error('Cannot determine staff for event in range.')
          }
          const beatRanges = this.emaExp.selection.getMeasure(mCount).getStaff(n)
          // Skip if this beat is in an unselected staff.
          if (!beatRanges) continue

          // See if event fits in beat in *any* range or mark for deletion.
          let inBeatRange = false
          for (const beatRange of beatRanges) {
            if (inBeatRange) continue
            // Resolve beat range tokens
            beatRange.resolveRangeTokens(meter.count)

            // Discard if below or above starting point.
            // We round to 4 decimal places to avoid issues caused by
            // tuplet-related calculations, which are admittedly not
            // well expressed in floating numbers.
            if (currentBeat < beatRange.start
              || parseFloat(currentBeat.toFixed(4))
               > parseFloat((beatRange.end as number).toFixed(4))) {
              inBeatRange = false
            } else {
              inBeatRange = true
            }
          }
          // Once it's been confirmed that the even isn't in range, mark it for removal.
          if (!inBeatRange) {
            toRemove.push(el)
          }
          const dur = this._calculateDur(el, meter)
          currentBeat += dur
        }
      }

      // if the element contains measures, keep it because the measures may be in range
      // and add it to list of elements to check later
      if (el.querySelectorAll('*|measure').length > 0) {
        checkAgain.push(el)
        continue
      }

      // mark elements not in range for removal, but keep scoreDefs and their children, and staffDefs.
      // N.B.: staffDefs within measures out of range will be removed.
      // N.B.: parentElement.closest() is equiv to ancestor-or-self.
      if (!inRange
        && !el.parentElement.closest('*|measure')
        && !el.parentElement.closest('*|scoreDef')
        && el.tagName.toLowerCase() !== 'scoredef'
        && el.tagName.toLowerCase() !== 'staffdef') {
        toRemove.push(el)
      }
    }

    // })

    // Remove all elements marked for removal.
    for (const r of toRemove) {
      if (r.parentElement) {
        r.parentElement.removeChild(r)
      }
    }

    // Clean up left over measure containing elements if any.
    // The container needs to stay if it contains at least one measure in range.
    for (const el of checkAgain) {
      if (!el.querySelector('*|measure')) {
        el.parentElement.removeChild(el)
      }
    }

    // Clean up unnecessary scoreDefs, by walking again on the reduced tree
    // There must be a measure before encountering the next scoreDef, else remove.
    const selectedWalker: TreeWalker = this.mei.createTreeWalker(music, 1)

    const toPurge: Element[] = []
    let hasMeasures: boolean = true
    while (selectedWalker.nextNode()) {
      const el = selectedWalker.currentNode as Element
      // Skip element if it's not MEI
      if (el.namespaceURI !== this.ns) continue
      if (el.tagName.toLowerCase() === 'scoredef') {
        if (!hasMeasures) {
          toPurge.push(el)
        } else {
          hasMeasures = false
        }
      }

      if (el.tagName.toLowerCase() === 'measure') {
        hasMeasures = true
      }
    }

    // Remove all elements marked for removal.
    for (const r of toPurge) {
      if (r.parentElement) {
        r.parentElement.removeChild(r)
      }
    }

    // Clean up staffDefs for unselected staves

    this.processed = true
    return this.mei

  }
}