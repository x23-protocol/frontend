import { useEffect, useState } from 'react';
import { usePublicClient } from 'wagmi';
import { Link } from 'react-router-dom';
import { sdk } from '../config/sdk';
import { FTControllerV2ABI } from '../sdk';

export default function UserDashboard() {
  const [markets, setMarkets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const publicClient = usePublicClient();

  useEffect(() => {
    async function fetchMarkets() {
      if (!publicClient) return;
      try {
        const paginatedMarkets = await publicClient.readContract({
          address: sdk.controller.controllerAddress,
          abi: FTControllerV2ABI,
          functionName: 'getMarketsPaginated',
          args: [0n, 100n],
        }) as `0x${string}`[];

        const marketData = await Promise.all(
          paginatedMarkets.map(async (mAddr) => {
            return {
              id: mAddr,
              market: mAddr,
              title: "Market " + mAddr.slice(0, 8),
            };
          })
        );
        
        setMarkets(marketData);
      } catch (e) {
        console.error("Failed to fetch markets from contract", e);
      } finally {
        setLoading(false);
      }
    }
    fetchMarkets();
  }, [publicClient]);

  if (loading) return <div className="animate-fade-in" style={{ textAlign: 'center', marginTop: '50px' }}>Loading markets from Contract...</div>;

  return (
    <div className="animate-fade-in">
      <h2 style={{ marginBottom: '30px' }}>Active Markets</h2>
      {markets.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>No markets found on the Contract yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {markets.map((m: any) => (
            <div key={m.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flexGrow: 1 }}>
                <h3 style={{ fontSize: '20px', marginBottom: '10px' }}>{m.title}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px', wordBreak: 'break-all' }}>
                  Contract: {m.market}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                <Link to={`/market/${m.market}`} style={{ width: '100%', textDecoration: 'none' }}>
                  <button className="btn-primary" style={{ width: '100%', padding: '12px' }}>
                    View Market
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
