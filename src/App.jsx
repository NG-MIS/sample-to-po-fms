import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { useAuth } from './lib/auth.jsx'
import SignIn, { NoAccess, SetPassword } from './pages/SignIn.jsx'
import NumberingPage from './pages/NumberingPage.jsx'
import ProcessLogPage from './pages/ProcessLogPage.jsx'
import SamplesPage from './pages/SamplesPage.jsx'
import SimpleListPage from './pages/SimpleListPage.jsx'
import UsersPage from './pages/UsersPage.jsx'

// Reference pictures live with the other sample pictures.
const REFERENCE_PICTURE = { bucket: 'samples', folder: 'reference' }

export default function App() {
  const { session, profile, loading, recovery, finishRecovery, signOut } = useAuth()

  if (loading) return <div className="splash">Loading…</div>
  if (recovery && session) return <SetPassword onDone={finishRecovery} />
  if (!session) return <SignIn />
  if (!profile) return <NoAccess onSignOut={signOut} />

  return (
    <Layout>
      <Routes>
        <Route path="/samples" element={<SamplesPage />} />
        <Route path="/process-log" element={<ProcessLogPage />} />
        <Route path="/numbering" element={<NumberingPage />} />
        <Route
          path="/processes"
          element={<SimpleListPage key="processes" table="processes" title="Processes" singular="process" />}
        />
        <Route
          path="/vendors"
          element={<SimpleListPage key="vendors" table="vendors" title="Vendors" singular="vendor" />}
        />
        <Route
          path="/components"
          element={<SimpleListPage key="components" table="components" title="Components" singular="component" />}
        />
        <Route
          path="/product-types"
          element={
            <SimpleListPage key="product-types" table="product_types" title="Product types" singular="product type" />
          }
        />
        <Route
          path="/collections"
          element={<SimpleListPage key="collections" table="collections" title="Collections" singular="collection" />}
        />
        <Route
          path="/references"
          element={
            <SimpleListPage
              key="references"
              table="sample_reference_options"
              title="References"
              singular="reference"
              picture={REFERENCE_PICTURE}
            />
          }
        />
        <Route path="/tags" element={<SimpleListPage key="tags" table="tags" title="Tags" singular="tag" hash />} />
        <Route path="/users" element={<UsersPage />} />
        <Route
          path="/departments"
          element={<SimpleListPage key="departments" table="departments" title="Departments" singular="department" />}
        />
        <Route
          path="/designations"
          element={<SimpleListPage key="designations" table="designations" title="Designations" singular="designation" />}
        />
        <Route path="/roles" element={<SimpleListPage key="roles" table="roles" title="Roles" singular="role" />} />
        <Route path="*" element={<Navigate to="/samples" replace />} />
      </Routes>
    </Layout>
  )
}
