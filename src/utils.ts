export interface Predicate<A> {
  (a: A): boolean;
}

export interface None {
  readonly _tag: "None";
}
const none: None = {
  _tag: "None",
};

export interface Some<A> {
  readonly _tag: "Some";
  readonly value: A;
}

const some = <A>(v: A): Some<A> => ({ _tag: "Some", value: v });

export type Option<A> = None | Some<A>;

export function findFirst<A>(
  predicate: Predicate<A>
): (as: ReadonlyArray<A>) => Option<A> {
  return (as) => {
    for (let i = 0; i < as.length; i++) {
      if (predicate(as[i])) {
        return some(as[i]);
      }
    }
    return none;
  };
}
