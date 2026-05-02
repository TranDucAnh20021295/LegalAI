'use client';

import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';
import { useRouter } from 'next/navigation';

export default function ForgotPasswordPage() {
  const router = useRouter();
  return (
    <ForgotPasswordForm onBack={() => router.push('/')} />
  );
}
