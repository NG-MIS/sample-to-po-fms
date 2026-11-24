import { useMemo, useRef, useState } from 'react'
import Popover from './Popover.jsx'
import { exportCsv, exportExcel, exportPdf } from '../lib/exportFiles.js'
import { friendlyError } from '../lib/format.js'
import { recall, remember } from '../lib/remember.js'
import { useIsPhone } from '../lib/screen.js'

// The one table used on every screen: search box, click-to-sort headings,
// a Google-Sheets-style filter on every column, a column selector,
// grouping of rows by one or two columns, and export to PDF, Excel and CSV.
// Export gives exactly what is on screen: the shown columns, and the rows
// left after search and filters, in the order shown.
// On a phone the rows are shown as cards, with the same search, sort,
// filter and column choices.
//
// tableId - a short name for this table, used to remember which columns
//           the person chose to show (in their own browser).
// title   - the name of the list, used as the heading and file name of exports.
// onRowClick(row) - optional. When given, clicking anywhere on a row (or card) calls it.
//           Clicks on buttons, links and pictures inside the row keep their own job.
// columns: [{
//   key, header,
//   value(row)      - text, number, or a list of texts. Drives search, sort and filter.
//                     Leave it out for columns such as pictures and buttons.
//   render(row)     - optional, what to draw in the cell (defaults to the value)
//   sortValue(row)  - optional, what to sort by when it differs from the value (e.g. a date)
//   align, width    - optional
// }]
// A column with no header (such as the row buttons) is always shown.

const BLANK = '(Blanks)'

function asList(value) {
  if (Array.isArray(value)) return value.length ? value.map(String) : [BLANK]
  if (value === null || value === undefined || value === '') return [BLANK]
  return [String(value)]
}

function asText(value) {
  if (Array.isArray(value)) return value.join(', ')
  return value === null || value === undefined ? '' : String(value)
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function compare(a, b) {
  const aBlank = a === null || a === undefined || a === ''
  const bBlank = b === null || b === undefined || b === ''
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

const FilterIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M1 2h10L7.2 6.4V10L4.8 11V6.4z" fill="currentColor" />
  </svg>
)

function FilterPanel({ column, rows, allowed, sort, onSort, onApply, onClose, anchorRef }) {
  const values = useMemo(() => {
    const unique = new Set()
    rows.forEach((row) => asList(column.value(row)).forEach((item) => unique.add(item)))
    return [...unique].sort((a, b) => (a === BLANK ? 1 : b === BLANK ? -1 : collator.compare(a, b)))
  }, [rows, column])

  const [checked, setChecked] = useState(() => new Set(allowed || values))
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? values.filter((item) => item.toLowerCase().includes(q)) : values
  }, [values, query])

  const allShownChecked = shown.length > 0 && shown.every((item) => checked.has(item))

  const toggle = (item) => {
    const next = new Set(checked)
    if (next.has(item)) next.delete(item)
    else next.add(item)
    setChecked(next)
  }

  const toggleAllShown = () => {
    const next = new Set(checked)
    shown.forEach((item) => (allShownChecked ? next.delete(item) : next.add(item)))
    setChecked(next)
  }

  const apply = () => {
    // Like Sheets: with a search typed, only the ticked values that match it are kept.
    const picked = query.trim() ? shown.filter((item) => checked.has(item)) : values.filter((item) => checked.has(item))
    onApply(picked.length === values.length ? null : picked)
  }

  const sortDir = sort?.key === column.key ? sort.dir : null

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={260} className="popover--filter">
      <div className="popover-title">{column.header}</div>
      <div className="filter-sort">
        <button type="button" className={`option ${sortDir === 'asc' ? 'option--on' : ''}`} onClick={() => onSort('asc')}>
          Sort A → Z
        </button>
        <button type="button" className={`option ${sortDir === 'desc' ? 'option--on' : ''}`} onClick={() => onSort('desc')}>
          Sort Z → A
        </button>
      </div>
      <input
        className="input popover-search"
        placeholder="Search values…"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && apply()}
      />
      <label className="option option--all">
        <input type="checkbox" checked={allShownChecked} onChange={toggleAllShown} />
        <span>Select all{query.trim() ? ' shown' : ''}</span>
      </label>
      <ul className="option-list">
        {shown.length === 0 && <li className="option-empty">Nothing matches</li>}
        {shown.map((item) => (
          <li key={item}>
            <label className="option">
              <input type="checkbox" checked={checked.has(item)} onChange={() => toggle(item)} />
              <span>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="popover-foot">
        {allowed && (
          <button type="button" className="btn btn--small" onClick={() => onApply(null)}>
            Clear filter
          </button>
        )}
        <button type="button" className="btn btn--small" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--small btn--primary" onClick={apply}>
          OK
        </button>
      </div>
    </Popover>
  )
}

function HeaderCell({ column, rows, sort, allowed, onSort, onFilter }) {
  const filterRef = useRef(null)
  const [open, setOpen] = useState(false)
  const canUse = typeof column.value === 'function'
  const sortDir = sort?.key === column.key ? sort.dir : null

  if (!canUse) {
    return (
      <th style={{ width: column.width, textAlign: column.align }} scope="col">
        <span className="th-plain">{column.header}</span>
      </th>
    )
  }

  return (
    <th
      style={{ width: column.width, textAlign: column.align }}
      scope="col"
      aria-sort={sortDir === 'asc' ? 'ascending' : sortDir === 'desc' ? 'descending' : 'none'}
    >
      <div className="th">
        <button
          type="button"
          className="th-label"
          title="Click to sort"
          onClick={() => onSort(column.key, sortDir === 'asc' ? 'desc' : sortDir === 'desc' ? null : 'asc')}
        >
          {column.header}
          <span className="th-arrow" aria-hidden="true">
            {sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : ''}
          </span>
        </button>
        <button
          type="button"
          ref={filterRef}
          className={`th-filter ${allowed ? 'th-filter--on' : ''}`}
          aria-label={`Filter ${column.header}${allowed ? ' (filter is on)' : ''}`}
          title="Filter"
          onClick={() => setOpen(true)}
        >
          <FilterIcon />
        </button>
      </div>
      {open && (
        <FilterPanel
          column={column}
          rows={rows}
          allowed={allowed}
          sort={sort}
          anchorRef={filterRef}
          onClose={() => setOpen(false)}
          onSort={(dir) => {
            onSort(column.key, dir)
            setOpen(false)
          }}
          onApply={(next) => {
            onFilter(column.key, next)
            setOpen(false)
          }}
        />
      )}
    </th>
  )
}

// Tick list of columns. Columns with no header are not listed: they always show.
function ColumnPicker({ columns, hidden, onChange, onClose, anchorRef }) {
  const choosable = columns.filter((column) => column.header)
  const shownCount = choosable.filter((column) => !hidden.has(column.key)).length

  const toggle = (key) => {
    const next = new Set(hidden)
    if (next.has(key)) next.delete(key)
    else if (shownCount > 1) next.add(key)
    onChange(next)
  }

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={240} className="popover--columns">
      <div className="popover-title">Show columns</div>
      <ul className="option-list">
        {choosable.map((column) => {
          const isShown = !hidden.has(column.key)
          return (
            <li key={column.key}>
              <label className="option">
                <input
                  type="checkbox"
                  checked={isShown}
                  disabled={isShown && shownCount === 1}
                  onChange={() => toggle(column.key)}
                />
                <span>{column.header}</span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="popover-foot">
        {hidden.size > 0 && (
          <button type="button" className="btn btn--small" onClick={() => onChange(new Set())}>
            Show all
          </button>
        )}
        <button type="button" className="btn btn--small btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Popover>
  )
}

// PDF, Excel or CSV.
function ExportMenu({ onExport, busy, error, rowCount, onClose, anchorRef }) {
  const kinds = [
    ['pdf', 'PDF'],
    ['excel', 'Excel (.xlsx)'],
    ['csv', 'CSV'],
  ]
  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={230} className="popover--export">
      <div className="popover-title">
        Export {rowCount} {rowCount === 1 ? 'row' : 'rows'} as
      </div>
      <ul className="option-list">
        {kinds.map(([kind, label]) => (
          <li key={kind}>
            <button type="button" className="option" disabled={Boolean(busy)} onClick={() => onExport(kind)}>
              <span>{busy === kind ? `Preparing ${label}…` : label}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="hint error-text">{error}</p>}
    </Popover>
  )
}

// Choose up to two columns to group rows by.
function GroupPicker({ columns, group, onChange, onFoldAll, onOpenAll, onClose, anchorRef }) {
  const usable = columns.filter((column) => typeof column.value === 'function')
  const [first, second] = group

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={260} className="popover--group">
      <div className="popover-title">Group rows by</div>
      <label className="group-level">
        <span>First level</span>
        <select
          className="input"
          aria-label="First level"
          value={first ?? ''}
          onChange={(event) => {
            const key = event.target.value
            onChange(key ? [key, ...(second && second !== key ? [second] : [])] : [])
          }}
        >
          <option value="">No grouping</option>
          {usable.map((column) => (
            <option key={column.key} value={column.key}>
              {column.header}
            </option>
          ))}
        </select>
      </label>
      <label className="group-level">
        <span>Second level</span>
        <select
          className="input"
          aria-label="Second level"
          disabled={!first}
          value={second ?? ''}
          onChange={(event) => onChange(event.target.value ? [first, event.target.value] : [first])}
        >
          <option value="">None</option>
          {usable
            .filter((column) => column.key !== first)
            .map((column) => (
              <option key={column.key} value={column.key}>
                {column.header}
              </option>
            ))}
        </select>
      </label>
      <div className="popover-foot">
        {first && (
          <>
            <button type="button" className="btn btn--small" onClick={onFoldAll}>
              Fold all
            </button>
            <button type="button" className="btn btn--small" onClick={onOpenAll}>
              Open all
            </button>
          </>
        )}
        <button type="button" className="btn btn--small btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Popover>
  )
}

// The heading of one group of rows. Click to fold or open the group.
function GroupHead({ item, onToggle }) {
  return (
    <button type="button" className="group-toggle" aria-expanded={!item.folded} onClick={() => onToggle(item.id)}>
      <span className={`group-arrow ${item.folded ? 'group-arrow--folded' : ''}`} aria-hidden="true">
        ▾
      </span>
      <span className="group-name">
        {item.header}: <strong>{item.label}</strong>
      </span>
      <span className="group-count">{item.count}</span>
    </button>
  )
}

// Phone only: the headings are not on screen, so sort and filter are reached from one button.
function PhoneSortFilter({ columns, rows, sort, filters, onSort, onFilter, anchorRef, onClose }) {
  const [columnKey, setColumnKey] = useState(null)
  const usable = columns.filter((column) => typeof column.value === 'function')
  const column = usable.find((item) => item.key === columnKey)

  if (column) {
    return (
      <FilterPanel
        column={column}
        rows={rows}
        allowed={filters[column.key]}
        sort={sort}
        anchorRef={anchorRef}
        onClose={onClose}
        onSort={(dir) => {
          onSort(column.key, dir)
          onClose()
        }}
        onApply={(next) => {
          onFilter(column.key, next)
          onClose()
        }}
      />
    )
  }

  return (
    <Popover anchorRef={anchorRef} onClose={onClose} width={240} className="popover--columns">
      <div className="popover-title">Sort or filter by</div>
      <ul className="option-list">
        {usable.map((item) => (
          <li key={item.key}>
            <button type="button" className="option" onClick={() => setColumnKey(item.key)}>
              <span>{item.header}</span>
              <span className="option-mark">
                {sort?.key === item.key ? (sort.dir === 'asc' ? 'A → Z' : 'Z → A') : ''}
                {filters[item.key] ? ' filtered' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  )
}

export default function DataTable({
  tableId,
  title = 'List',
  columns,
  rows,
  rowKey = 'id',
  onRowClick,
  toolbar,
  loading = false,
  emptyText = 'Nothing here yet.',
  searchPlaceholder = 'Search…',
}) {
  const isPhone = useIsPhone()
  const columnsRef = useRef(null)
  const phoneRef = useRef(null)
  const groupRef = useRef(null)
  const exportRef = useRef(null)
  const memoryKey = tableId ? `table-columns:${tableId}` : null

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState(null)
  const [filters, setFilters] = useState({})
  const [hidden, setHidden] = useState(() => new Set(memoryKey ? recall(memoryKey, []) : []))
  const [group, setGroup] = useState(() => (memoryKey ? recall(`${memoryKey}:group`, []) : []))
  const [foldedGroups, setFoldedGroups] = useState(() => new Set())
  const [panel, setPanel] = useState(null) // null | 'columns' | 'phone' | 'group' | 'export'
  const [exporting, setExporting] = useState('')
  const [exportError, setExportError] = useState('')

  const shownColumns = useMemo(() => columns.filter((column) => !hidden.has(column.key)), [columns, hidden])
  const filterCount = Object.keys(filters).length
  const groupColumns = useMemo(
    () => group.map((key) => shownColumns.find((column) => column.key === key && column.value)).filter(Boolean),
    [group, shownColumns],
  )

  const changeGroup = (next) => {
    setGroup(next)
    setFoldedGroups(new Set())
    if (memoryKey) remember(`${memoryKey}:group`, next)
  }

  const changeHidden = (next) => {
    setHidden(next)
    if (memoryKey) remember(memoryKey, [...next])
    // A hidden column must not keep filtering or sorting rows out of sight.
    setFilters((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !next.has(key))))
    setSort((previous) => (previous && next.has(previous.key) ? null : previous))
    if (group.some((key) => next.has(key))) changeGroup(group.filter((key) => !next.has(key)))
  }

  const visible = useMemo(() => {
    const active = shownColumns.filter((column) => filters[column.key] && column.value)
    const sets = active.map((column) => new Set(filters[column.key]))
    let out = rows.filter((row) =>
      active.every((column, index) => asList(column.value(row)).some((item) => sets[index].has(item))),
    )

    const q = search.trim().toLowerCase()
    if (q) {
      const searchable = shownColumns.filter((column) => column.value)
      out = out.filter((row) => searchable.some((column) => asText(column.value(row)).toLowerCase().includes(q)))
    }

    const sortColumn = sort && shownColumns.find((column) => column.key === sort.key)
    if (sortColumn) {
      const get =
        sortColumn.sortValue ||
        ((row) => {
          const value = sortColumn.value(row)
          return typeof value === 'number' ? value : asText(value)
        })
      const direction = sort.dir === 'asc' ? 1 : -1
      // Blank values stay at the bottom whichever way the column is sorted.
      out = [...out].sort((a, b) => {
        const left = get(a)
        const right = get(b)
        const leftBlank = left === null || left === undefined || left === ''
        const rightBlank = right === null || right === undefined || right === ''
        if (leftBlank || rightBlank) return compare(left, right)
        return compare(left, right) * direction
      })
    }
    return out
  }, [rows, shownColumns, filters, search, sort])

  // What is drawn: plain rows, or group headings with their rows underneath.
  // With respectFolds off, it gives every row in on-screen order (used for export).
  const arrange = (respectFolds) => {
    if (groupColumns.length === 0) return visible.map((row) => ({ type: 'row', row }))

    const labelOf = (column, row) => asText(column.value(row)) || BLANK
    const orderOf = (column, row) => {
      if (column.sortValue) return column.sortValue(row)
      const value = column.value(row)
      return typeof value === 'number' ? value : asText(value)
    }

    const build = (groupRows, level, path) => {
      const column = groupColumns[level]
      const buckets = new Map()
      groupRows.forEach((row) => {
        const label = labelOf(column, row)
        if (!buckets.has(label)) buckets.set(label, { rows: [], order: orderOf(column, row) })
        buckets.get(label).rows.push(row)
      })
      const out = []
      ;[...buckets.entries()]
        .sort((a, b) => compare(a[1].order, b[1].order))
        .forEach(([label, bucket]) => {
          const id = `${path}/${label}`
          const folded = respectFolds && foldedGroups.has(id)
          out.push({ type: 'group', id, level, header: column.header, label, count: bucket.rows.length, folded })
          if (folded) return
          if (level + 1 < groupColumns.length) out.push(...build(bucket.rows, level + 1, id))
          else bucket.rows.forEach((row) => out.push({ type: 'row', row }))
        })
      return out
    }
    return build(visible, 0, '')
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const display = useMemo(() => arrange(true), [visible, groupColumns, foldedGroups])

  const runExport = async (kind) => {
    const exportColumns = shownColumns.filter((column) => column.header && typeof column.value === 'function')
    const headers = exportColumns.map((column) => column.header)
    const data = arrange(false)
      .filter((item) => item.type === 'row')
      .map((item) =>
        exportColumns.map((column) => {
          const value = column.value(item.row)
          return typeof value === 'number' ? value : asText(value)
        }),
      )
    setExporting(kind)
    setExportError('')
    try {
      if (kind === 'csv') exportCsv(title, headers, data)
      else if (kind === 'excel') await exportExcel(title, headers, data)
      else await exportPdf(title, headers, data, visible.length === rows.length ? '' : `Filtered: ${visible.length} of ${rows.length}`)
      setPanel(null)
    } catch (failure) {
      setExportError(friendlyError(failure))
    }
    setExporting('')
  }

  const toggleGroup = (id) =>
    setFoldedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const foldAllGroups = () => {
    const column = groupColumns[0]
    if (!column) return
    setFoldedGroups(new Set(visible.map((row) => `/${asText(column.value(row)) || BLANK}`)))
  }

  const rowClick = (row) =>
    onRowClick
      ? (event) => {
          // Buttons, links and pictures in the row do their own thing; so does selecting text.
          if (event.target.closest('button, a, input, select, label, audio')) return
          if (window.getSelection()?.toString()) return
          onRowClick(row)
        }
      : undefined

  const changeSort = (key, dir) => setSort(dir ? { key, dir } : null)
  const changeFilter = (key, allowed) =>
    setFilters((previous) => {
      const next = { ...previous }
      if (allowed) next[key] = allowed
      else delete next[key]
      return next
    })

  const emptyMessage = loading
    ? 'Loading…'
    : rows.length === 0
      ? emptyText
      : 'No rows match the search and filters.'

  return (
    <div className="table-block">
      <div className="table-toolbar">
        <div className="search">
          <input
            className="input"
            type="search"
            placeholder={searchPlaceholder}
            aria-label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {isPhone && (
          <button
            type="button"
            ref={phoneRef}
            className={`btn btn--small ${filterCount > 0 || sort ? 'btn--marked' : ''}`}
            onClick={() => setPanel('phone')}
          >
            <FilterIcon /> Sort and filter{filterCount > 0 ? ` (${filterCount})` : ''}
          </button>
        )}
        <button
          type="button"
          ref={columnsRef}
          className={`btn btn--small ${hidden.size > 0 ? 'btn--marked' : ''}`}
          onClick={() => setPanel('columns')}
        >
          Columns{hidden.size > 0 ? ` (${hidden.size} hidden)` : ''}
        </button>
        <button
          type="button"
          ref={groupRef}
          className={`btn btn--small ${groupColumns.length > 0 ? 'btn--marked' : ''}`}
          onClick={() => setPanel('group')}
        >
          {groupColumns.length > 0 ? `Group: ${groupColumns.map((column) => column.header).join(', ')}` : 'Group'}
        </button>
        <button
          type="button"
          ref={exportRef}
          className="btn btn--small"
          onClick={() => {
            setExportError('')
            setPanel('export')
          }}
        >
          Export
        </button>
        <span className="table-count" role="status">
          {visible.length === rows.length ? `${rows.length} rows` : `Showing ${visible.length} of ${rows.length}`}
        </span>
        {(filterCount > 0 || search || sort) && (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              setFilters({})
              setSearch('')
              setSort(null)
            }}
          >
            Clear search, sort and filters
          </button>
        )}
        <div className="table-toolbar-right">{toolbar}</div>
      </div>

      {panel === 'columns' && (
        <ColumnPicker
          columns={columns}
          hidden={hidden}
          onChange={changeHidden}
          onClose={() => setPanel(null)}
          anchorRef={columnsRef}
        />
      )}
      {panel === 'export' && (
        <ExportMenu
          onExport={runExport}
          busy={exporting}
          error={exportError}
          rowCount={visible.length}
          onClose={() => setPanel(null)}
          anchorRef={exportRef}
        />
      )}
      {panel === 'group' && (
        <GroupPicker
          columns={shownColumns}
          group={groupColumns.map((column) => column.key)}
          onChange={changeGroup}
          onFoldAll={foldAllGroups}
          onOpenAll={() => setFoldedGroups(new Set())}
          onClose={() => setPanel(null)}
          anchorRef={groupRef}
        />
      )}
      {panel === 'phone' && (
        <PhoneSortFilter
          columns={shownColumns}
          rows={rows}
          sort={sort}
          filters={filters}
          onSort={changeSort}
          onFilter={changeFilter}
          anchorRef={phoneRef}
          onClose={() => setPanel(null)}
        />
      )}

      {isPhone ? (
        <ul className="cards">
          {display.map((item) =>
            item.type === 'group' ? (
              <li key={`group${item.id}`} className={`group-head group-head--${item.level + 1}`}>
                <GroupHead item={item} onToggle={toggleGroup} />
              </li>
            ) : (
              <li
                key={item.row[rowKey]}
                className={`card ${onRowClick ? 'card--click' : ''}`}
                onClick={rowClick(item.row)}
              >
                {shownColumns.map((column) => {
                  const content = column.render ? column.render(item.row) : asText(column.value?.(item.row))
                  if (content === null || content === undefined || content === '' || content === false) return null
                  return column.header ? (
                    <div key={column.key} className="card-line">
                      <span className="card-label">{column.header}</span>
                      <span className="card-value">{content}</span>
                    </div>
                  ) : (
                    <div key={column.key} className="card-actions">
                      {content}
                    </div>
                  )
                })}
              </li>
            ),
          )}
          {visible.length === 0 && <li className="table-empty">{emptyMessage}</li>}
        </ul>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                {shownColumns.map((column) => (
                  <HeaderCell
                    key={column.key}
                    column={column}
                    rows={rows}
                    sort={sort}
                    allowed={filters[column.key]}
                    onSort={changeSort}
                    onFilter={changeFilter}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {display.map((item) =>
                item.type === 'group' ? (
                  <tr key={`group${item.id}`} className={`group-row group-row--${item.level + 1}`}>
                    <td colSpan={shownColumns.length}>
                      <GroupHead item={item} onToggle={toggleGroup} />
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={item.row[rowKey]}
                    className={onRowClick ? 'row--click' : undefined}
                    onClick={rowClick(item.row)}
                  >
                    {shownColumns.map((column) => (
                      <td key={column.key} style={{ textAlign: column.align }}>
                        {column.render ? column.render(item.row) : asText(column.value?.(item.row))}
                      </td>
                    ))}
                  </tr>
                ),
              )}
              {visible.length === 0 && (
                <tr>
                  <td className="table-empty" colSpan={shownColumns.length}>
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
