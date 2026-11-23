import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { useAuth } from './lib/auth.jsx'
import SignIn, { NoAccess, SetPassword } from './pages/SignIn.jsx'
import NumberingPage from './pages/NumberingPage.jsx'
import SamplesPage from './pages/SamplesPage.jsx'
import SimpleListPage from './pages/SimpleListPage.jsx'
import UsersPage from './pages/UsersPage.jsx'

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
        <Route path="/numbering" element={<NumberingPage />} />
        <Route
          path="/references"
          element={
            <SimpleListPage key="references" table="sample_reference_options" title="References" singular="reference" />
          }
        />
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
