import { initialShellState, shellReducer } from '../src/navigation/shellState';

describe('shellReducer', () => {
  it('expands and collapses the menu based on focus region', () => {
    const expanded = shellReducer(initialShellState, { type: 'focus-menu' });
    expect(expanded.menuExpanded).toBe(true);
    expect(shellReducer(expanded, { type: 'focus-content' }).menuExpanded).toBe(
      false,
    );
  });

  it('changes routes without implicitly changing the menu state', () => {
    const expanded = { ...initialShellState, menuExpanded: true };
    expect(
      shellReducer(expanded, { type: 'select-route', route: 'guide' }),
    ).toEqual({
      activeRoute: 'guide',
      menuExpanded: true,
    });
  });
});
