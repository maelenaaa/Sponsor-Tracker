import type { PackageItem, PackageRow } from '../domain/types';
import { UserError, type PackageInput, type PackageItemInput } from '../validation';
import { wrap, type Q } from './common';

export interface PackageWithItems extends PackageRow {
  items: PackageItem[];
  sponsor_count: number;
}

const ITEM_COLUMNS = `id, package_id, label, platform, recurrence, quantity, interval_months,
  start_offset_days, max_occurrences, notes, sort_order, archived`;

export async function listPackages(q: Q): Promise<PackageWithItems[]> {
  const packages = await q<PackageRow[]>`select id, name, description, is_active, version from packages order by lower(name)`;
  const items = await q<PackageItem[]>`select ${q.unsafe(ITEM_COLUMNS)} from package_items order by sort_order, created_at`;
  const counts = await q<{ package_id: string; n: number }[]>`
    select package_id, count(*)::int as n from sponsors where package_id is not null group by package_id`;
  const countMap = new Map(counts.map((c) => [c.package_id, c.n]));
  return packages.map((p) => ({
    ...p,
    items: items.filter((i) => i.package_id === p.id),
    sponsor_count: countMap.get(p.id) ?? 0,
  }));
}

export async function getPackage(q: Q, id: string): Promise<PackageWithItems | null> {
  const all = await listPackages(q);
  return all.find((p) => p.id === id) ?? null;
}

export async function createPackage(q: Q, input: PackageInput): Promise<PackageRow> {
  return wrap(async () => {
    const [row] = await q<PackageRow[]>`
      insert into packages (name, description, is_active)
      values (${input.name}, ${input.description}, ${input.is_active})
      returning id, name, description, is_active, version`;
    return row;
  });
}

/** Renaming or describing a package does not change what sponsors are owed, so the version stays the same. */
export async function updatePackage(q: Q, id: string, input: PackageInput): Promise<void> {
  await wrap(async () => {
    const res = await q`update packages set name = ${input.name}, description = ${input.description},
      is_active = ${input.is_active}, updated_at = now() where id = ${id}`;
    if (res.count === 0) throw new UserError('That package no longer exists.');
  });
}

export async function deletePackage(q: Q, id: string): Promise<void> {
  const [{ n }] = await q<{ n: number }[]>`select count(*)::int as n from sponsors where package_id = ${id}`;
  if (n > 0) throw new UserError(`${n} sponsor${n === 1 ? ' uses' : 's use'} this package. Move them to another package first, or mark the package inactive.`);
  await wrap(async () => {
    await q`delete from packages where id = ${id}`;
  });
}

async function bumpVersion(q: Q, packageId: string) {
  await q`update packages set version = version + 1, updated_at = now() where id = ${packageId}`;
}

export async function addItem(q: Q, packageId: string, input: PackageItemInput): Promise<PackageItem> {
  return wrap(() =>
    q.begin(async (tx) => {
      const [{ next }] = await tx<{ next: number }[]>`
        select coalesce(max(sort_order), 0) + 10 as next from package_items where package_id = ${packageId}`;
      const [row] = await tx<PackageItem[]>`
        insert into package_items (package_id, label, platform, recurrence, quantity, interval_months,
          start_offset_days, max_occurrences, notes, sort_order)
        values (${packageId}, ${input.label}, ${input.platform}, ${input.recurrence}, ${input.quantity},
          ${input.interval_months}, ${input.start_offset_days}, ${input.max_occurrences}, ${input.notes}, ${next})
        returning ${tx.unsafe(ITEM_COLUMNS)}`;
      await bumpVersion(tx as unknown as Q, packageId);
      return row;
    }),
  );
}

export async function updateItem(q: Q, itemId: string, input: PackageItemInput): Promise<void> {
  await wrap(() =>
    q.begin(async (tx) => {
      const [before] = await tx<PackageItem[]>`select ${tx.unsafe(ITEM_COLUMNS)} from package_items where id = ${itemId} for update`;
      if (!before) throw new UserError('That deliverable rule no longer exists.');
      const changed =
        before.label !== input.label ||
        before.platform !== input.platform ||
        before.recurrence !== input.recurrence ||
        before.quantity !== input.quantity ||
        before.interval_months !== input.interval_months ||
        before.start_offset_days !== input.start_offset_days ||
        before.max_occurrences !== input.max_occurrences;
      await tx`update package_items set label = ${input.label}, platform = ${input.platform},
        recurrence = ${input.recurrence}, quantity = ${input.quantity}, interval_months = ${input.interval_months},
        start_offset_days = ${input.start_offset_days}, max_occurrences = ${input.max_occurrences},
        notes = ${input.notes}, updated_at = now() where id = ${itemId}`;
      if (changed) await bumpVersion(tx as unknown as Q, before.package_id);
    }),
  );
}

/** Archive instead of delete so deliverables already generated from this rule keep their history. */
export async function setItemArchived(q: Q, itemId: string, archived: boolean): Promise<void> {
  await wrap(() =>
    q.begin(async (tx) => {
      const [item] = await tx<{ package_id: string; archived: boolean }[]>`
        select package_id, archived from package_items where id = ${itemId} for update`;
      if (!item) throw new UserError('That deliverable rule no longer exists.');
      if (item.archived === archived) return;
      await tx`update package_items set archived = ${archived}, updated_at = now() where id = ${itemId}`;
      await bumpVersion(tx as unknown as Q, item.package_id);
    }),
  );
}
