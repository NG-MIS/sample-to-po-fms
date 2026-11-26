import { useLocation, useNavigate } from 'react-router-dom'
import Tabs from '../components/Tabs.jsx'
import { MASTERS } from '../lib/masters.js'

// The one Masters screen: every master is a tab, in alphabetical order.
// Each tab keeps its own address, so a link to a master opens its tab.
export default function MastersPage({ children }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <Tabs
        tabs={MASTERS.map((master) => ({ key: master.path, label: master.label }))}
        value={pathname}
        label="Masters"
        onChange={(path) => navigate(path)}
      />
      {children}
    </>
  )
}
