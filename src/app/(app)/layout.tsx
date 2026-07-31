import { VaultProvider } from '@/lib/vault/vault-provider';

/**
 * Everything behind sign-in shares one vault session, so navigating between
 * screens does not drop the data key and force another unlock.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <VaultProvider>{children}</VaultProvider>;
}
