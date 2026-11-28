// Sums in number boxes: 1+2, 2*3, 10-4, 9/2, (2+3)*4. A number box takes these
// while typing and turns them into the answer when the box is left or Enter is pressed.

// What may be typed in a decimal box / a whole-number box: digits, a dot, and the sum signs.
export const numberTyped = (value) => value.replace(/[^\d.+\-*/() ]/g, '').replace(/^\./, '0.')
export const digitsTyped = (value) => value.replace(/[^\d+\-*/() ]/g, '')

// Works a sum out without running it as code. Gives null when it is not a complete sum.
export function calculate(text) {
  const source = text.replace(/\s/g, '')
  if (!/[+\-*/()]/.test(source.replace(/^-/, ''))) return null
  let at = 0
  const number = () => {
    const match = /^(\d+\.?\d*|\.\d+)/.exec(source.slice(at))
    if (!match) return NaN
    at += match[0].length
    return Number(match[0])
  }
  const factor = () => {
    if (source[at] === '-') {
      at += 1
      return -factor()
    }
    if (source[at] === '(') {
      at += 1
      const inside = sum()
      if (source[at] !== ')') return NaN
      at += 1
      return inside
    }
    return number()
  }
  const product = () => {
    let value = factor()
    while (source[at] === '*' || source[at] === '/') {
      const sign = source[at]
      at += 1
      const next = factor()
      value = sign === '*' ? value * next : value / next
    }
    return value
  }
  function sum() {
    let value = product()
    while (source[at] === '+' || source[at] === '-') {
      const sign = source[at]
      at += 1
      const next = product()
      value = sign === '+' ? value + next : value - next
    }
    return value
  }
  const answer = sum()
  return at === source.length && Number.isFinite(answer) && answer >= 0 ? answer : null
}

const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

// Turns the sum in a number box into its answer. Whole-number boxes get a whole number.
function settle(input) {
  if (!(input instanceof HTMLInputElement) || input.dataset.noCalc !== undefined) return
  const mode = input.getAttribute('inputmode')
  if (mode !== 'numeric' && mode !== 'decimal') return
  const answer = calculate(input.value)
  if (answer === null) return
  const text = mode === 'numeric' ? String(Math.round(answer)) : String(Math.round(answer * 100) / 100)
  setValue.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

// Called once when the app starts: every number box in the app then works sums out.
export function installCalculator() {
  document.addEventListener('focusout', (event) => settle(event.target), true)
  document.addEventListener('keydown', (event) => event.key === 'Enter' && settle(event.target), true)
}
