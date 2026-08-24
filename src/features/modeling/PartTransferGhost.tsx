export interface PartTransfer {
  nodeId: string;
  source: DOMRect;
  target: DOMRect;
  color: string;
}

export function PartTransferGhost({ transfer }: { transfer: PartTransfer | null }) {
  if (!transfer) return null;
  const style = {
    left: transfer.source.left,
    top: transfer.source.top,
    width: transfer.source.width,
    height: transfer.source.height,
    '--transfer-x': `${transfer.target.left - transfer.source.left}px`,
    '--transfer-y': `${transfer.target.top - transfer.source.top}px`,
    '--transfer-color': transfer.color,
  } as React.CSSProperties;

  return (
    <div className="part-transfer-ghost" style={style} aria-hidden="true">
      <span />
    </div>
  );
}
