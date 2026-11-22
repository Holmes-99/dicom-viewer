import { useEffect, useState } from 'react'
import DesignPage from './DesignPage'
import ViewerApp from './viewer/ViewerApp'

// '#/design' shows the design system page; everything else is the viewer.
export default function App() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash === '#/design' ? <div className="h-full overflow-auto"><DesignPage /></div> : <ViewerApp />
}
