import "./style.css";

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

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = /*html*/ `
<div class='wrapper'>
<canvas>
</div>
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

const doubleclick$ = pointerdown$.pipe(
  buffer(pointerdown$.pipe(throttleTime(250))),
  // if array is greater than 1, double click occured
  filter((clickArray) => clickArray.length > 1)
);

const dragging$ = pointerdown$.pipe(
  tap((dragStartEv) => {
    dragStartEv.preventDefault();
  }),
  switchMap((dragStartEv) =>
    pointermove$.pipe(
      map((dragMoveEv) => {
        const { x: x1, y: y1 } = ndc(dragStartEv);
        const { x: x2, y: y2 } = ndc(dragMoveEv);

        return {
          dx: x2 - x1,
          dy: y2 - y1,
        };
      }),
      takeUntil(pointerup$)
    )
  )
);

const pointerdownCoords$ = pointerdown$.pipe(map(ndc));

const clickdistance$ = pointerdown$.pipe(
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

const verticallyDragging$ = dragging$.pipe(
  filter(({ dx, dy }) => Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) >= 0.3)
);

const horizontallyDragging$ = dragging$.pipe(
  filter(({ dx, dy }) => Math.abs(dy) <= Math.abs(dx) && Math.abs(dy) >= 0.3)
);

doubleclick$.subscribe((v) => console.log(`double click ${v}`));
clickdistance$.subscribe((v) => console.log(`click distance ${v}`));
verticallyDragging$.subscribe((v) => console.log(`vertically dragging: ${v}`));
horizontallyDragging$.subscribe((v) =>
  console.log(`horizontally dragging: ${v}`)
);
