import { SponsorForm } from '@/components/SponsorForm';
import { PageHeader } from '@/components/ui';
import { getSql } from '@/lib/db';
import { listPackages } from '@/lib/services/packages';

export default async function NewSponsor() {
  const packages = await listPackages(getSql());
  return (
    <>
      <PageHeader title="Add sponsor" sub="Only the name is required. Add the rest whenever you have it." />
      <div className="max-w-3xl border border-line bg-white p-5">
        <SponsorForm packages={packages} />
      </div>
    </>
  );
}
