import EmaExp from '@ema/parser/dist/EmaExp'
import {DocInfo, BeatInfo} from '@ema/parser'
import MeiDoc from './MeiDoc'

import { v4 as uuid } from 'uuid'

type PositionInRange = 'in' | 'out' | 'between'

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
    switch (element.getAttribute('dur').trim()) {
      case 'breve':
        dur = 0.5
        break
      case 'long':
        dur = 0.25
        break
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

  private _getPositionInRanges(element: Element, measureNum: number, meter:number, currentBeat: number)
  : PositionInRange {
    const n = element.closest('staff')
      ? parseInt(element.closest('staff').getAttribute('n'), 10)
      : parseInt(element.getAttribute('staff'), 10)
    if (isNaN(n)) {
      throw new Error('Cannot determine staff for event in range.')
    }
    const beatRanges = this.emaExp.selection.getMeasure(measureNum).getStaff(n)

    // Skip if this beat is in an unselected staff.
    if (!beatRanges) return 'out'

    // See if event fits in beat in *any* range or mark for deletion.
    let inBeatRange: PositionInRange = 'out'
    for (const [i, beatRange] of beatRanges.entries()) {
      if (inBeatRange === 'in') continue
      // Resolve beat range tokens
      beatRange.resolveRangeTokens(meter)

      // Discard if below or above starting point.
      // We round to 4 decimal places to avoid issues caused by
      // tuplet-related calculations, which are admittedly not
      // well expressed in floating numbers.
      const isBefore = currentBeat < beatRange.start
      const isAfter = parseFloat(currentBeat.toFixed(4)) > parseFloat(
        (beatRange.end as number).toFixed(4))
      if (isBefore || isAfter) {
        // If this isn't the last range, then this event is in between ranges
        if (i+1 === beatRanges.length && isAfter) {
          inBeatRange = 'out'
        } else {
          inBeatRange = 'between'
        }
      } else {
        inBeatRange = 'in'
      }
    }

    return inBeatRange
  }

  public getSelection() {
    // Return a modified MEI doc containing the selected notation
    // provided a EMA expression of measures, staves, and beats.
    if (this.processed) {
      return this.mei
    }

    // Remove all elements before and after a measure range,
    // leaving elements within range untouched

    const completeness = this.emaExp.completeness

    // Things we need to keep track of as we traverse:
    let mCount = 0
    let inRange = false
    let meter: BeatInfo
    let currentBeat: number = 1.0

    // Stacks:
    const toRemove: Element[] = []
    const markedAsSpace: Element[] = []
    const checkAgain: Element[] = []
    const toHighlight: Element[] = []

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

      // TODO: deal with multiRest

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
        } else if (el.getAttribute('staff') && el.tagName.toLowerCase() !== 'clef') {
          // Mark for deletion elements with @staff outside of staff range, except clefs

          let highlighted = false
          const n = parseInt(el.getAttribute('staff'), 10)
          if (isNaN(n)) continue

          const beatRanges = this.emaExp.selection.getMeasure(mCount).getStaff(n)
          if (!beatRanges) {
            toRemove.push(el)
            continue
          } else if (!highlighted && completeness === 'highlight') {
            toHighlight.push(el)
            highlighted = true
          }

          // Mark for deletion @staff elements with @tstamp outside of beat range.
          if (el.getAttribute('tstamp')) {
            // Get and normalize time stamp (beat location)
            let ts = parseFloat(el.getAttribute('tstamp'))
            ts = ts < 1 ? 1 : ts

            // See if event fits in beat in *any* range or mark for deletion.
            for (const beatRange of beatRanges) {
              // Resolve beat range tokens
              beatRange.resolveRangeTokens(meter.count)

              // Discard if below or above starting point.
              // We round to 4 decimal places to avoid issues caused by
              // tuplet-related calculations, which are admittedly not
              // well expressed in floating numbers.
              if (ts < beatRange.start
                || parseFloat(ts.toFixed(4))
                 > parseFloat((beatRange.end as number).toFixed(4))) {
                toRemove.push(el)
              } else if (!highlighted && completeness === 'highlight') {
                toHighlight.push(el)
                highlighted = true
              }
            }
          }

        } else if (el.tagName.toLowerCase() === 'layer') {
          // Reset beat count at each layer in range.
          currentBeat = 1.0
        } else if (el.getAttribute('dur') && !el.getAttribute('grace')) {
          // TODO: deal with grace notes before, after, between selection within measure in range

          // Mark elements with @dur outside of beat range for either removal or replacement as space

          // Determine beat ranges.
          const inBeatRanges: PositionInRange = this._getPositionInRanges(el, mCount, meter.count, currentBeat)

          // Once it's been confirmed that the event isn't in range, mark it for removal or replacement.
          if (inBeatRanges === 'out') {
            toRemove.push(el)
          } else if (inBeatRanges === 'between') {
            markedAsSpace.push(el)
          } else if (completeness === 'highlight') {
            // TODO: lookback to grace notes that immediately precede this event and select them
            toHighlight.push(el)
          }

          // Whether it's out or in between, check for attached out-of-staff events and mark those for removal.
          if (inBeatRanges === 'out' || inBeatRanges === 'between') {
            const id = el.getAttribute('xml:id')
            if (id) {
              el.closest('*|measure').querySelectorAll(`*[startid="#${id}"]`).forEach(e => {
                // make sure the referring element does not contain the referred element (edge case)
                if (!e.contains(el)) {
                  toRemove.push(e)
                }
              })
            }
          }

          const dur = this._calculateDur(el, meter)
          currentBeat += dur
        } else if (completeness === 'highlight' && el.tagName.toLowerCase() === 'mrest') {
          // non-dur elements still need to be highlighted
          toHighlight.push(el)
        }
      }

      // if the element contains measures, keep it because the measures may be in range
      // and add it to list of elements to check later
      if (el.querySelectorAll('*|measure').length > 0) {
        checkAgain.push(el)
        continue
      }

      // mark elements not in range for removal, but keep clefs, scoreDefs and their children, and staffDefs.
      // N.B.: staffDefs within measures out of range will be removed.
      // N.B.: parentElement.closest() is equiv to ancestor-or-self.
      if (!inRange
        && (el.tagName.toLowerCase() === 'clef' ||
        !el.parentElement.closest('*|measure')
        && !el.parentElement.closest('*|scoreDef')
        && el.tagName.toLowerCase() !== 'scoredef'
        && el.tagName.toLowerCase() !== 'staffdef')) {
        toRemove.push(el)
      }
    }

    // If we're just highlighting, create annotation element and return
    if (completeness === 'highlight') {
      const ids = toHighlight.map(el => {
        const xmlid = el.getAttribute('xml:id')
        if (xmlid) {
          return `#${xmlid}`
        }
        // Create id when not present
        const newid = `ema-${uuid()}`
        el.setAttribute('xml:id', newid)
        return `#${newid}`
      })

      const score = this.mei.getElementsByTagNameNS(this.ns, 'score')[0]
      const annot = this.mei.createElementNS(this.ns, 'annot')
      annot.setAttribute('type', 'ema_highlight')
      annot.setAttribute('plist', ids.join(' '))
      score.appendChild(annot)

      this.processed = true
      return this.mei
    }

    // Remove all elements marked for removal.
    for (const r of toRemove) {
      if (r.parentElement) {
        r.parentElement.removeChild(r)
      }
    }

    // Replace with spaces all elements marked for replacement.
    for (const sp of markedAsSpace) {
      // The tuplet notes are being processed here, but somehow the tuplet gets lost at some point
      if (sp.parentElement) {
        const dur = sp.getAttribute('dur')
        let dots = parseInt(sp.getAttribute('dots'), 10)
        if (!dots) {
          dots = sp.querySelectorAll('*|dot').length
        }
        if (dur) {
          const spaceEl: Element = this.mei.createElementNS(this.ns, 'space')
          spaceEl.setAttribute('dur', dur)
          if (dots > 0) {
            spaceEl.setAttribute('dots', dots.toString())
          }
          sp.parentElement.insertBefore(spaceEl, sp)
        }
        sp.parentElement.removeChild(sp)
      }
    }

    // Clean up left over measure containing elements if any.
    // The container needs to stay if it contains at least one measure in range.
    for (const el of checkAgain) {
      if (!el.querySelector('*|measure')) {
        el.parentElement.removeChild(el)
      }
    }

    // Second pass cleanup.
    const selectedWalker: TreeWalker = this.mei.createTreeWalker(music, 1)

    const toPurge: Element[] = []
    let hasMeasures: boolean = true
    while (selectedWalker.nextNode()) {
      const el = selectedWalker.currentNode as Element
      // Skip element if it's not MEI
      if (el.namespaceURI !== this.ns) continue

      // Clean up unnecessary scoreDefs, by walking again on the reduced tree
      // There must be a measure before encountering the next scoreDef, else remove.
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

      // Clean up empty note-containing elements.
      // The following note-containing elements are excluded because they can be meaningfully empty:
      // lem, orig, rdg, reg, restore, sic

      switch (el.tagName.toLowerCase()) {
        case 'abbr':
        case 'add':
        case 'bTrem':
        case 'beam':
        case 'chord':
        case 'corr':
        case 'damage':
        case 'del':
        case 'expan':
        case 'fTrem':
        case 'graceGrp':
        case 'layer':
        case 'ligature':
        case 'oLayer':
        case 'supplied':
        case 'syllable':
        case 'tuplet':
        case 'unclear':
          if (el.children.length === 0) toPurge.push(el)
        default:
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