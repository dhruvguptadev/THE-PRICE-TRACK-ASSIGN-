import { useId } from 'react';

/** Nightwatch mark: a crescent with a small star, the same drawing as app/icon.svg. */
export default function Logo({ className = 'h-8 w-8' }) {
  const maskId = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="7" className="fill-accent" />
      <mask id={maskId}>
        <rect width="32" height="32" fill="#fff" />
        <circle cx="19.5" cy="12" r="7.6" fill="#000" />
      </mask>
      <circle cx="14" cy="17" r="9" className="fill-accent-ink" mask={`url(#${maskId})`} />
      <circle cx="21.2" cy="11.2" r="2" className="fill-accent-ink" />
    </svg>
  );
}
