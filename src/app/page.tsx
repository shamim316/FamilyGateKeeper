import Link from 'next/link';

const CATEGORIES = [
  { name: 'Household', detail: 'People, IDs, and the dates they expire' },
  { name: 'Home', detail: 'Utilities, appliances, paint colours, shutoffs' },
  { name: 'Vehicles', detail: 'Registration, service history, tire size' },
  { name: 'Health', detail: 'Insurance cards, doctors, allergies, medications' },
  { name: 'Money', detail: 'Accounts, cards, loans, beneficiaries' },
  { name: 'School', detail: 'Portals, bus routes, who may collect a child' },
  { name: 'Connectivity', detail: 'WiFi, phone lines, account PINs' },
  { name: 'Pets', detail: 'Microchip, vaccinations, the emergency vet' },
  { name: 'Estate', detail: 'Wills, directives, where the originals are' },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <p className="text-sm font-semibold tracking-wide text-[var(--color-accent)] uppercase">
        Family Gate Keeper
      </p>

      <h1 className="mt-3 text-4xl leading-tight font-bold text-balance">
        Everything your family needs to know, in one place you can actually find.
      </h1>

      <p className="mt-5 text-lg text-[var(--color-ink-soft)]">
        Policy numbers, account numbers, the garage code, which plumber you used, when the
        registration expires, the dog&rsquo;s microchip number. The things you need once a year and
        need badly.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/signin"
          className="inline-flex min-h-[var(--spacing-touch)] items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-accent)] px-6 font-semibold text-white transition hover:opacity-90"
        >
          Get started
        </Link>
        <Link
          href="/signin"
          className="inline-flex min-h-[var(--spacing-touch)] items-center justify-center rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] px-6 font-semibold transition hover:border-[var(--color-accent)]"
        >
          Sign in
        </Link>
      </div>

      <div className="mt-8 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-accent-soft)] p-5">
        <h2 className="font-semibold">Your secrets stay yours</h2>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          Social security numbers, account numbers, and door codes are encrypted on your device
          before they are sent anywhere. We store scrambled text we cannot read &mdash; and neither
          can anyone who steals it.
        </p>
      </div>

      <h2 className="mt-12 text-2xl font-bold">What you can keep here</h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {CATEGORIES.map((category) => (
          <li
            key={category.name}
            className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
          >
            <p className="font-semibold">{category.name}</p>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{category.detail}</p>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-sm text-[var(--color-ink-soft)]">
        In development. See <code>docs/PLAN.md</code> for what is being built and in what order.
      </p>
    </main>
  );
}
