import { useEffect, useRef, useState } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { createChart, AreaSeries } from 'lightweight-charts';
import { sdk } from '../config/sdk';

interface PriceChartProps {
  marketAddress: string;
}

export default function PriceChart({ marketAddress }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#94a3b8', // var(--text-muted)
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      crosshair: {
        vertLine: { color: 'rgba(99, 102, 241, 0.5)' }, // var(--primary-glow)
        horzLine: { color: 'rgba(99, 102, 241, 0.5)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
    });

    chartRef.current = chart;

    // Create Area Series for price
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#a855f7', // var(--secondary)
      topColor: 'rgba(168, 85, 247, 0.4)',
      bottomColor: 'rgba(168, 85, 247, 0.0)',
      lineWidth: 2,
    });

    seriesRef.current = areaSeries;

    // Handle Resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await sdk.indexer.getTradesByMarket(marketAddress, 1000);
        const trades = (res as any).trades || [];

        // Data processing: Price = collateralAmount / otAmount
        // Need to parse bigint strings accurately or fallback to Number for charting.
        // Assuming collateral (USDC) has 6 decimals and OT has 18 decimals:
        // Price = (collateral / 1e6) / (ot / 1e18) = (collateral / ot) * 1e12
        const chartData = trades.map((t: any) => {
          const collateral = Number(t.collateralAmount);
          const ot = Number(t.otAmount);
          const price = ot > 0 ? (collateral / ot) * 1e12 : 0;
          
          return {
            time: Number(t.timestamp) as Time,
            value: price,
          };
        });

        // Filter duplicates by time (Lightweight charts require unique timestamps)
        const uniqueData = Array.from(new Map(chartData.map((item: any) => [item.time, item])).values()) as { time: Time, value: number }[];

        if (seriesRef.current && uniqueData.length > 0) {
          seriesRef.current.setData(uniqueData);
          chartRef.current?.timeScale().fitContent();
        }
      } catch (err) {
        console.error(err);
        setError('Failed to load chart data');
      } finally {
        setLoading(false);
      }
    }

    if (marketAddress) {
      loadData();
    }
  }, [marketAddress]);

  return (
    <div style={{ width: '100%', marginTop: '20px', position: 'relative' }}>
      {loading && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--primary)' }}>Loading chart...</div>}
      {error && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--danger)' }}>{error}</div>}
      
      {/* Chart Container */}
      <div 
        ref={chartContainerRef} 
        style={{ 
          width: '100%', 
          height: '300px', 
          opacity: loading ? 0.3 : 1, 
          transition: 'opacity 0.3s ease' 
        }} 
      />
    </div>
  );
}
