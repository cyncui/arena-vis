export type SelectionState<N extends { id: string }> = Readonly<{ selected: N | null; history: readonly N[] }>;
export type SelectionAction<N> =
  | { type: 'select'; node: N }
  | { type: 'jump'; index: number }
  | { type: 'back' }
  | { type: 'remove'; ids: ReadonlySet<string> }
  | { type: 'clear' };

export function selectionReducer<N extends { id: string }>(state: SelectionState<N>, action: SelectionAction<N>): SelectionState<N> {
  const { selected, history } = state;
  switch (action.type) {
    case 'select':
      return !selected || selected.id === action.node.id || history[history.length - 1]?.id === selected.id
        ? { selected: action.node, history }
        : { selected: action.node, history: [...history, selected] };
    case 'jump': {
      const node = history[action.index];
      return node ? { selected: node, history: history.slice(0, action.index) } : state;
    }
    case 'back':
      return selectionReducer(state, { type: 'jump', index: history.length - 1 });
    case 'remove': {
      const next = selected && action.ids.has(selected.id) ? null : selected;
      const kept = history.filter(node => !action.ids.has(node.id)).filter((node, index, list) => index === 0 || list[index - 1].id !== node.id);
      return { selected: next, history: kept[kept.length - 1]?.id === next?.id ? kept.slice(0, -1) : kept };
    }
    case 'clear':
      return { selected: null, history: [] };
  }
}
