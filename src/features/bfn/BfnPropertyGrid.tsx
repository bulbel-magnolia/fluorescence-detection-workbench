import { useId, useState } from 'react';

export interface BfnPropertyRow {
  id: string;
  label: string;
  value: string;
  unit?: string | undefined;
  symbol?: string | undefined;
  description?: string | undefined;
}

interface BfnPropertyGridProps {
  label: string;
  rows: readonly BfnPropertyRow[];
}

export function BfnPropertyGrid({ label, rows }: BfnPropertyGridProps) {
  const descriptionId = useId();
  const firstDescribedRow = rows.find((row) => row.description);
  const [activeId, setActiveId] = useState<string | null>(firstDescribedRow?.id ?? null);
  const activeRow =
    rows.find((row) => row.id === activeId && row.description) ?? firstDescribedRow ?? null;

  return (
    <div className="bfn-property-inspection">
      <dl className="bfn-property-grid" aria-label={label}>
        {rows.map((row) => {
          const active = activeRow?.id === row.id;
          const activate = () => {
            if (row.description) setActiveId(row.id);
          };
          return (
            <div
              className="bfn-property-row"
              data-active={active}
              key={row.id}
              onMouseEnter={activate}
            >
              <dt>
                {row.description ? (
                  <button
                    type="button"
                    aria-controls={descriptionId}
                    aria-expanded={active}
                    onClick={activate}
                    onFocus={activate}
                  >
                    <span>{row.label}</span>
                    {row.symbol ? <small>{row.symbol}</small> : null}
                  </button>
                ) : (
                  <span>
                    {row.label}
                    {row.symbol ? <small>{row.symbol}</small> : null}
                  </span>
                )}
              </dt>
              <dd>
                <strong>{row.value}</strong>
                {row.unit ? <span>{row.unit}</span> : null}
              </dd>
            </div>
          );
        })}
      </dl>
      {activeRow?.description ? (
        <div className="bfn-property-explanation" id={descriptionId} role="note">
          <strong>{activeRow.label}</strong>
          <p>{activeRow.description}</p>
        </div>
      ) : null}
    </div>
  );
}
