import { createPackageAction } from '@/app/actions';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Field, PageHeader, inputCls } from '@/components/ui';

export default function NewPackage() {
  return (
    <>
      <PageHeader title="New package" sub="Name it now. You add the deliverable rules on the next screen." />
      <ActionForm action={createPackageAction} className="grid max-w-xl gap-4 border border-line bg-white p-5" showSuccess={false}>
        <Field label="Package name"><input name="name" required autoFocus className={inputCls} placeholder="Gold Sponsor" /></Field>
        <Field label="Description"><textarea name="description" rows={3} className={inputCls} /></Field>
        <div><SubmitButton>Create package</SubmitButton></div>
      </ActionForm>
    </>
  );
}
