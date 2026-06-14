import { redirect } from 'next/navigation';

// Role selection is now part of the unified demo auth page.
// This redirect catches any bookmarks or cached links.
export default function RoleSelectPage() {
  redirect('/auth/demo?flow=staff');
}
