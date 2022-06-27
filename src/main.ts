import "./style.css";
import { vec3 } from "gl-matrix";

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
  noop,
  merge,
} from "rxjs";
import {
  take,
  mergeAll,
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
  sample,
  pairwise,
  share,
  startWith,
  reduce,
  throttle,
  takeWhile,
  mergeWith,
  mergeMap,
  isEmpty,
} from "rxjs/operators";
import { LRUCache } from "./cache";
import Hammer from "hammerjs";
import { fromNullable, isSome } from "./option";

const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max);

type UnwrapObservable<T> = T extends Observable<infer R> ? R : never;

type CanvasEventName = keyof HTMLElementEventMap;
type EventFromCanvasEventTag<K extends CanvasEventName> =
  HTMLElementEventMap[K];

type CanvasEvent<K extends CanvasEventName> = {
  tag: K;
  element: HTMLCanvasElement;
  event: HTMLElementEventMap[K];
};

const canvasObservable = <K extends CanvasEventName>(
  canvasEl: HTMLCanvasElement,
  tag: K
): Observable<CanvasEvent<K>> => {
  return fromEvent<EventFromCanvasEventTag<K>>(canvasEl, tag).pipe(
    map((ev) => ({ tag: tag, element: canvasEl, event: ev }))
  );
};
const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = /*html*/ `
<div class='canvases_container'>
<div class='canvas_proxy'>
  <canvas class='webgl_renderer_canvas'/>
</div>
</div>`;

let canvasEl = app.querySelector<HTMLCanvasElement>(".webgl_renderer_canvas")!;
console.log(canvasEl);
let containerEl = app.querySelector<HTMLDivElement>(".canvases_container")!;

canvasEl.width = containerEl.clientWidth;
canvasEl.height = containerEl.clientHeight;

const ro = <T extends HTMLElement>(element: T): Observable<DOMRect> =>
  new Observable((subscriber) => {
    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === element) {
          subscriber.next(entry.contentRect);
        }
      });
    });

    resizeObserver.observe(element, { box: "border-box" });

    return () => {
      resizeObserver.unobserve(element);
      resizeObserver.disconnect();
    };
  });

const containerResize$ = ro(containerEl);

let gl = canvasEl.getContext("2d")!;
gl.lineWidth = 5;

const containerElResize$ = fromEvent<HTMLElementEventMap["resize"]>(
  containerEl,
  "resize"
).pipe(share());

const pointerdown$ = canvasObservable(canvasEl, "pointerdown").pipe(share());
const pointerup$ = canvasObservable(canvasEl, "pointerup").pipe(share());
const pointermove$ = canvasObservable(canvasEl, "pointermove").pipe(share());
const pointerover$ = canvasObservable(canvasEl, "pointerover");

const ndc = ({
  element,
  event,
  tag,
}: CanvasEvent<"pointerup" | "pointerdown" | "pointermove">) => {
  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  return {
    x_ndc: (x / rect.width) * 2 - 1,
    y_ndc: (y / rect.height) * -2 + 1,
    x: x,
    y: y,
  };
};

const pointerComparisonFn = (
  pointer1: CanvasEvent<"pointerup" | "pointerdown" | "pointermove">,
  pointer2: CanvasEvent<"pointerup" | "pointerdown" | "pointermove">
) => {
  const { x_ndc: x1_ndc, y_ndc: y1_ndc, x: x1, y: y1 } = ndc(pointer1);
  const { x_ndc: x2_ndc, y_ndc: y2_ndc, x: x2, y: y2 } = ndc(pointer2);
  return {
    id: pointer1.event.pointerId,
    isPrimary: pointer1.event.isPrimary,
    type: pointer1.event.pointerType,
    dt: pointer2.event.timeStamp - pointer1.event.timeStamp,
    dP1: pointer2.event.pressure - pointer1.event.pressure,
    dP2: pointer2.event.tangentialPressure - pointer1.event.tangentialPressure,
    dA:
      pointer2.event.width * pointer2.event.height -
      pointer1.event.width * pointer1.event.height,
    //from left
    dx: x2_ndc - x1_ndc,
    // from top
    dy: y2_ndc - y1_ndc,
    x: x2,
    y: y2,
  };
};

type PointerComparison = ReturnType<typeof pointerComparisonFn>;

const dragging$ = pointerdown$.pipe(
  switchMap((down) =>
    pointermove$.pipe(
      tap((move) => move.event.preventDefault()),
      filter((move) => move.event.pointerId === down.event.pointerId),
      map((move) => pointerComparisonFn(down, move)),
      takeUntil(
        pointerup$.pipe(
          filter((up) => up.event.pointerId === down.event.pointerId)
        )
      )
    )
  ),
  // sample(interval(200)),
  tap({
    subscribe: () => console.log(`${name}: subscribed`),
    next: (value) => console.log(`${name}`, value.x, value.y),
    complete: () => console.log(`${name}: completed`),
    finalize: () => console.log(`${name}: unsubscribed`),
  })
);

const activePointers$ = pointerdown$.pipe(
  scan((cache, down) => {
    cache.set(`${down.event.pointerId}`, down);
    return cache;
  }, new Map<string, CanvasEvent<"pointerdown">>())
);

const pointerCache$ = pointerup$.pipe(mergeWith(pointerdown$)).pipe(
  scan((cache, o) => {
    switch (o.tag) {
      case "pointerdown":
        cache.set(`${o.event.pointerId}`, o);
        return cache;
      case "pointerup":
        cache.delete(`${o.event.pointerId}`);
        return cache;
    }
  }, new Map<string, CanvasEvent<"pointerdown">>())
);

const multitpointer$ = combineLatest([pointerCache$, pointermove$]).pipe(
  map(
    ([cache, move]): [
      CanvasEvent<"pointerdown"> | undefined,
      CanvasEvent<"pointermove">
    ] => [cache.get(`${move.event.pointerId}`), move]
  ),
  filter(
    (
      deviation
    ): deviation is [CanvasEvent<"pointerdown">, CanvasEvent<"pointermove">] =>
      !!deviation[0]
  ),
  map(([i, f]) => pointerComparisonFn(i, f))
);

containerResize$.subscribe((ev) => {
  canvasEl.width = ev.width;
  canvasEl.height = ev.height;
});

gl.beginPath();

// dragging$.subscribe(({ x, y }) => {
//   gl.beginPath();
//   gl.arc(x, y, 5, 0, 2 * Math.PI, false);
//   gl.closePath();
//   gl.fillStyle = `rgba(14, 255, 255, 1)`;
//   gl.fill();
// });

const remap = (x: number) => Math.abs(Math.atan(x) / (Math.PI / 2));

multitpointer$.subscribe(({ x, y, dx, dy, dP1, dA, dt }) => {
  gl.beginPath();
  gl.arc(x, y, 5, 0, 2 * Math.PI, false);
  gl.closePath();

  const fillColor = `rgba(${remap(dx) * 255}, ${remap(dy) * 255}, ${
    100 * remap(dt * 10)
  }, ${clamp(remap(dA * dP1 * 20), 0.7, 1)})`;

  gl.fillStyle = fillColor;
  gl.fill();
});
