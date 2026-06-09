import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount, useSendTransaction, usePublicClient, useReadContract, useBalance } from 'wagmi';
import { sdk } from '../config/sdk';
import PriceChart from '../components/PriceChart';
import { parseAbiItem, erc20Abi, parseUnits, formatUnits, maxUint256, encodeFunctionData } from 'viem';
import { FTControllerV2ABI } from '@x42/sdk';

export default function MarketDetails() {
  const { id: marketId } = useParams<{ id: string }>();
  const { address } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient();

  const [yesBalance, setYesBalance] = useState('0');
  const [noBalance, setNoBalance] = useState('0');
  const [isLoading, setIsLoading] = useState(true);

  // Market Info
  const [marketTitle, setMarketTitle] = useState('Loading...');
  const [marketCreator, setMarketCreator] = useState<string>('');
  const [outcomeNames, setOutcomeNames] = useState<string[]>(['YES', 'NO']);
  const [collateralAddress, setCollateralAddress] = useState<`0x${string}` | null>(null);
  const [collateralSymbol, setCollateralSymbol] = useState<string>('USDT');
  const [collateralDecimals, setCollateralDecimals] = useState<number>(6);

  // Trades & Stats
  const [recentTrades, setRecentTrades] = useState<any[]>([]);
  const [holdersCount, setHoldersCount] = useState<number>(0);

  // Trading panel state
  const [tradeDirection, setTradeDirection] = useState<'buy' | 'sell'>('buy');
  const [outcomeToBuy, setOutcomeToBuy] = useState<bigint>(1n); // 1n = YES, 2n = NO
  const [amountInput, setAmountInput] = useState<string>('');
  const [expectedOutput, setExpectedOutput] = useState<string>('0');
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [quoteError, setQuoteError] = useState<string>('');

  // Fetch Collateral Balance
  const { data: userCollateralBalance } = useReadContract({
    address: collateralAddress || undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  // Fetch User Balances and Market Info
  const fetchBalances = async () => {
    if (!publicClient || !address || !marketId) return;
    try {
      const balanceOfAbi = parseAbiItem('function balanceOf(address, uint256) view returns (uint256)');
      
      const [yesBal, noBal] = await Promise.all([
        publicClient.readContract({
          address: marketId as `0x${string}`,
          abi: [balanceOfAbi],
          functionName: 'balanceOf',
          args: [address, 1n]
        }),
        publicClient.readContract({
          address: marketId as `0x${string}`,
          abi: [balanceOfAbi],
          functionName: 'balanceOf',
          args: [address, 2n]
        })
      ]);

      setYesBalance(formatUnits(yesBal as bigint, 18));
      setNoBalance(formatUnits(noBal as bigint, 18));

      // Fetch Market Details from Subgraph
      let colAddr = collateralAddress;
      try {
        const detailsRes: any = await sdk.indexer.getMarketDetails(marketId as string);
        if (detailsRes && detailsRes.market) {
          const m = detailsRes.market;
          colAddr = m.collateral as `0x${string}`;
          setCollateralAddress(colAddr);
          setMarketTitle(m.question.title);
          setMarketCreator(m.question.creator);
          if (m.question.outcomeNames && m.question.outcomeNames.length >= 2) {
            setOutcomeNames(m.question.outcomeNames);
          }
        }
        
        // Fetch trades for history and holders stats
        const tradesRes: any = await sdk.indexer.getTradesByMarket(marketId as string, 50);
        if (tradesRes && tradesRes.trades) {
          setRecentTrades(tradesRes.trades);
          const uniqueUsers = new Set(tradesRes.trades.map((t: any) => t.user?.id).filter(Boolean));
          setHoldersCount(uniqueUsers.size);
        }
      } catch (e) {
        console.error("Subgraph fetch failed, falling back to chain:", e);
      }

      if (!colAddr) {
        // Fallback Market Config
        const paramsAbi = parseAbiItem('function readMarketDeployParams() view returns (address collateral, uint256 parentTokenId, uint256 questionId, address curve, uint256 timestampStart)');
        const params = await publicClient.readContract({
          address: marketId as `0x${string}`,
          abi: [paramsAbi],
          functionName: 'readMarketDeployParams'
        }) as [string, bigint, string, string, bigint];
        colAddr = params[0] as `0x${string}`;
        setCollateralAddress(colAddr);
      }

      const sym = await publicClient.readContract({
        address: colAddr,
        abi: [parseAbiItem('function symbol() view returns (string)')],
        functionName: 'symbol'
      }) as string;
      setCollateralSymbol(sym);

      const decs = await publicClient.readContract({
        address: colAddr,
        abi: [parseAbiItem('function decimals() view returns (uint8)')],
        functionName: 'decimals'
      }) as number;
      setCollateralDecimals(decs);

    } catch (e) {
      console.error("Failed to fetch balances", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, [publicClient, address, marketId]);

  // Quote expected output
  useEffect(() => {
    if (!amountInput || isNaN(Number(amountInput)) || Number(amountInput) <= 0 || !publicClient || !marketId || !collateralAddress) {
      setExpectedOutput('0');
      setQuoteError('');
      return;
    }

    const quote = async () => {
      setIsQuoting(true);
      setQuoteError('');
      try {
        const paramsAbi = parseAbiItem('function readMarketDeployParams() view returns (address collateral, uint256 parentTokenId, uint256 questionId, address curve, uint256 timestampStart)');
        const params = await publicClient.readContract({
          address: marketId as `0x${string}`,
          abi: [paramsAbi],
          functionName: 'readMarketDeployParams'
        }) as [string, bigint, bigint, string, bigint];
        const curveAddress = params[3] as `0x${string}`;

        if (tradeDirection === 'buy') {
          const collateralDelta = parseUnits(amountInput, collateralDecimals);
          const calAbi = parseAbiItem('function calOtDeltaByMintCost(address,uint256,uint256,bytes) view returns (uint256,uint256)');
          const res = await publicClient.readContract({
            address: curveAddress,
            abi: [calAbi],
            functionName: 'calOtDeltaByMintCost',
            args: [marketId as `0x${string}`, outcomeToBuy, collateralDelta, "0x"]
          }) as [bigint, bigint];
          setExpectedOutput(formatUnits(res[0], 18));
        } else {
          const otDelta = parseUnits(amountInput, 18);
          const calAbi = parseAbiItem('function calRedeemValueByOtDelta(address,uint256,uint256,bytes) view returns (uint256,uint256)');
          const res = await publicClient.readContract({
            address: curveAddress,
            abi: [calAbi],
            functionName: 'calRedeemValueByOtDelta',
            args: [marketId as `0x${string}`, outcomeToBuy, otDelta, "0x"]
          }) as [bigint, bigint];
          setExpectedOutput(formatUnits(res[0], collateralDecimals));
        }
      } catch (e: any) {
        console.warn("Quote failed", e);
        setExpectedOutput('0');
        if (e.message && e.message.includes('revert')) {
          setQuoteError("Quote failed: Exceeds available liquidity or invalid amount");
        } else {
          setQuoteError("Failed to fetch quote");
        }
      } finally {
        setIsQuoting(false);
      }
    };
    
    const timeout = setTimeout(quote, 500);
    return () => clearTimeout(timeout);
  }, [amountInput, tradeDirection, outcomeToBuy, publicClient, marketId, collateralAddress, collateralDecimals]);

  const handleTrade = async () => {
    if (!address || !publicClient || !marketId || !collateralAddress) return alert('Please connect OKX Wallet first!');
    if (!amountInput || isNaN(Number(amountInput)) || Number(amountInput) <= 0) return alert('Please enter a valid amount');
    
    setIsSwapping(true);
    try {
      let amountToSpend: bigint;

      if (tradeDirection === 'buy') {
        amountToSpend = parseUnits(amountInput, collateralDecimals);

        const allowance = await publicClient.readContract({
          address: collateralAddress,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, sdk.market.routerAddress],
        });

        if (allowance < amountToSpend) {
          const approveData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [sdk.market.routerAddress, maxUint256],
          });
          
          const approveHash = await sendTransactionAsync({
            to: collateralAddress,
            data: approveData,
            chainId: 1952,
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      } else {
        amountToSpend = parseUnits(amountInput, 18);

        const isOperator = await publicClient.readContract({
          address: marketId as `0x${string}`,
          abi: [parseAbiItem('function isOperator(address, address) view returns (bool)')],
          functionName: 'isOperator',
          args: [address, sdk.market.routerAddress]
        }) as boolean;

        if (!isOperator) {
          const setOperatorData = encodeFunctionData({
            abi: [parseAbiItem('function setOperator(address, bool)')],
            functionName: 'setOperator',
            args: [sdk.market.routerAddress, true],
          });
          
          const approveHash = await sendTransactionAsync({
            to: marketId as `0x${string}`,
            data: setOperatorData,
            chainId: 1952,
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
        }
      }

      const txData = sdk.market.encodeSwap(
        marketId as `0x${string}`,
        address,
        outcomeToBuy,
        {
          isMint: tradeDirection === 'buy',
          amount: amountToSpend,
          isExactIn: true,
          minOutOrMaxIn: 0n,
        },
        "0x",
        "0x",
        "0x0000000000000000000000000000000000000000",
        0n
      );

      const hash = await sendTransactionAsync({
        to: sdk.market.routerAddress,
        data: txData,
        chainId: 1952,
      });
      alert(`${tradeDirection === 'buy' ? 'Buy' : 'Sell'} successful! Tx: ${hash}`);
      
      setAmountInput('');
      await publicClient.waitForTransactionReceipt({ hash });
      fetchBalances();
    } catch (e: any) {
      console.error(e);
      alert('Error: ' + (e.shortMessage || e.message || 'Transaction rejected'));
    } finally {
      setIsSwapping(false);
    }
  };

  if (!marketId) return <div>Invalid Market ID</div>;

  return (
    <div className="animate-fade-in container" style={{ paddingBottom: '60px', paddingTop: '40px' }}>
      <div style={{ marginBottom: '30px' }}>
        <Link to="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.color = '#fff'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}>
          <span style={{ fontSize: '20px' }}>←</span> Back to Markets
        </Link>
      </div>

      {/* Full Width Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '40px' }}>
        <img src="/placeholder-event.jpg" alt="Event" style={{ width: '100px', height: '100px', borderRadius: '24px', objectFit: 'cover', background: '#222', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }} onError={(e) => { e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="%23222"><rect width="100" height="100" rx="24" fill="%23222"/></svg>' }} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '42px', lineHeight: '1.1', margin: '0 0 16px 0', textShadow: '0 2px 10px rgba(0,0,0,0.5)', fontWeight: '700' }}>
            {marketTitle}
          </h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span className="badge badge-neutral">
              Contract: {marketId.slice(0, 6)}...{marketId.slice(-4)}
            </span>
            <span className="badge badge-primary">
              Volume: $--
            </span>
            <span className="badge" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
              Holders: {holdersCount}
            </span>
            {marketCreator && (
              <span className="badge badge-neutral" style={{ display: 'inline-flex', gap: '4px' }}>
                Creator: <a href={`https://sepolia.xlayer.tech/address/${marketCreator}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>{marketCreator.slice(0,6)}...{marketCreator.slice(-4)}</a>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="market-grid">
        {/* Left Column: Chart, About, Trades */}
        <div style={{ minWidth: 0 }}>
          <div className="glass-panel-heavy" style={{ padding: '24px', marginBottom: '30px' }}>
            <PriceChart marketAddress={marketId} />
          </div>

          <div className="glass-panel" style={{ padding: '30px', marginBottom: '30px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--primary)', fontSize: '24px' }}>ℹ</span> About this Event
            </h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.8', fontSize: '15px' }}>
              This is a decentralized prediction market running on XLayer. Trades are executed instantly against the AMM router using exact-in swaps. 
              Buying shares mints outcome tokens from collateral, while selling redeems your outcome tokens back for collateral based on current curve pricing.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '30px' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>📊</span> Recent Trades
            </h3>
            {recentTrades.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>No trades yet. Be the first to trade!</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Action</th>
                      <th style={{ textAlign: 'right' }}>Amount (Shares)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map((t: any) => (
                      <tr key={t.id}>
                        <td>
                          {new Date(Number(t.timestamp) * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          <a href={`https://sepolia.xlayer.tech/address/${t.user?.id || ''}`} target="_blank" rel="noreferrer" style={{ color: 'var(--text-main)', textDecoration: 'none', fontWeight: '500' }}>
                            {t.user?.id?.slice(0, 6)}...{t.user?.id?.slice(-4)}
                          </a>
                        </td>
                        <td>
                          {t.isMint ? (
                            <span className="badge" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>Buy {outcomeNames[Number(t.tokenId) - 1] || `Outcome ${t.tokenId}`}</span>
                          ) : (
                            <span className="badge" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>Sell {outcomeNames[Number(t.tokenId) - 1] || `Outcome ${t.tokenId}`}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: '600' }}>
                          {parseFloat(formatUnits(BigInt(t.otAmount), 18)).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Trading Sidebar (42.space inspired) */}
        <div className="glass-panel-heavy" style={{ position: 'sticky', top: '40px', overflow: 'hidden' }}>
          
          {/* Buy / Sell Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)' }}>
            <button 
              className={`tab-btn ${tradeDirection === 'buy' ? 'active' : ''}`}
              onClick={() => { setTradeDirection('buy'); setAmountInput(''); setExpectedOutput('0'); setQuoteError(''); }}
            >
              Buy
            </button>
            <button 
              className={`tab-btn ${tradeDirection === 'sell' ? 'active' : ''}`}
              onClick={() => { setTradeDirection('sell'); setAmountInput(''); setExpectedOutput('0'); setQuoteError(''); }}
            >
              Sell
            </button>
          </div>

          <div style={{ padding: '30px' }}>
            {/* Input Section */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '14px', fontWeight: '500' }}>
                  Amount
                </span>
                {tradeDirection === 'buy' && userCollateralBalance !== undefined && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    Balance: <span style={{ color: '#fff' }}>{parseFloat(formatUnits(userCollateralBalance as bigint, collateralDecimals)).toFixed(2)}</span> {collateralSymbol}
                  </span>
                )}
                {tradeDirection === 'sell' && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    Balance: <span style={{ color: '#fff' }}>{parseFloat(outcomeToBuy === 1n ? yesBalance : noBalance).toFixed(2)}</span> Shares
                  </span>
                )}
              </div>
              
              <div className="input-wrapper">
                <input 
                  type="number" 
                  value={amountInput} 
                  onChange={e => setAmountInput(e.target.value)} 
                  placeholder="0.0" 
                  min="0"
                  step="any"
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '16px', fontWeight: '600', marginLeft: '12px' }}>
                  {tradeDirection === 'buy' ? collateralSymbol : 'Shares'}
                </span>
              </div>
            </div>

            {/* Quote Error */}
            {quoteError && (
              <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '16px', padding: '10px', background: 'var(--danger-bg)', borderRadius: '8px' }}>
                {quoteError}
              </div>
            )}

            {/* Output Preview */}
            <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                  Expected {tradeDirection === 'buy' ? 'Shares' : 'Return'}
                </span>
                {isQuoting ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '15px', fontWeight: '500' }}>Calculating...</span>
                  </div>
                ) : (
                  <span style={{ fontWeight: '700', fontSize: '18px', color: '#fff' }}>
                    {parseFloat(expectedOutput) > 0 ? parseFloat(expectedOutput).toFixed(4) : '0.0000'} <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '500' }}>{tradeDirection === 'buy' ? (outcomeNames[Number(outcomeToBuy) - 1] || 'Outcome') : collateralSymbol}</span>
                  </span>
                )}
              </div>
              
              {amountInput && Number(expectedOutput) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Avg Price</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    {tradeDirection === 'buy' 
                      ? `${(Number(amountInput) / Number(expectedOutput)).toFixed(4)} ${collateralSymbol}`
                      : `${(Number(expectedOutput) / Number(amountInput)).toFixed(4)} ${collateralSymbol}`
                    }
                  </span>
                </div>
              )}
            </div>

            {/* Action Button */}
            <button 
              className={`action-btn ${outcomeNames.length <= 2 ? (outcomeToBuy === 1n ? 'yes' : 'no') : 'primary'}`}
              onClick={handleTrade} 
              disabled={isSwapping || !amountInput || Number(expectedOutput) === 0} 
            >
              {isSwapping ? 'Processing...' : `${tradeDirection === 'buy' ? 'Buy' : 'Sell'} ${outcomeNames[Number(outcomeToBuy) - 1] || 'Outcome'}`}
            </button>

            <div style={{ margin: '24px 0', height: '1px', background: 'var(--border-color)' }} />

            {/* Outcome Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>Select Outcome</span>
              {outcomeNames.map((name, idx) => {
                const outcomeId = BigInt(idx + 1);
                const isActive = outcomeToBuy === outcomeId;
                
                // Determine active colors based on whether it's a binary market
                const isBinary = outcomeNames.length === 2;
                let activeColor = 'var(--primary)';
                let activeBg = 'rgba(139, 92, 246, 0.15)';
                
                if (isBinary) {
                  if (idx === 0) {
                    activeColor = 'var(--success)';
                    activeBg = 'var(--success-bg)';
                  } else {
                    activeColor = 'var(--danger)';
                    activeBg = 'var(--danger-bg)';
                  }
                }

                return (
                  <button 
                    key={idx}
                    onClick={() => setOutcomeToBuy(outcomeId)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px',
                      borderRadius: '12px',
                      background: isActive ? activeBg : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isActive ? activeColor : 'transparent'}`,
                      color: isActive ? '#fff' : 'var(--text-muted)',
                      fontWeight: '600',
                      fontSize: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || (isBinary ? (idx === 0 ? 'YES' : 'NO') : `Outcome ${outcomeId}`)}</span>
                    {isActive && <span style={{ color: activeColor, marginLeft: '10px', fontSize: '14px' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
