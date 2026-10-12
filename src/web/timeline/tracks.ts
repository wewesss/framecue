export interface TrackSpan {
  id: string;
  start: number;
  end: number;
}

export interface TrackLayout {
  lanes: Map<string, number>;
  count: number;
}

export function assignLanes(spans: readonly TrackSpan[]): TrackLayout {
  const order = spans
    .map((span, index) => ({ span, index }))
    .sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end || a.index - b.index);
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const { span } of order) {
    const end = Math.max(span.end, span.start);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd < span.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    lanes.set(span.id, lane);
  }
  return { lanes, count: Math.max(laneEnds.length, 1) };
}
