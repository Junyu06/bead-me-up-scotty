import type { MapBox, MapLink, Point } from "./map-model";
export interface Rect extends Point {
  width: number;
  height: number;
}
export interface MapRoute {
  points: Point[];
  sourceHandle: string;
  targetHandle: string;
}
const gap = 12;
const inside = (p: Point, r: Rect) =>
  p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
export function crosses(a: Point, b: Point, r: Rect) {
  if (a.x === b.x)
    return (
      a.x > r.x &&
      a.x < r.x + r.width &&
      Math.max(a.y, b.y) > r.y &&
      Math.min(a.y, b.y) < r.y + r.height
    );
  if (a.y === b.y)
    return (
      a.y > r.y &&
      a.y < r.y + r.height &&
      Math.max(a.x, b.x) > r.x &&
      Math.min(a.x, b.x) < r.x + r.width
    );
  return true;
}
const expand = (r: Rect, padding: number): Rect => ({
  x: r.x - padding,
  y: r.y - padding,
  width: r.width + 2 * padding,
  height: r.height + 2 * padding,
});

/** Orthogonal visibility grid. Every segment is checked against actual boxes.
 * A missing route is explicit; we never fall back to a line through content. */
export function orthogonalRoute(
  start: Point,
  end: Point,
  obstacles: Rect[],
): Point[] | null {
  const xs = [
    ...new Set([
      start.x,
      end.x,
      ...obstacles.flatMap((r) => [r.x, r.x + r.width]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      start.y,
      end.y,
      ...obstacles.flatMap((r) => [r.y, r.y + r.height]),
    ]),
  ].sort((a, b) => a - b);
  const width = xs.length,
    startId = ys.indexOf(start.y) * width + xs.indexOf(start.x),
    endId = ys.indexOf(end.y) * width + xs.indexOf(end.x);
  const point = (id: number) => ({
    x: xs[id % width],
    y: ys[Math.floor(id / width)],
  });
  const clear = new Map<string, boolean>();
  const segmentClear = (a: number, b: number) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (!clear.has(key))
      clear.set(key, !obstacles.some((r) => crosses(point(a), point(b), r)));
    return clear.get(key)!;
  };
  // State includes direction so bend costs do not discard a better arrival.
  const dist = new Map<number, number>(),
    previous = new Map<number, number>();
  const queue: { key: number; score: number }[] = [];
  const push = (key: number, score: number) => {
    let i = queue.length;
    queue.push({ key, score });
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (queue[parent].score <= score) break;
      queue[i] = queue[parent];
      i = parent;
    }
    queue[i] = { key, score };
  };
  const pop = () => {
    const first = queue[0],
      last = queue.pop()!;
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let c = i * 2 + 1;
        if (c + 1 < queue.length && queue[c + 1].score < queue[c].score) c++;
        if (queue[c].score >= last.score) break;
        queue[i] = queue[c];
        i = c;
      }
      queue[i] = last;
    }
    return first;
  };
  const heuristic = (id: number) =>
    Math.abs(point(id).x - end.x) + Math.abs(point(id).y - end.y);
  dist.set(startId * 3, 0);
  push(startId * 3, heuristic(startId));
  let endKey: number | undefined;
  while (queue.length) {
    const { key, score } = pop(),
      id = Math.floor(key / 3),
      direction = key % 3,
      cost = dist.get(key)!;
    if (score > cost + heuristic(id)) continue;
    if (id === endId) {
      endKey = key;
      break;
    }
    const x = id % width,
      y = Math.floor(id / width);
    for (const next of [
      x > 0 ? id - 1 : -1,
      x + 1 < width ? id + 1 : -1,
      y > 0 ? id - width : -1,
      y + 1 < ys.length ? id + width : -1,
    ]) {
      if (next < 0 || !segmentClear(id, next)) continue;
      const dir = Math.abs(next - id) === 1 ? 1 : 2;
      const p = point(id),
        q = point(next);
      const nextCost =
        cost +
        Math.abs(p.x - q.x) +
        Math.abs(p.y - q.y) +
        (direction && direction !== dir ? 24 : 0);
      const nextKey = next * 3 + dir;
      if (nextCost < (dist.get(nextKey) ?? Infinity)) {
        dist.set(nextKey, nextCost);
        previous.set(nextKey, key);
        push(nextKey, nextCost + heuristic(next));
      }
    }
  }
  if (endKey === undefined) return null;
  const path: Point[] = [];
  for (
    let key: number | undefined = endKey;
    key !== undefined;
    key = previous.get(key)
  )
    path.push(point(Math.floor(key / 3)));
  path.reverse();
  return path.filter(
    (p, i) =>
      !i ||
      i === path.length - 1 ||
      !(
        (path[i - 1].x === p.x && p.x === path[i + 1].x) ||
        (path[i - 1].y === p.y && p.y === path[i + 1].y)
      ),
  );
}
export function routeLink(link: MapLink, boxes: MapBox[]): MapRoute | null {
  const byId = new Map(boxes.map((b) => [b.id, b])),
    source = byId.get(link.source),
    target = byId.get(link.target);
  if (!source || !target) return null;
  const ancestors = new Set<string>();
  for (const box of [source, target]) {
    let parent = box.parentId;
    while (parent && !ancestors.has(parent)) {
      ancestors.add(parent);
      parent = byId.get(parent)?.parentId;
    }
  }
  const obstacles: Rect[] = [];
  for (const box of boxes) {
    const rect = { ...box.absolute, width: box.width, height: box.height };
    if (
      box.container &&
      (ancestors.has(box.id) || box.id === source.id || box.id === target.id)
    ) {
      obstacles.push(expand({ ...rect, height: 100 }, 8));
      if (!box.collapsed)
        obstacles.push(
          expand({ ...rect, y: rect.y + rect.height - 30, height: 30 }, 8),
        );
    } else obstacles.push(expand(rect, 8));
  }
  const vertical =
    !source.container &&
    !target.container &&
    source.parentId === target.parentId &&
    source.absolute.y + source.height + gap < target.absolute.y;
  const sourceHandle = vertical ? "out-bottom" : "out-right",
    targetHandle = vertical ? "in-top" : "in-left";
  const start = vertical
    ? {
        x: source.absolute.x + source.width / 2,
        y: source.absolute.y + source.height,
      }
    : {
        x: source.absolute.x + source.width,
        y: source.absolute.y + (source.container ? 44 : source.height / 2),
      };
  const end = vertical
    ? { x: target.absolute.x + target.width / 2, y: target.absolute.y }
    : {
        x: target.absolute.x,
        y: target.absolute.y + (target.container ? 44 : target.height / 2),
      };
  const from = {
      x: start.x + (vertical ? 0 : gap),
      y: start.y + (vertical ? gap : 0),
    },
    to = { x: end.x - (vertical ? 0 : gap), y: end.y - (vertical ? gap : 0) };
  if (obstacles.some((r) => inside(from, r) || inside(to, r))) return null;
  // Stubs cross their own padding only, never a different card.
  const otherBoxes = boxes.filter(
    (b) => b.id !== source.id && b.id !== target.id && !ancestors.has(b.id),
  );
  if (
    otherBoxes.some(
      (b) =>
        crosses(start, from, {
          ...b.absolute,
          width: b.width,
          height: b.height,
        }) ||
        crosses(to, end, { ...b.absolute, width: b.width, height: b.height }),
    )
  )
    return null;
  const middle = orthogonalRoute(from, to, obstacles);
  return middle
    ? { points: [start, ...middle, end], sourceHandle, targetHandle }
    : null;
}
export const routePath = (points: Point[]) =>
  points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
