type HoverTarget = { id: string; startedAt: number };

const dwellMs = 650;

export class HoverSelectionController {
  private pending: HoverTarget | null = null;
  private selected: string | null = null;

  step(nodeId: string | null, now: number): { select: string | null; progress: number } {
    if (nodeId !== this.selected) this.selected = null;
    if (!nodeId) {
      this.pending = null;
      return { select: null, progress: 0 };
    }
    if (nodeId === this.selected) return { select: null, progress: 1 };
    if (this.pending?.id !== nodeId || now < this.pending.startedAt) {
      this.pending = { id: nodeId, startedAt: now };
    }
    const progress = Math.min(1, (now - this.pending.startedAt) / dwellMs);
    if (progress < 1) return { select: null, progress };
    this.selected = nodeId;
    this.pending = null;
    return { select: nodeId, progress: 1 };
  }

  cancel(nodeId: string | null): void {
    this.pending = null;
    if (nodeId !== this.selected) this.selected = null;
  }

  reset(): void {
    this.pending = null;
    this.selected = null;
  }
}
