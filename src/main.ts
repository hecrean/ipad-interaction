import "./style.css";
import { vec3, vec3 } from "gl-matrix";

import { findFirst, Predicate } from "./utils";
import {
  of,
  map,
  Observable,
  fromEvent,
  EMPTY,
  buffer,
  throttleTime,
  zip,
  combineLatest,
  timer,
  interval,
} from "rxjs";
import {
  switchMap,
  takeUntil,
  zipWith,
  withLatestFrom,
  concatMap,
  elementAt,
  catchError,
  filter,
  scan,
  takeLast,
  tap,
  pairwise,
  share,
  startWith,
  reduce,
  throttle,
} from "rxjs/operators";
import { LRUCache } from "./cache";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = /*html*/ `
<canvas>
`;

const canvasEl = app.querySelector("canvas")!;

// utils:
const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max);

const ndc = (ev: PointerEvent): { x: number; y: number } => {
  const el = ev.target as HTMLElement;
  const rect = el.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;

  return { x: (x / el.clientWidth) * 2 - 1, y: (y / el.clientHeight) * -2 + 1 };
};

interface Interaction {
  pointerdown: PointerEvent;
  pointerup: PointerEvent;
  pointermove: PointerEvent;
  pointerover: PointerEvent;
  wheel: WheelEvent;
  doubleclick: [clickOne: PointerEvent, clickTwo: PointerEvent];
  drag: { dx: number; dy: number };
}
// observables:

// -- time :
const scissor$ = interval(500);
const relativeTime$: Observable<[Date, Date]> = interval(1000).pipe(
  map(() => new Date()),
  share(),
  startWith(new Date()),
  pairwise()
);

const pointerdown$ = fromEvent<HTMLElementEventMap["pointerdown"]>(
  canvasEl,
  "pointerdown"
);
const pointerup$ = fromEvent<HTMLElementEventMap["pointerup"]>(
  canvasEl,
  "pointerup"
);
const pointermove$ = fromEvent<HTMLElementEventMap["pointermove"]>(
  canvasEl,
  "pointermove"
);

const pointerover$ = fromEvent<HTMLElementEventMap["pointerover"]>(
  canvasEl,
  "pointerover"
);

const wheel$ = fromEvent<HTMLElementEventMap["wheel"]>(canvasEl, "wheel");

const doubletap$ = pointerdown$.pipe(
  buffer(pointerdown$.pipe(throttleTime(250))),
  // if array is greater than 1, double click occured
  filter((clickArray) => clickArray.length > 1)
);

const dragging$ = pointerdown$.pipe(
  throttle(() => interval(1000)),
  tap((e) => e.preventDefault()),
  switchMap((pointerdownEv) =>
    pointermove$.pipe(
      filter(
        (pointermoveEv) => pointerdownEv.pointerId === pointermoveEv.pointerId
      ),
      map((pointermoveEv) => {
        const { x: x1, y: y1 } = ndc(pointerdownEv);
        const { x: x2, y: y2 } = ndc(pointermoveEv);

        //integrate the pressure and touch contact area over time ?

        return {
          id: pointerdownEv.pointerId,
          isPrimary: pointerdownEv.isPrimary,
          type: pointerdownEv.pointerType,
          dt: pointermoveEv.timeStamp - pointerdownEv.timeStamp,
          dP1: pointermoveEv.pressure - pointerdownEv.pressure,
          dP2:
            pointermoveEv.tangentialPressure - pointerdownEv.tangentialPressure,
          dA:
            pointermoveEv.width * pointermoveEv.height -
            pointerdownEv.width * pointerdownEv.height,
          dx: x2 - x1,
          dy: y2 - y1,
          x: x1,
          y: y1,
        };
      }),
      takeUntil(pointerup$)
    )
  )
);

const verticalswipe$ = dragging$.pipe(
  filter(({ dx, dy }) => Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) >= 0.3)
);

const horizontalswipe$ = dragging$.pipe(
  filter(({ dx, dy }) => Math.abs(dy) <= Math.abs(dx) && Math.abs(dy) >= 0.3)
);

const twotaps$ = pointerdown$.pipe(
  map(ndc),
  pairwise(),
  map(([first, second]) => {
    const x0 = first.x;
    const y0 = first.y;
    const x1 = second.x;
    const y1 = second.y;
    return Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
  })
);

type UnwrapObservable<T> = T extends Observable<infer R> ? R : never;

type TouchingPointer = UnwrapObservable<typeof dragging$>;

const multitouch$ = dragging$.pipe(
  scan(
    (cache, curr) => {
      const key = curr.isPrimary ? "primary" : `${curr.id}`;
      cache.set(key, curr);
      return cache;
    },
    new LRUCache<string, TouchingPointer>({
      maxSize: 3,
      entryExpirationTimeInMS: 5000,
      // onEntryEvicted: ({ key, value, isExpired }) =>
      //   console.log(
      //     `Entry with key ${key} and value ${value} was evicted from the cache. Expired: ${isExpired}`
      //   ),
      // onEntryMarkedAsMostRecentlyUsed: ({ key, value }) =>
      //   console.log(
      //     `Entry with key ${key} and value ${value} was just marked as most recently used.`
      //   ),
    })
  ),
  map((cache) => {
    const array: Array<TouchingPointer> = [];
    for (const el of cache.entries()) {
      array.push(el.value);
    }
    return array;
  })
);

const sum = (arr: Array<number>) => arr.reduce((a, b) => a + b, 0);

const centroid = (arr: Array<TouchingPointer>) => {
  const xMean = sum(arr.map((arr) => arr.x));
  const yMean = sum(arr.map((arr) => arr.y));
  const len = arr.length;
  return vec3.fromValues(xMean / len, yMean / len, 0);
};

type PointerTrajectory = {
  r: vec3;
  dr: vec3;
};
const trajectory = (arr: Array<TouchingPointer>): Array<PointerTrajectory> => {
  const c = centroid(arr);

  return arr.map((a) => ({
    r: vec3.add(
      vec3.create(),
      vec3.mul(vec3.create(), c, vec3.fromValues(-1, -1, -1)),
      vec3.fromValues(a.x, a.y, 0)
    ),
    dr: vec3.fromValues(a.dx, a.dy, 0),
  }));
};

const pointerstrajectory$ = multitouch$.pipe(map(trajectory));

const lengthChange = ({ r, dr }: PointerTrajectory) =>
  vec3.length(vec3.add(vec3.create(), r, dr)) - vec3.length(r);

const pinch$ = pointerstrajectory$.pipe(
  map((arr) => arr.map(lengthChange)),
  map(sum)
);

const cross = ({ r, dr }: PointerTrajectory) =>
  vec3.cross(vec3.create(), r, vec3.add(vec3.create(), r, dr));

const dot = ({ r, dr }: PointerTrajectory) =>
  vec3.dot(r, vec3.add(vec3.create(), r, dr));

const cross$ = pointerstrajectory$.pipe(map((arr) => arr.map(cross)));
const dot$ = pointerstrajectory$.pipe(map((arr) => arr.map(dot)));

const sumVec3 = (arr: Array<vec3>) => {
  let sum: vec3 = vec3.create();
  for (let v of arr) {
    vec3.add(sum, sum, v);
  }
  return sum;
};
const rotation$ = cross$.pipe(map(sumVec3));

// const pan$ =

// const press$ =

// const rotate$ =

// const tap$ =

// clickdistance$.subscribe((v) => console.log(`click distance ${v}`));
// verticallyDragging$.subscribe((v) => console.log(`vertically dragging: ${v}`));
// horizontallyDragging$.subscribe((v) =>
//   console.log(`horizontally dragging: ${v}`)
// );

// const process = ({
//   pointerId,
//   pointerType,
//   pressure,
//   tiltX,
//   tiltY,
//   timeStamp,
//   width,
//   height,
// }: PointerEvent) => {

// };

dot$.pipe(buffer(scissor$)).subscribe((v) => console.log("dot:", v));
rotation$.pipe(buffer(scissor$)).subscribe((v) => console.log("rotation:", v));
pinch$.pipe(buffer(scissor$)).subscribe((v) => console.log("pinch", v));

// cross$.subscribe((v) => console.log("cross", v));
