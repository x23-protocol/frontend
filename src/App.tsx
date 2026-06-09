import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import UserDashboard from './pages/UserDashboard';
import AdminPanel from './pages/AdminPanel';
import MarketDetails from './pages/MarketDetails';

function Navbar() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <nav style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', backdropFilter: 'blur(10px)' }}>
      <div style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '24px', background: 'linear-gradient(90deg, #fff, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          42 SPACES
        </h1>
        <Link to="/" style={{ color: 'var(--text-muted)', fontWeight: 500, transition: 'color 0.2s' }}>Dashboard</Link>
        <Link to="/admin" style={{ color: 'var(--text-muted)', fontWeight: 500, transition: 'color 0.2s' }}>Admin</Link>
      </div>

      <div>
        {isConnected ? (
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button className="btn-outline" onClick={() => disconnect()}>Disconnect</button>
          </div>
        ) : (
          <button className="btn-primary" onClick={() => connect({ connector: connectors[0] })}>
            Connect OKX Wallet
          </button>
        )}
      </div>
    </nav>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Navbar />
        <main style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
          <Routes>
            <Route path="/" element={<UserDashboard />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/market/:id" element={<MarketDetails />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
