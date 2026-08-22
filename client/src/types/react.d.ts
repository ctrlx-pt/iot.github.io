declare module "react" {
  export type ReactNode = any;
  export type CSSProperties = Record<string, any>;
  export type RefObject<T> = { current: T | null };
  export type Ref<T> = RefObject<T> | ((instance: T | null) => void) | null;
  
  export interface HTMLAttributes<T> extends Record<string, any> {
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
  }
  
  export interface ComponentProps<T> extends HTMLAttributes<T> {}
  
  export function useEffect(effect: (...args: any[]) => any, deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps?: any[]): T;
  export function useState<S = undefined>(
    initialState?: S | (() => S)
  ): [S, (value: S | ((prev: S) => S)) => void];
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: any[]): T;
  export function useContext<T>(context: any): T;
  export function useRef<T>(initialValue: T): RefObject<T>;
  export function createContext<T>(defaultValue: T): any;
  export function forwardRef<T, P = {}>(
    render: (props: P, ref: Ref<T>) => ReactNode
  ): any;
  export const Fragment: any;
  
  const React: {
    useState: typeof useState;
    useEffect: typeof useEffect;
    useMemo: typeof useMemo;
    useCallback: typeof useCallback;
    useContext: typeof useContext;
    useRef: typeof useRef;
    createContext: typeof createContext;
    forwardRef: typeof forwardRef;
    Fragment: any;
  };
  export default React;
  export = React;
}

