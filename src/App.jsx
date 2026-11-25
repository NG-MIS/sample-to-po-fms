import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { useAuth } from './lib/auth.jsx'
import SignIn, { NoAccess, SetPassword } from './pages/SignIn.jsx'
import NumberingPage from './pages/NumberingPage.jsx'
import ProcessLogPage from './pages/ProcessLogPage.jsx'
import SamplesPage from './pages/SamplesPage.jsx'
import SimpleListPage from './pages/SimpleListPage.jsx'
import UsersPage from './pages/UsersPage.jsx'

// A fabric vendor is a name plus a code; the sample screens show the code.
const VENDOR_CODE = { key: 'code', label: 'Vendor code', header: 'VENDOR CODE', hint: 'Shown on samples in place of the vendor name.' }

const ACCESSORY_VENDOR_CODE = { ...VENDOR_CODE }

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
        <Route
          path="/fabrics"
          element={<SimpleListPage key="fabrics" table="fabrics" title="Fabrics" singular="fabric" />}
        />
        <Route
          path="/fabric-vendors"
          element={
            <SimpleListPage
              key="fabric-vendors"
              table="fabric_vendors"
              title="Fabric vendors"
              singular="fabric vendor"
              nameLabel="Vendor name"
              nameHeader="VENDOR NAME"
              extra={VENDOR_CODE}
            />
          }
        />
        <Route
          path="/accessories"
          element={<SimpleListPage key="accessories" table="accessories" title="Accessories" singular="accessory" />}
        />
        <Route
          path="/accessory-vendors"
          element={
            <SimpleListPage
              key="accessory-vendors"
              table="accessory_vendors"
              title="Accessory vendors"
              singular="accessory vendor"
              nameLabel="Vendor name"
              nameHeader="VENDOR NAME"
              extra={ACCESSORY_VENDOR_CODE}
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
