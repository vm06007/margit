import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AutoConnect, ThirdwebProvider } from 'thirdweb/react'
import { thirdwebAppMetadata, thirdwebClient, thirdwebWallets } from './lib/thirdweb'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThirdwebProvider>
      <AutoConnect client={thirdwebClient} wallets={thirdwebWallets} appMetadata={thirdwebAppMetadata} />
      <App />
    </ThirdwebProvider>
  </StrictMode>,
)
