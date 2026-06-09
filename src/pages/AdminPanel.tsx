import { useState, useEffect } from 'react';
import { useAccount, useSendTransaction, useSwitchChain, usePublicClient, useReadContract } from 'wagmi';
import { parseUnits, parseAbiItem, formatUnits, maxUint256, encodeFunctionData } from 'viem';
import { sdk } from '../config/sdk';
import { FTControllerV2ABI } from '@x42/sdk';
import { erc20Abi } from 'viem';

export default function AdminPanel() {
  const { address, chainId } = useAccount();
  const { sendTransactionAsync, error: txError } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

  // Collateral State
  const [collateralAddr, setCollateralAddr] = useState('');
  const [collateralSeedMin, setCollateralSeedMin] = useState('10');
  const [collateralIsWhitelist, setCollateralIsWhitelist] = useState(true);

  // Curve State
  const [curveAddr, setCurveAddr] = useState('');
  const [curveIsWhitelist, setCurveIsWhitelist] = useState(true);

  // Market Deploy State
  const [title, setTitle] = useState('');
  const [marketCollateral, setMarketCollateral] = useState('0x9e29b3AaDa05Bf2D2c827Af80Bd28Dc0b9b4FB0c');
  const [marketCurve, setMarketCurve] = useState('0x8A82A091BEBE1B130304581CF75EfcA7226Cdc6B');
  const [marketSeed, setMarketSeed] = useState('10');
  const [outcomes, setOutcomes] = useState('YES, NO');
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 16);
  });
  const [imageUri, setImageUri] = useState('');

  // Tabs State
  const [activeTab, setActiveTab] = useState('overview');

  // Role Management State
  const [roleUserAddr, setRoleUserAddr] = useState('');
  const [roleSelected, setRoleSelected] = useState('0x0000000000000000000000000000000000000000000000000000000000000000');
  const [roleStatus, setRoleStatus] = useState<boolean | null>(null);

  const ROLES = [
    { name: 'DEFAULT_ADMIN_ROLE', hash: '0x0000000000000000000000000000000000000000000000000000000000000000' },
    { name: 'GUARDIAN_ROLE', hash: '0x55435dd261a4b9b3364963f7738a7a662ad9c84396d64be3365284bb7f0a5041' },
    { name: 'OPERATOR_ROLE', hash: '0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929' },
    { name: 'UNPAUSER_ROLE', hash: '0x427da25fe773164f88948d3e215c94b6554e2ed5e5f203a821c9f2f6131cf75a' },
  ];

  // Whitelist Logs State
  const [whitelistedCollaterals, setWhitelistedCollaterals] = useState<Record<string, { isWhitelisted: boolean, seedMin: string }>>({});
  const [whitelistedCurves, setWhitelistedCurves] = useState<Record<string, boolean>>({});
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);

  // Read Contracts
  const { data: defaultFeeRate } = useReadContract({
    address: sdk.controller.controllerAddress,
    abi: FTControllerV2ABI,
    functionName: 'getDefaultFeeRate',
  });

  const { data: isPaused } = useReadContract({
    address: sdk.controller.controllerAddress,
    abi: FTControllerV2ABI,
    functionName: 'isPaused',
  });

  const fetchLogs = async () => {
    if (!publicClient) return;
    setIsFetchingLogs(true);
    try {
      const whitelistedCols = await publicClient.readContract({
        address: sdk.controller.controllerAddress,
        abi: [parseAbiItem('function getWhitelistedCollaterals() external view returns (address[] memory)')],
        functionName: 'getWhitelistedCollaterals',
      }) as string[];

      const colState: Record<string, { isWhitelisted: boolean, seedMin: string }> = {};
      for (const col of whitelistedCols) {
        const config = await publicClient.readContract({
          address: sdk.controller.controllerAddress,
          abi: [parseAbiItem('function getCollateralConfig(address) external view returns (uint256 collateralSeedMin, bool isWhitelisted)')],
          functionName: 'getCollateralConfig',
          args: [col as `0x${string}`],
        }) as [bigint, boolean];
        
        colState[col] = {
          isWhitelisted: config[1],
          seedMin: formatUnits(config[0], 6)
        };
      }
      setWhitelistedCollaterals(colState);

      const whitelistedCurvs = await publicClient.readContract({
        address: sdk.controller.controllerAddress,
        abi: [parseAbiItem('function getWhitelistedCurves() external view returns (address[] memory)')],
        functionName: 'getWhitelistedCurves',
      }) as string[];

      const curveState: Record<string, boolean> = {};
      for (const curve of whitelistedCurvs) {
        curveState[curve] = true;
      }
      setWhitelistedCurves(curveState);
    } catch (e) {
      console.error("Failed to fetch logs", e);
    }
    setIsFetchingLogs(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [publicClient]);

  const checkAuthAndChain = async () => {
    if (!address) {
      alert('Connect OKX Wallet!');
      return false;
    }
    if (chainId !== 1952) {
      try {
        await switchChainAsync({ chainId: 1952 });
      } catch (e) {
        console.error("Failed to switch chain", e);
        alert('Please switch to X Layer Testnet in your wallet first.');
        return false;
      }
    }
    return true;
  };

  const simulateTx = async (txData: `0x${string}`) => {
    if (!publicClient) return true;
    try {
      await publicClient.call({
        to: sdk.controller.controllerAddress,
        data: txData,
        account: address as `0x${string}`,
      });
      return true;
    } catch (e: any) {
      console.error("Simulation failed:", e);
      alert("合约执行将会失败 (Revert):\n\n" + (e.shortMessage || e.message));
      return false;
    }
  };

  const handleWhitelistCollateral = async () => {
    if (!(await checkAuthAndChain())) return;
    try {
      const seedMinParsed = parseUnits(collateralSeedMin || "0", 6);
      const txData = sdk.controller.encodeSetWhitelistedCollateral(
        collateralAddr as `0x${string}`,
        collateralIsWhitelist,
        seedMinParsed
      );

      if (!(await simulateTx(txData))) return;

      const hash = await sendTransactionAsync({
        to: sdk.controller.controllerAddress,
        data: txData,
        chainId: 1952,
      });
      alert("Transaction sent! Hash: " + hash);
      // Refresh logs after brief delay
      setTimeout(fetchLogs, 5000);
    } catch (e: any) {
      console.error(e);
      alert('Transaction failed: ' + (e?.message || e));
    }
  };

  const handleWhitelistCurve = async () => {
    if (!(await checkAuthAndChain())) return;
    try {
      const txData = sdk.controller.encodeSetWhitelistedCurve(
        curveAddr as `0x${string}`,
        curveIsWhitelist
      );

      if (!(await simulateTx(txData))) return;

      const hash = await sendTransactionAsync({
        to: sdk.controller.controllerAddress,
        data: txData,
        chainId: 1952,
      });
      alert("Transaction sent! Hash: " + hash);
      setTimeout(fetchLogs, 5000);
    } catch (e: any) {
      console.error(e);
      alert('Transaction failed: ' + (e?.message || e));
    }
  };

  const handleCheckRole = async () => {
    if (!publicClient || !roleUserAddr) return;
    try {
      const has = await publicClient.readContract({
        address: sdk.controller.controllerAddress,
        abi: FTControllerV2ABI,
        functionName: 'hasRole',
        args: [roleSelected as `0x${string}`, roleUserAddr as `0x${string}`],
      });
      setRoleStatus(has as boolean);
    } catch (e: any) {
      console.error(e);
      alert('Error checking role: ' + (e?.message || e));
    }
  };

  const handleGrantRole = async () => {
    if (!(await checkAuthAndChain())) return;
    try {
      const txData = encodeFunctionData({
        abi: FTControllerV2ABI,
        functionName: 'grantRole',
        args: [roleSelected as `0x${string}`, roleUserAddr as `0x${string}`],
      });
      
      if (!(await simulateTx(txData))) return;
      
      const hash = await sendTransactionAsync({
        to: sdk.controller.controllerAddress,
        data: txData,
        chainId: 1952,
      });
      alert("Role grant tx sent! Hash: " + hash);
      setRoleStatus(true);
    } catch (e: any) {
      console.error(e);
      alert('Operation failed: ' + (e?.shortMessage || e?.message || e));
    }
  };

  const handleRevokeRole = async () => {
    if (!(await checkAuthAndChain())) return;
    try {
      const txData = encodeFunctionData({
        abi: FTControllerV2ABI,
        functionName: 'revokeRole',
        args: [roleSelected as `0x${string}`, roleUserAddr as `0x${string}`],
      });
      
      if (!(await simulateTx(txData))) return;
      
      const hash = await sendTransactionAsync({
        to: sdk.controller.controllerAddress,
        data: txData,
        chainId: 1952,
      });
      alert("Role revoke tx sent! Hash: " + hash);
      setRoleStatus(false);
    } catch (e: any) {
      console.error(e);
      alert('Operation failed: ' + (e?.shortMessage || e?.message || e));
    }
  };

  const handleDeploy = async () => {
    if (!(await checkAuthAndChain())) return;
    try {
      if (!publicClient) return;
      const seedParsed = parseUnits(marketSeed || "0", 18);

      // Check allowance
      const allowance = await publicClient.readContract({
        address: marketCollateral as `0x${string}`,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address as `0x${string}`, sdk.controller.controllerAddress],
      });

      // Since seedParsed is OT amount (18 decimals) and allowance is for USDT (6 decimals),
      // we just use a heuristic or infinite approve.
      if (allowance === 0n) {
        const txData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [sdk.controller.controllerAddress, maxUint256],
        });

        const approveHash = await sendTransactionAsync({
          to: marketCollateral as `0x${string}`,
          data: txData,
          chainId: 1952,
        });
        
        // Wait for the approve tx to be mined
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      const now = BigInt(Math.floor(Date.now() / 1000));
      const end = BigInt(Math.floor(new Date(endDate).getTime() / 1000));
      
      const parsedOutcomes = outcomes.split(',').map(s => s.trim()).filter(Boolean);
      if (parsedOutcomes.length < 2) {
        alert("Please provide at least 2 outcomes");
        return;
      }

      const txData = sdk.controller.encodeDeployMarket(
        {
          timestampEnd: end,
          title: title || "New Market",
          ancillaryData: "0x",
          imageUri: imageUri,
          outcomeNames: parsedOutcomes,
          outcomeImageUris: parsedOutcomes.map(() => ""),
        },
        {
          parentTokenId: 0n,
          collateral: marketCollateral as `0x${string}`,
          curve: marketCurve as `0x${string}`,
          timestampStart: now,
        },
        address as `0x${string}`,
        seedParsed
      );

      if (!(await simulateTx(txData))) return;

      const hash = await sendTransactionAsync({
        to: sdk.controller.controllerAddress,
        data: txData,
        chainId: 1952,
      });
      alert("Transaction sent! Hash: " + hash);
    } catch (e: any) {
      console.error(e);
      alert('Operation failed: ' + (e?.shortMessage || e?.message || e));
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px', paddingBottom: '50px' }}>
      <h2 style={{ marginBottom: '30px', fontSize: '32px', background: 'linear-gradient(to right, var(--primary), var(--secondary))', WebkitBackgroundClip: 'text', color: 'transparent' }}>
        Admin Dashboard
      </h2>
      
      {txError && (
        <div style={{ padding: '15px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', marginBottom: '20px', color: '#ffaaaa' }}>
          <strong>Error:</strong> {txError.message}
        </div>
      )}

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px', overflowX: 'auto' }}>
        {['overview', 'whitelists', 'roles', 'markets'].map(tab => (
          <button 
            key={tab}
            className={activeTab === tab ? "btn-primary" : "btn-outline"}
            onClick={() => setActiveTab(tab)}
            style={{ textTransform: 'capitalize', padding: '10px 24px', minWidth: '120px', borderRadius: '8px' }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* --- OVERVIEW TAB --- */}
      {activeTab === 'overview' && (
        <div className="animate-fade-in">
          {/* 1. Global Stats Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Protocol Status</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: isPaused ? 'var(--danger)' : 'var(--success)', marginTop: '10px' }}>
            {isPaused === undefined ? '...' : isPaused ? 'PAUSED' : 'ACTIVE'}
          </span>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Default Fee Rate</span>
          <span style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--primary)', marginTop: '10px' }}>
            {defaultFeeRate === undefined ? '...' : `${Number(formatUnits(defaultFeeRate as bigint, 18)) * 100}%`}
          </span>
        </div>
      </div>

      {/* 2. View Panels (Whitelists) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '30px', marginBottom: '30px' }}>
        
        {/* Whitelisted Collaterals View */}
        <div className="glass-panel" style={{ padding: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
            <h3 style={{ fontSize: '20px', color: 'var(--text-main)', margin: 0 }}>Active Collaterals</h3>
            <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={fetchLogs} disabled={isFetchingLogs}>
              {isFetchingLogs ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.entries(whitelistedCollaterals).filter(([_, data]) => data.isWhitelisted).length === 0 ? (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No whitelisted collaterals found.</span>
            ) : (
              Object.entries(whitelistedCollaterals).map(([addr, data]) => data.isWhitelisted && (
                <div key={addr} style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span 
                    title="Click to copy full address"
                    onClick={() => navigator.clipboard.writeText(addr)}
                    style={{ fontFamily: 'monospace', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
                  >
                    {addr.slice(0, 8)}...{addr.slice(-6)}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--primary)', background: 'rgba(99, 102, 241, 0.2)', padding: '2px 8px', borderRadius: '10px' }}>Min: {data.seedMin}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Whitelisted Curves View */}
        <div className="glass-panel" style={{ padding: '30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
            <h3 style={{ fontSize: '20px', color: 'var(--text-main)', margin: 0 }}>Active Curves</h3>
            <button className="btn-outline" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={fetchLogs} disabled={isFetchingLogs}>
              {isFetchingLogs ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.entries(whitelistedCurves).filter(([_, isWhite]) => isWhite).length === 0 ? (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No whitelisted curves found.</span>
            ) : (
              Object.entries(whitelistedCurves).map(([addr, isWhite]) => isWhite && (
                <div key={addr} style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span 
                    title="Click to copy full address"
                    onClick={() => navigator.clipboard.writeText(addr)}
                    style={{ fontFamily: 'monospace', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
                  >
                    {addr.slice(0, 8)}...{addr.slice(-6)}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--success)', background: 'rgba(16, 185, 129, 0.2)', padding: '2px 8px', borderRadius: '10px' }}>Active</span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
        </div>
      )}

      {/* --- WHITELISTS TAB --- */}
      {activeTab === 'whitelists' && (
        <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '30px' }}>
          
          <div className="glass-panel" style={{ padding: '30px' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '20px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
              Manage Collateral
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Token Address (ERC20)</label>
                <input 
                  type="text" 
                  value={collateralAddr} 
                  onChange={e => setCollateralAddr(e.target.value)}
                  placeholder="0x..."
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Minimum Seed Amount</label>
                <input 
                  type="number" 
                  value={collateralSeedMin} 
                  onChange={e => setCollateralSeedMin(e.target.value)}
                  placeholder="10"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Action</label>
                <select 
                  value={collateralIsWhitelist ? "true" : "false"} 
                  onChange={e => setCollateralIsWhitelist(e.target.value === "true")}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
                >
                  <option value="true">Add to Whitelist</option>
                  <option value="false">Remove from Whitelist</option>
                </select>
              </div>
              <button className={collateralIsWhitelist ? "btn-primary" : "btn-outline"} style={{ marginTop: '10px' }} onClick={handleWhitelistCollateral}>
                {collateralIsWhitelist ? "Whitelist Token" : "Remove Token"}
              </button>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '30px' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '20px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
              Manage Curve
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Curve Address</label>
                <input 
                  type="text" 
                  value={curveAddr} 
                  onChange={e => setCurveAddr(e.target.value)}
                  placeholder="0x..."
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Action</label>
                <select 
                  value={curveIsWhitelist ? "true" : "false"} 
                  onChange={e => setCurveIsWhitelist(e.target.value === "true")}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
                >
                  <option value="true">Add to Whitelist</option>
                  <option value="false">Remove from Whitelist</option>
                </select>
              </div>
              <button className={curveIsWhitelist ? "btn-primary" : "btn-outline"} style={{ marginTop: '10px' }} onClick={handleWhitelistCurve}>
                {curveIsWhitelist ? "Whitelist Curve" : "Remove Curve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ROLES TAB --- */}
      {activeTab === 'roles' && (
        <div className="animate-fade-in" style={{ maxWidth: '600px' }}>
          <div className="glass-panel" style={{ padding: '30px' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '20px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
              Manage Roles
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Role</label>
                <select 
                  value={roleSelected} 
                  onChange={e => { setRoleSelected(e.target.value); setRoleStatus(null); }}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }}
                >
                  {ROLES.map(r => (
                    <option key={r.hash} value={r.hash}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Target Address</label>
                <input 
                  type="text" 
                  value={roleUserAddr} 
                  onChange={e => { setRoleUserAddr(e.target.value); setRoleStatus(null); }}
                  placeholder="0x..."
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
                />
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button className="btn-outline" style={{ flex: 1 }} onClick={handleCheckRole}>Check Role</button>
                {roleStatus !== null && (
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: roleStatus ? 'var(--success)' : 'var(--danger)' }}>
                    {roleStatus ? "Granted" : "Not Granted"}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button className="btn-primary" style={{ flex: 1, background: 'var(--success)' }} onClick={handleGrantRole}>Grant</button>
                <button className="btn-primary" style={{ flex: 1, background: 'var(--danger)' }} onClick={handleRevokeRole}>Revoke</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MARKETS TAB --- */}
      {activeTab === 'markets' && (
        <div className="animate-fade-in" style={{ maxWidth: '600px' }}>
          <div className="glass-panel" style={{ padding: '30px' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '20px', color: 'var(--primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '15px' }}>
              Deploy New Market
            </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Market Title</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Will ETH reach 10k in 2026?"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Outcome Names (comma separated)</label>
              <input 
                type="text" 
                value={outcomes} 
                onChange={e => setOutcomes(e.target.value)}
                placeholder="YES, NO"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>End Date</label>
              <input 
                type="datetime-local" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Image URI</label>
              <input 
                type="text" 
                value={imageUri} 
                onChange={e => setImageUri(e.target.value)}
                placeholder="https://..."
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Collateral Address</label>
              <select 
                value={marketCollateral} 
                onChange={e => setMarketCollateral(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
              >
                {Object.keys(whitelistedCollaterals).length === 0 && <option value={marketCollateral}>{marketCollateral}</option>}
                {Object.entries(whitelistedCollaterals).map(([addr, data]) => data.isWhitelisted && (
                  <option key={addr} value={addr}>{addr}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Curve Address</label>
              <select 
                value={marketCurve} 
                onChange={e => setMarketCurve(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
              >
                {Object.keys(whitelistedCurves).length === 0 && <option value={marketCurve}>{marketCurve}</option>}
                {Object.entries(whitelistedCurves).map(([addr, isWhite]) => isWhite && (
                  <option key={addr} value={addr}>{addr}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Initial Seed Liquidity (Amount of Shares per Outcome)</label>
              <input 
                type="number" 
                value={marketSeed} 
                onChange={e => setMarketSeed(e.target.value)}
                placeholder="10"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} 
              />
            </div>

            <div style={{ padding: '15px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '8px', fontSize: '14px', color: 'var(--text-muted)', marginTop: '10px' }}>
              <strong>Note:</strong> Deploying a market requires you to approve the Controller to spend collateral for the initial seed. The exact USDT cost will be calculated automatically based on the curve. You must ensure your wallet has enough balance.
            </div>

            <button className="btn-primary" style={{ marginTop: '10px' }} onClick={handleDeploy}>
              Submit Deploy Transaction
            </button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
