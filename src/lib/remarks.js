// Short text such as "2 text, 1 voice, 3 pictures" for tables.
export function remarksSummary(remarks) {
  const count = (kind) => remarks.filter((item) => item.kind === kind).length
  const parts = [
    [count('text'), 'text'],
    [count('voice'), 'voice'],
    [count('image'), count('image') === 1 ? 'picture' : 'pictures'],
  ]
  return parts
    .filter(([number]) => number > 0)
    .map(([number, label]) => `${number} ${label}`)
    .join(', ')
}
