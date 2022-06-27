import { pipe } from "./pipe";

export interface None {
  readonly _tag: "None";
}

export interface Some<A> {
  readonly _tag: "Some";
  readonly value: A;
}

export type Option<A> = None | Some<A>;

const none: None = { _tag: "None" };
const some = <T>(value: T): Some<T> => ({ _tag: "Some", value });

export const isNone = (fa: Option<unknown>): fa is None => fa._tag === "None";
export const isSome = <A>(fa: Option<A>): fa is Some<A> => fa._tag === "Some";

export const mapOptional: <A, B>(
  f: (a: A) => B
) => (fa: Option<A>) => Option<B> = (f) => (fa) =>
  isNone(fa) ? none : some(f(fa.value));

export const fromNullable = <A>(a: A): Option<NonNullable<A>> =>
  a == null ? none : some(a as NonNullable<A>);

// const _map = (fa, f) => pipe(fa, map(f))
