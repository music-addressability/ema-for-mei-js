import { JSDOM } from 'jsdom'

export default function parseFromString(s: string): Document {
  const j: JSDOM = new JSDOM()
  const parser = new j.window.DOMParser()
  return parser.parseFromString(s, 'text/xml')
}
