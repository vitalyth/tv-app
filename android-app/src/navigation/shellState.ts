import type { RootRoute } from './routes';

export interface ShellState {
  activeRoute: RootRoute;
  menuExpanded: boolean;
}

export type ShellAction =
  | { type: 'focus-menu' }
  | { type: 'focus-content' }
  | { type: 'select-route'; route: RootRoute }
  | { type: 'collapse-menu' };

export const initialShellState: ShellState = {
  activeRoute: 'home',
  menuExpanded: false,
};

export function shellReducer(
  state: ShellState,
  action: ShellAction,
): ShellState {
  switch (action.type) {
    case 'focus-menu':
      return state.menuExpanded ? state : { ...state, menuExpanded: true };
    case 'focus-content':
    case 'collapse-menu':
      return state.menuExpanded ? { ...state, menuExpanded: false } : state;
    case 'select-route':
      return { ...state, activeRoute: action.route };
    default:
      return state;
  }
}
