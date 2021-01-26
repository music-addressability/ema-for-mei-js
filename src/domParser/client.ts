export default function parseFromString(s: string): Document {
  const parser = new DOMParser()
  return parser.parseFromString(s, 'text/xml')
}
