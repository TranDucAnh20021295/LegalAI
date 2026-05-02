'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function AdminConfigRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/users?tab=config'); }, [router]);
  return null;
}
