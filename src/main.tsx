import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AutoConnect, ThirdwebProvider } from 'thirdweb/react'
import { thirdwebAppMetadata, thirdwebClient, thirdwebWallets } from './lib/thirdweb'
import './index.css'
import App from './App.tsx'

// Vendor design system (Rayo template — see public/landing/catalog2.html) loaded globally
// as the app's real, permanent stylesheet set. Appended here (after the './index.css' and
// './App.tsx'-side './App.css' imports above have already been evaluated/injected) so these
// links land last in <head> in both dev and prod, letting vendor rules win the cascade on
// any same-named class (.btn, .tag, etc.) — that is intentional, not a bug.
const VENDOR_STYLESHEETS = [
  '/landing/css/loaders/loader.css',
  '/landing/css/plugins.min.css',
  '/landing/css/main.min.css',
]
for (const href of VENDOR_STYLESHEETS) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThirdwebProvider>
      <AutoConnect client={thirdwebClient} wallets={thirdwebWallets} appMetadata={thirdwebAppMetadata} />
      <App />
    </ThirdwebProvider>
  </StrictMode>,
)
