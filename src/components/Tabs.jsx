// A row of tabs, each with an optional count of what is waiting in it.
//   tabs: [{ key, label, count }]
export default function Tabs({ tabs, value, onChange, label = 'Views' }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === value}
          className={`tab ${tab.key === value ? 'tab--on' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}
