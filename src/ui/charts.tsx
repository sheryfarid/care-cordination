import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Cell } from 'recharts';

const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13 }, cursor: { fill: 'var(--hover)' } };
const ax = { tick: { fill: 'var(--muted)', fontSize: 12 }, axisLine: { stroke: 'var(--border)' }, tickLine: false };

export const Bars = ({ data, color = 'var(--blue)', h = 220, horizontal, onClick, colors }: any) => (
  <div style={{ height: h }} role="img" aria-label={data.map((d: any) => `${d.name}: ${d.value}`).join(', ')}>
    <ResponsiveContainer>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 8 : -18, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={!!horizontal} horizontal={!horizontal} />
        {horizontal ? <><XAxis type="number" allowDecimals={false} {...ax} /><YAxis type="category" dataKey="name" width={150} {...ax} /></> : <><XAxis dataKey="name" {...ax} interval={0} /><YAxis allowDecimals={false} {...ax} /></>}
        <Tooltip {...tip} />
        <Bar dataKey="value" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} onClick={onClick ? (d: any) => onClick(d) : undefined} cursor={onClick ? 'pointer' : undefined}>
          {data.map((d: any, i: number) => <Cell key={i} fill={d.color || (colors ? colors[i % colors.length] : color)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);
export const Lines = ({ data, keys, h = 220 }: any) => (
  <div style={{ height: h }} role="img" aria-label="Trend chart">
    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" {...ax} /><YAxis allowDecimals={false} {...ax} /><Tooltip {...tip} />
        {keys.map((k: any) => <Line key={k.k} type="monotone" dataKey={k.k} name={k.label} stroke={k.color} strokeWidth={2.2} dot={false} />)}
      </LineChart>
    </ResponsiveContainer>
  </div>
);
