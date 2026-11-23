// The number the next sample in a series will get: PREFIX-NUMBER.
export function nextSampleNo(series) {
  return `${series.prefix}-${(series.last_number ?? series.start_number - 1) + 1}`
}
