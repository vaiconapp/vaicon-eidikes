import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

const MONTHS = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
const WDAYS = ['Δε','Τρ','Τε','Πε','Πα','Σα','Κυ'];
const startOfDay = (ts) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

// series: [{ color, data: [{ts, qty}], label }]  (1 ή 2)
export default function MiniCalendar({ title, series = [], onPickDay, selectedTs }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); });
  const navigated = useRef(false);
  const goMonth = (ts) => { navigated.current = true; setMonth(ts); };

  // Άνοιγμα αυτόματα στον πιο πρόσφατο μήνα με κίνηση (μέχρι ο χρήστης να πλοηγηθεί μόνος)
  let latestTs = 0;
  series.forEach(s => (s.data || []).forEach(({ ts }) => { if (ts && ts > latestTs) latestTs = ts; }));
  useEffect(() => {
    if (navigated.current || !latestTs) return;
    const d = new Date(latestTs);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
  }, [latestTs]);

  const mDate = new Date(month);
  const year = mDate.getFullYear(), m = mDate.getMonth();

  const buckets = series.map(s => {
    const counts = {};
    (s.data || []).forEach(({ ts, qty }) => {
      if (!ts) return;
      const d = new Date(ts);
      if (d.getFullYear() === year && d.getMonth() === m) counts[d.getDate()] = (counts[d.getDate()] || 0) + (qty || 1);
    });
    return { color: s.color, counts };
  });
  const dayTotal = (d) => buckets.reduce((s, b) => s + (b.counts[d] || 0), 0);

  const firstDow = (new Date(year, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const todaySod = startOfDay(Date.now());

  return (
    <View style={{ gap: 6 }}>
      {title ? <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#555', letterSpacing: 1 }}>{title}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <TouchableOpacity onPress={() => goMonth(new Date(year, m - 1, 1).getTime())} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#333' }}>
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>◀</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 'bold', color: '#333' }}>{MONTHS[m]} {year}</Text>
        <TouchableOpacity onPress={() => goMonth(new Date(year, m + 1, 1).getTime())} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#333' }}>
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>▶</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime())} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#2e7d32' }}>
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 11 }}>Σήμερα</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WDAYS.map(w => (
          <View key={w} style={{ flex: 1, alignItems: 'center', paddingVertical: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#888' }}>{w}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((d, i) => {
          if (d === null) return <View key={'e' + i} style={{ width: `${100 / 7}%`, padding: 1 }} />;
          const total = dayTotal(d);
          const cellTs = new Date(year, m, d).getTime();
          const isSel = selectedTs != null && cellTs === startOfDay(selectedTs);
          const isToday = cellTs === todaySod;
          return (
            <View key={d} style={{ width: `${100 / 7}%`, padding: 1 }}>
              <TouchableOpacity disabled={total === 0} onPress={() => onPickDay && onPickDay(cellTs)}
                style={{ height: 50, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 2,
                  backgroundColor: isSel ? '#333' : (isToday ? '#e8f5e9' : (total > 0 ? '#f5f9ff' : '#fafafa')),
                  borderWidth: 1, borderColor: isSel ? '#333' : (isToday ? '#2e7d32' : (total > 0 ? '#cfe0f5' : '#eee')) }}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: isSel ? 'white' : '#999' }}>{d}</Text>
                <View style={{ flexDirection: 'column', alignItems: 'center', gap: 1, marginTop: 1 }}>
                  {buckets.map((b, bi) => b.counts[d] ? (
                    <View key={bi} style={{ backgroundColor: isSel ? 'rgba(255,255,255,0.85)' : b.color, borderRadius: 4, paddingHorizontal: 4, minWidth: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '900', color: isSel ? '#333' : 'white' }}>{b.counts[d]}</Text>
                    </View>
                  ) : null)}
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
      {series.some(s => s.label) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
          {series.map((s, i) => s.label ? (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: s.color }} />
              <Text style={{ fontSize: 10, color: '#666', fontWeight: 'bold' }}>{s.label}</Text>
            </View>
          ) : null)}
        </View>
      )}
    </View>
  );
}
