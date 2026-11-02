import { redirect } from 'next/navigation';

export default function GlobalFrameSlotsPage() {
  redirect('/admin/frames#generated-frame-layout');
}
