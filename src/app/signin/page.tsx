import { Suspense } from 'react';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in — Family Gate Keeper' };

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
