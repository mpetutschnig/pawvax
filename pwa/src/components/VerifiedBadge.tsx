import { CheckCircle2 } from 'lucide-react';

interface VerifiedBadgeProps {
  name: string;
  verified: boolean;
  role: string;
  className?: string;
}

/**
 * Badge für verifizierte Tierärzte / Behörden
 * Zeigt ein Häkchen-Icon + Name als offizieller Eintrag an
 */
export function VerifiedBadge({ name, verified, role, className = '' }: VerifiedBadgeProps) {
  if (!verified || role !== 'vet') {
    return null;
  }

  return (
    <div
      className={`verified-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: 'var(--space-1) var(--space-2)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)', // Blue-100
        border: '1px solid rgb(59, 130, 246)', // Blue-500
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 500,
        color: 'rgb(59, 130, 246)', // Blue-500
      }}
      title={`Offizieller Eintrag von ${name}`}
    >
      <CheckCircle2 size={14} strokeWidth={2.5} />
      <span>{name}</span>
    </div>
  );
}
