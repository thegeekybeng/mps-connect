import { redirect } from 'next/navigation';

// Legacy login page — redirects to demo auth page.
// Email/password login has been replaced by unified demo authentication.
export default function LoginPage() {
  redirect('/auth/demo?flow=staff');
}
