import EmaExp from '@ema/parser/dist/EmaExp'
import {DocInfo} from '@ema/parser'
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

  public getSelection() {
    // Return a modified MEI doc containing the selected notation
    // provided a EMA expression of measures, staves, and beats.
    if (this.processed) {
      return this.mei
    }

    // Remove all elements before and after a measure range,
    // leaving elements within range untouched
    let mCount = 0
    let inRange = false

    const toRemove: Element[] = []
    const checkAgain: Element[] = []

    const music = this.mei.querySelector('*|music')
    if (music.namespaceURI !== this.ns) {
      throw new Error('Could not find MEI <music> element')
    }

    const walker: TreeWalker = this.mei.createTreeWalker(music, 1)

    while (walker.nextNode()) {
      const el = walker.currentNode as Element
      // Skip element if it's not MEI
      if (el.namespaceURI !== this.ns) continue

      if (el.tagName.toLowerCase() === 'measure') {
        mCount++
        if (this.emaExp.selection.getMeasure(mCount)) {
          inRange = true
        } else {
          inRange = false
        }

      } else if (inRange) {
        // When in range, mark for deletion unselected staves and elements with @staff
        if (el.tagName.toLowerCase() === 'staff') {
          const n = parseInt(el.getAttribute('n'), 10)
          if (isNaN(n)) continue
          if (!this.emaExp.selection.getMeasure(mCount).getStaff(n)) {
            toRemove.push(el)
          }
        } else if (el.getAttribute('staff')) {
          const n = parseInt(el.getAttribute('staff'), 10)
          if (isNaN(n)) continue
          if (!this.emaExp.selection.getMeasure(mCount).getStaff(n)) {
            toRemove.push(el)
          }
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