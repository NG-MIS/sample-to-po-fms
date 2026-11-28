// Every master, shown as one tab each on the Masters screen. The tabs are put
// in alphabetical order on screen, so a new master can be added anywhere here.
export const MASTERS = [
  { path: '/users', label: 'User master' },
  { path: '/departments', label: 'Departments' },
  { path: '/designations', label: 'Designations' },
  { path: '/roles', label: 'Roles' },
  { path: '/numbering', label: 'Numbering' },
  { path: '/components', label: 'Components' },
  { path: '/product-types', label: 'Product types' },
  { path: '/collections', label: 'Collections' },
  { path: '/processes', label: 'Processes' },
  { path: '/vendors', label: 'Vendors' },
  { path: '/references', label: 'References' },
  { path: '/tags', label: 'Tags' },
  { path: '/fabrics', label: 'Fabrics' },
  { path: '/fabric-vendors', label: 'Fabric vendors' },
  { path: '/accessories', label: 'Accessories' },
  { path: '/primary-accessories', label: 'Primary accessories' },
  { path: '/accessory-vendors', label: 'Accessory vendors' },
  { path: '/sizes', label: 'Sizes and ratios' },
  { path: '/cad-particulars', label: 'CAD particulars' },
  { path: '/colours', label: 'Colours' },
].sort((a, b) => a.label.localeCompare(b.label))

export const isMasterPath = (pathname) => pathname === '/masters' || MASTERS.some((master) => master.path === pathname)
