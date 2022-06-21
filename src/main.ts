import "./style.css";

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
const scissor$ = interval(300);
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

type DraggingRtrn = {
  id: number;
  isPrimary: boolean;
  type: string;
  dt: number;
  dP1: number;
  dP2: number;
  dA: number;
  dx: number;
  dy: number;
};

const dragging$ = pointerdown$.pipe(
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
        };
      }),
      takeUntil(pointerup$)
    )
  )
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

// const cacheApi = {
//   set: (key: number, value: DraggingRtrn, cache: Map<string, DraggingRtrn>) => {
//     value.isPrimary
//       ? cache.set("primary", value)
//       : cache.set(key.toString(), value);
//   },
//   flush: (cache: Map<string, DraggingRtrn>) => {
//     const keys = Array.from(cache.keys()).filter((k) => k !== "primary");
//     const tail = <T>(arr: Array<T>) => arr.slice(0, 3);
//     const keysToBeDeleted = tail(keys.sort((a, b) => +a - +b));
//     keysToBeDeleted.map((k) => cache.delete(k));
//   },
// };

const multitouch$ = dragging$.pipe(
  scan(
    (cache, curr) => {
      const key = curr.isPrimary ? "primary" : `${curr.id}`;
      cache.set(key, curr);
      return cache;
    },
    new LRUCache<string, DraggingRtrn>({
      maxSize: 10,
      entryExpirationTimeInMS: 2000,
      onEntryEvicted: ({ key, value, isExpired }) =>
        console.log(
          `Entry with key ${key} and value ${value} was evicted from the cache. Expired: ${isExpired}`
        ),
      onEntryMarkedAsMostRecentlyUsed: ({ key, value }) =>
        console.log(
          `Entry with key ${key} and value ${value} was just marked as most recently used.`
        ),
    })
  )
);

const verticalswipe$ = dragging$.pipe(
  filter(({ dx, dy }) => Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) >= 0.3)
);

const horizontalswipe$ = dragging$.pipe(
  filter(({ dx, dy }) => Math.abs(dy) <= Math.abs(dx) && Math.abs(dy) >= 0.3)
);

// const pinch$ =

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

multitouch$.subscribe((t) => console.log(t.newest));
