import { formatDate, type ISODate } from '@/lib/dates';
import type { DeliverableRow } from '@/lib/domain/types';
import { DeliverableActions } from './DeliverableActions';
import { Empty, ExtLink, PlatformTag, SponsorLink, StatusBadge, Table, td, th } from './ui';

type Row = DeliverableRow & { sponsor_name?: string };

export function When({ d }: { d: Row }) {
  if (d.status === 'published') {
    return (
      <div>
        <div>Published {formatDate(d.actual_date)}</div>
        {d.planned_date && d.planned_date !== d.actual_date ? (
          <div className="text-xs text-ink/60">Planned {formatDate(d.planned_date)}</div>
        ) : null}
        {d.published_url ? <ExtLink href={d.published_url}>View post</ExtLink> : <span className="text-xs text-late">No link saved</span>}
      </div>
    );
  }
  return (
    <div>
      {d.planned_date ? <div>Planned {formatDate(d.planned_date)}</div> : <div className="text-ink/60">Not scheduled</div>}
      {d.due_date ? <div className="text-xs text-ink/60">Due {formatDate(d.due_date)}</div> : null}
    </div>
  );
}

export function DeliverableTable({
  rows,
  today,
  showSponsor = true,
  empty = 'Nothing here.',
}: {
  rows: Row[];
  today: ISODate;
  showSponsor?: boolean;
  empty?: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <Table>
      <thead>
        <tr>
          {showSponsor ? <th className={th}>Sponsor</th> : null}
          <th className={th}>Deliverable</th>
          <th className={th}>Status</th>
          <th className={th}>When</th>
          <th className={th}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id}>
            {showSponsor ? <td className={td}><SponsorLink id={d.sponsor_id} name={d.sponsor_name ?? 'Sponsor'} /></td> : null}
            <td className={td}>
              <div>{d.label}</div>
              <PlatformTag platform={d.platform} />
              {d.notes ? <div className="mt-1 max-w-xs text-xs text-ink/60">{d.notes}</div> : null}
            </td>
            <td className={td}><StatusBadge d={d} today={today} /></td>
            <td className={td}><When d={d} /></td>
            <td className={td}><DeliverableActions d={d} today={today} /></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
